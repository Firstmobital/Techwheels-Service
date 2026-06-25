# Supabase Implementation Plan: Real-Time Dynamic Physical Table for all_service_data

**Plan ID:** SUPABASE-002  
**Created:** 2026-06-20  
**Priority:** HIGH  
**Owner:** Platform Team (Supabase/Postgres)

---

## Executive Summary

This plan implements a physical table `public.all_service_data_dynamic` that is continuously synchronized with `public.all_service_data` using row-level triggers. The table will only contain rows where `chassis_no` is present and all other business-relevant fields are `NULL`.

The implementation avoids views and avoids periodic refresh jobs. It provides deterministic real-time behavior by evaluating the filter condition on every `INSERT`, `UPDATE`, and `DELETE` event in the source table.

**Risk Level:** 🟡 MEDIUM  
**Estimated Duration:** 4-6 hours  
**Rollback Strategy:** Drop trigger and sync functions; optionally drop dynamic table to fully revert.

---

## Supabase Type Foundation (CRITICAL PRE-REQUISITE)

All date/time columns in `public.all_service_data` must follow Supabase/PostgreSQL best practices:

**Date-only columns (no time, no timezone):**
- Type: `date`
- Examples: `vehicle_sale_date`, `scheduled_next_service_date`, `extended_warranty_start_date`, `extended_warranty_end_date`, `last_insurance_expiry_date`
- Rationale: Day-level precision sufficient; timezone irrelevant.

**Date + Time columns (with timezone):**
- Type: `timestamptz` (timestamp with time zone)
- Examples: `last_service_date`, `created_at`, `updated_by_robot_at`
- Rationale: Precise timestamps stored in UTC, converted to user/region timezone on read.
- IST timezone rule: When parsing IST-formatted text (e.g., `DD/MM/YYYY HH12:MI AM`), construct timestamptz using `make_timestamptz(..., 'Asia/Kolkata')`.

**Legacy text columns:**
- Current state: many date fields stored as text with mixed formats (DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY HH12:MI AM).
- Migration strategy: Correct existing columns in-place via `ALTER COLUMN ... TYPE ... USING` with safe parser functions.
- Unparseable legacy values convert to `NULL` and are tracked through checks.

**Migration path (Phase 0 - Foundation):**
- `supabase/migrations/20260622191000_correct_all_service_data_column_types_to_supabase_defaults.sql`
  - Converts existing columns in-place:
    - `vehicle_sale_date text -> date`
    - `scheduled_next_service_date text -> date`
    - `extended_warranty_start_date text -> date`
    - `extended_warranty_end_date text -> date`
    - `last_service_date text -> timestamptz`
  - Applies deterministic parsing during type conversion via `USING`
  - Creates indexes for query performance
  - Comments columns with corrected-type status

---

## Objectives

1. Create a physical target table `public.all_service_data_dynamic` with the same structure as `public.all_service_data`.
2. Ensure target table contains only rows matching the dynamic condition at any moment.
3. Keep target table synchronized in real time using trigger-based logic.
4. Provide validation and rollback runbook for safe deployment.
5. Add derived planning columns in `public.all_service_data`:
  - `assumed_next_service_date`
  - `assumed_next_service_type`
  (Phase 4 date logic approved; type-mapping logic drafted in Concrete v2).
6. Add deterministic priority-order support for third-party limited-row reads from `public.all_service_data_dynamic`.
7. Add robot-audit columns in `public.all_service_data`:
  - `updated_by_robot` (boolean)
  - `updated_by_robot_at` (timestamp with time zone)
8. Add robot-audit projection columns in `public.all_service_data_dynamic` sourced from `public.all_service_data`:
  - `updated_by_robot` (boolean)
  - `updated_by_robot_at` (timestamp with time zone)
9. Add a chassis-keyed update flow from `public.job_card_closed_data` to `public.all_service_data`, starting with value-verified source-to-target column mapping.
10. Add closed-job audit columns in `public.all_service_data`:
  - `updated_by_closed_job` (boolean)
  - `updated_by_closed_job_at` (timestamp with time zone)

---

## Context & Background

The requirement is to maintain a dynamic, queryable physical table instead of a view. Data volume can vary at any point in time based on conditional eligibility of source rows.

For `public.all_service_data`, strict interpretation of "all columns except chassis_no must be NULL" must account for technical columns. In this plan, technical columns are excluded from null-check evaluation:

1. `id`
2. `chassis_no`
3. `created_at`
4. `last_updated_at`

This prevents false rejection caused by non-business metadata defaults.

---

## Active Inclusion Conditions (Authority)

At present, `public.all_service_data_dynamic` includes a row from `public.all_service_data` when any condition below is true:

1. **Condition A - Null-bundle rule**
- `chassis_no` is present.
- All non-technical columns are `NULL`.
- Technical columns excluded from null-check: `id`, `chassis_no`, `created_at`, `last_updated_at`.

2. **Condition B - Assumed date rule**
- `chassis_no` is present.
- `assumed_next_service_date` resolves to `current_date + 2`.
- Source for `assumed_next_service_date`: derived column in `public.all_service_data` (Phase 4 logic).
- If `assumed_next_service_date` is `NULL`, Condition B is not satisfied.

3. **Condition C - Last service type text rule**
- `chassis_no` is present.
- Include rows when `last_service_type` is `NULL` or blank.
- Include rows when `last_service_type` does not contain `Service` text.

4. **Condition D - Robot update flag rule**
- `chassis_no` is present.
- Include rows when `updated_by_robot` is `NULL`.
- Include rows when `updated_by_robot` is `FALSE`.
- Include rows when source compatibility inputs represent the flag as blank.

Effective implementation source:
- `supabase/migrations/20260620210000_all_service_data_dynamic_add_yyyy_mm_dd_parser.sql` (historical parser enhancement for scheduled-date version)
- Condition-B pivot to `assumed_next_service_date`: documented in this plan and pending dedicated migration rollout.
- Condition-C (`last_service_type` null/blank/non-service-text) inclusion:
  - `supabase/migrations/20260621141000_all_service_data_dynamic_add_condition_c_last_service_type_filter.sql`
  - `supabase/sql_checks/20260621141000_all_service_data_dynamic_add_condition_c_last_service_type_filter_checks.sql`
- Condition-D (`updated_by_robot` blank/null/false) inclusion:
  - `supabase/migrations/20260623170000_all_service_data_dynamic_add_condition_d_updated_by_robot_filter.sql`
  - `supabase/sql_checks/20260623170000_all_service_data_dynamic_add_condition_d_updated_by_robot_filter_checks.sql`

## Priority Ordering for Third-Party Consumers

Problem statement:

- Third-party consumers may read only the first N rows (example: 500 rows) from `public.all_service_data_dynamic`.
- Without explicit ordering, row delivery order is not guaranteed.

Implementation track (approved design):

1. Add two columns to `public.all_service_data_dynamic`:
  - `priority_bucket integer` (lower value = higher priority)
  - `priority_score bigint` (higher value = higher rank inside bucket)
2. Populate both columns from business ordering conditions.
3. Add composite index for stable ordered access:
  - `(priority_bucket, priority_score DESC, id ASC)`
4. Update `public.sync_all_service_data_dynamic()` so new/updated rows always recalculate and persist priority fields.
5. Serve third-party clients with explicit order path:
  - REST query with `order=priority_bucket.asc,priority_score.desc,id.asc`
  - Or a dedicated RPC endpoint that applies ordered selection internally.

Confirmed ranking contract (2026-06-21):

- `sold_dealer` priority:
  - `Techwheels` first
  - `Others` second
  - `NULL`/other last
- Then `assumed_next_service_date` ascending (`NULL` last).
- Then `assumed_next_service_type` priority:
  - `First Free Service`
  - `Second Free Service`
  - `Third Free Service`
  - `Paid Service`
  - `Unknown`
  - `NULL`/blank
  - other values
- Then `vehicle_sale_date` new to old (`NULL`/unparseable last).
- Final deterministic tie-break: `id ASC`.

### Ordering Conditions Registry (Current Version)

Use this registry as the single source of truth when modifying order behavior.

1. Bucket condition (`priority_bucket`, lower first):
  - `1`: `sold_dealer = 'Techwheels'`
  - `2`: `sold_dealer = 'Others'`
  - `3`: `sold_dealer IS NULL` or any other value

2. Score condition (`priority_score`, higher first):
  - Primary score component: `assumed_next_service_date` ascending with `NULL` last
  - Secondary score component: `assumed_next_service_type` rank
    - `First Free Service`
    - `Second Free Service`
    - `Third Free Service`
    - `Paid Service`
    - `Unknown`
    - `NULL`/blank
    - other values
  - Tertiary score component: `vehicle_sale_date` new to old (`NULL`/unparseable last, exact day-level)
    - `vehicle_sale_date` is now type-aligned to `date` in source/dynamic tables; scorer call path keeps compatibility casting where required.
    - Implemented with expanded bigint score composition to avoid tertiary ties for different valid dates.

3. Final query tie-break:
  - `id ASC`

4. Canonical ordered query clause:
  - `ORDER BY priority_bucket ASC, priority_score DESC, id ASC`

### Third-Party Endpoint Patterns (No Fixed Limit)

- EV feed:
  - `/rest/v1/all_service_data_dynamic?select=*&fuel_tp=eq.EV&order=priority_bucket.asc,priority_score.desc,id.asc`
- PV feed:
  - `/rest/v1/all_service_data_dynamic?select=*&fuel_tp=eq.PV&order=priority_bucket.asc,priority_score.desc,id.asc`

### Future Modification Protocol (Order Rules)

When order conditions change in the future, update all items below in one change-set:

1. `public.calc_all_service_dynamic_priority_bucket(...)`
2. `public.calc_all_service_dynamic_priority_score(...)`
3. Backfill statement for existing dynamic rows
4. `public.sync_all_service_data_dynamic()` insert projection
5. Read-only check file for parity and ordered top-N preview
6. This section (`Ordering Conditions Registry`) in this plan document

Governance note:

- Never rely on physical row storage order.
- Ordered delivery must always be query-driven (REST `order=` or RPC-internal `ORDER BY`).

Key delivery rule:

- Priority must be enforced through query-level `ORDER BY` (or RPC-internal order), not assumed from physical table storage order.

---

## Implementation Tasks

### Phase 0 (FOUNDATION - CRITICAL FIRST): Type Correction to Supabase Defaults
- [x] **Task 0.0.1:** Run pre-apply checks (A+B) from `supabase/sql_checks/20260622191000_correct_all_service_data_column_types_to_supabase_defaults_checks.sql` to audit parse coverage.
- [x] **Task 0.0.2:** Apply type correction migration:
  - `supabase/migrations/20260622191000_correct_all_service_data_column_types_to_supabase_defaults.sql`
  - Corrects existing columns in-place to canonical Supabase types
  - Uses parser-driven `USING` expressions for text-to-typed conversion
  - Creates indexes for performance
- [x] **Task 0.0.3:** Run post-apply checks (C+D) to verify corrected data types and post-conversion non-null coverage.
- [x] **Task 0.0.4:** Gate for Phase 1+: proceed only when parse coverage is acceptable (target: zero unexplained parse failures).

Pre-foundation operating note:

- This phase establishes Supabase/PostgreSQL best practices for date/time handling.
- Existing columns are corrected in-place (no new companion columns in this phase).
- Indexes ensure query performance on corrected typed columns for sorting/filtering.

---

### Phase 0.2 (STEP 2 - NOW): Dynamic Table Alignment to In-Place Typed Baseline
- [x] **Task 0.2.1:** Correct date/time columns in `public.all_service_data_dynamic` in-place (same policy as source table).
  - Executed via `supabase/migrations/20260622200000_all_service_data_dynamic_inplace_type_alignment_and_sync.sql`.
- [x] **Task 0.2.2:** Update `public.sync_all_service_data_dynamic()` so source (`all_service_data`) to dynamic projection is type-consistent after in-place conversions.
  - Executed via `supabase/migrations/20260622200000_all_service_data_dynamic_inplace_type_alignment_and_sync.sql`.
- [x] **Task 0.2.3:** Add and run post-checks for source/dynamic type parity and row-value parity on aligned columns.
  - Executed via `supabase/sql_checks/20260622200000_all_service_data_dynamic_inplace_type_alignment_and_sync_checks.sql`.

Step 2 acceptance criteria:

- Dynamic date/time column types match source column types for aligned fields.
- Realtime sync writes do not reintroduce type drift.
- Parity checks return zero unexpected mismatches for aligned columns.

Step 2 execution evidence (2026-06-22):

- Type parity passed for all aligned fields.
- Value parity passed on joined rows: `joined_rows = 6773`, with `vehicle_sale_date_mismatch = 0`, `scheduled_next_service_date_mismatch = 0`, `last_service_date_mismatch = 0`.
- Section D sample mismatch query returned `0` rows.
- Section E trigger/function sanity checks passed for `trg_sync_all_service_data_dynamic` and `public.sync_all_service_data_dynamic()`.

---

### Phase 0 (TYPE CORRECTNESS - BASELINE CHECKS): Canonical Date Baseline Before Trigger Rollout
- [ ] **Task 0.1.1:** Run pre-apply baseline checks (A+B) from `supabase/sql_checks/20260622195000_all_service_data_canonical_dates_and_service_history_sync_checks.sql`.
- [ ] **Task 0.1.2:** Apply canonical schema/backfill migration for source and dynamic tables:
  - `supabase/migrations/20260622193000_all_service_data_add_canonical_date_columns_backfill.sql`
- [ ] **Task 0.1.3:** Apply Service-History sync migration that writes canonical typed fields:
  - `supabase/migrations/20260622194000_service_history_sync_write_canonical_datetime_columns.sql`
- [ ] **Task 0.1.4:** Run post-apply checks (C+D+E) from `supabase/sql_checks/20260622195000_all_service_data_canonical_dates_and_service_history_sync_checks.sql`.
- [ ] **Task 0.1.5:** Gate for Phase 1 trigger rollout: proceed only when mismatch counts are accepted (target state: zero unexpected mismatches).

Pre-trigger operating note:

- In Supabase SQL editor, temp schema/session behavior can vary by execution mode.
- If checks are run as separate copy/paste statements, use self-contained check blocks (inline parsing logic) to avoid session dependency on temporary helper functions.

---

### Phase 1 (SCHEMA AND PREDICATE SETUP)
- [ ] **Task 1.1:** Create `public.all_service_data_dynamic` using `CREATE TABLE ... AS SELECT ... WITH NO DATA`.
- [ ] **Task 1.2:** Add primary key on `id` and unique index on `chassis_no`.
- [ ] **Task 1.3:** Create predicate function `public.is_all_service_dynamic_match(r public.all_service_data)`.
- [ ] **Task 1.4:** Confirm predicate behavior for `NULL` semantics and JSONB field evaluation.

### Phase 2: Initial Backfill and Real-Time Sync
- [ ] **Task 2.1:** Truncate target table and run initial filtered load from source.
- [ ] **Task 2.2:** Create trigger function `public.sync_all_service_data_dynamic()` for `INSERT/UPDATE/DELETE`.
- [ ] **Task 2.3:** Create trigger `trg_sync_all_service_data_dynamic` on `public.all_service_data`.
- [ ] **Task 2.4:** Verify idempotence and re-runnable deployment behavior.
- [ ] **Task 2.8:** Add `updated_by_robot` and `updated_by_robot_at` columns to `public.all_service_data_dynamic`.
- [ ] **Task 2.9:** Update `public.sync_all_service_data_dynamic()` and backfill path to project robot-audit fields from `public.all_service_data`.
- [ ] **Task 2.10:** Add Condition D predicate branch for `updated_by_robot` inclusion (`NULL`/`FALSE` and compatibility-blank handling) with OR semantics against Conditions A/B/C.
- [ ] **Task 2.11:** Add and run read-only checks for Condition D parity between source predicate result and `public.all_service_data_dynamic`.

### Phase 3: Validation, Monitoring, and Handover
- [ ] **Task 3.1:** Validate row counts and row-level parity with source-side predicate query.
- [ ] **Task 3.2:** Validate behavior on transition cases (non-match -> match, match -> non-match).
- [ ] **Task 3.3:** Record runbook for rollback and operational checks.
- [ ] **Task 3.4:** Capture sign-off evidence and update tracker status.

### Phase 6: Priority Ordering Layer for Limited-Row Consumers
- [ ] **Task 6.1:** Add `priority_bucket` and `priority_score` columns to `public.all_service_data_dynamic`.
- [ ] **Task 6.2:** Implement deterministic priority calculation from business conditions.
- [ ] **Task 6.3:** Backfill priority fields for existing dynamic rows.
- [ ] **Task 6.4:** Add composite index on `(priority_bucket, priority_score DESC, id ASC)`.
- [ ] **Task 6.5:** Update `public.sync_all_service_data_dynamic()` to maintain priority fields on realtime changes.
- [ ] **Task 6.6:** Add third-party consumption contract using explicit ordered REST query or dedicated RPC.
- [ ] **Task 6.7:** Add read-only checks for parity and ordered top-N stability.

### Phase 4: `all_service_data` Derived Next-Service Columns (Concrete v1)
- [ ] **Task 4.1:** Add nullable columns to `public.all_service_data`:
  - `assumed_next_service_date`
  - `assumed_next_service_type`
- [ ] **Task 4.2:** Implement deterministic `assumed_next_service_date` logic based on `last_service_date` and `last_service_type`.
- [ ] **Task 4.3:** Backfill existing rows using agreed logic.
- [ ] **Task 4.4:** Add read-only validation checks for nulls, coverage, and edge-format handling.
- [ ] **Task 4.5:** Document operational ownership (when/how daily recalculation runs).
- [ ] **Task 4.6:** Keep `assumed_next_service_type` nullable until separate type-mapping rules are finalized.
- [ ] **Task 4.7:** Add robot-audit columns to `public.all_service_data`:
  - `updated_by_robot boolean`
  - `updated_by_robot_at timestamptz`
- [ ] **Task 4.8:** Document boolean input compatibility for robot flag (`TRUE/FALSE`, `T/F`, `YES/NO`, `1/0`) and timestamp-write expectations.
- [ ] **Task 4.9:** Add reusable temp backfill script for PV/EV -> `all_service_data` with idempotent column guards.
- [ ] **Task 4.10:** Add `engine_no` and `scheduled_next_service_type` target columns (created only if missing).
- [ ] **Task 4.11:** Lock final source-to-target remap contract for temp backfill execution.
- [ ] **Task 4.12:** Validate realtime source compatibility for `EV_service_history_test`/`PV_service_history_test` -> `all_service_data`.
- [ ] **Task 4.13:** Implement realtime update flow with one-row-per-chassis selector (business rule pending).
- [ ] **Task 4.22:** Finalize value-based column mapping from `job_card_closed_data` -> `all_service_data` using same-chassis evidence from authoritative dump rows.
- [ ] **Task 4.23:** Implement idempotent update/backfill migration from `job_card_closed_data` into `all_service_data` keyed by normalized chassis (`upper(btrim(...))`).
- [ ] **Task 4.24:** Add read-only parity checks for mapped columns after `job_card_closed_data` backfill/sync rollout.
- [ ] **Task 4.25:** Add `updated_by_closed_job boolean` and `updated_by_closed_job_at timestamptz` to `public.all_service_data`.
- [ ] **Task 4.26:** Enforce source gate: process only source rows where `sr_type` contains `Service` (case-insensitive).
- [ ] **Task 4.27:** Apply target match order: first by normalized chassis; if not found then by normalized `vehicle_registration_number`; if still not found then insert new target row.
- [ ] **Task 4.28:** Enforce latest-winner rule for duplicates: for repeated source rows per normalized chassis/registration, only the latest `sr_type`-contains-`Service` row is eligible.
- [ ] **Task 4.29:** Apply update freshness gate on matched target rows: update only when source `closed_date_time` is greater than target `last_service_date` (or target `last_service_date` is `NULL`).
- [ ] **Task 4.30:** Add timeout-safe chunked reconcile helper and schedule daily IST cron to run chunked reconcile (instead of full-table one-shot reconcile).

### Phase 7: Cross-Project `booking` -> `all_service_data` Sync (Source to Target)

Scope baseline (wave 1):

- Source project: `tnakgaoqyumgfxklkujl` (table: `public.booking`)
- Target project: `jmdndcphkmaljhwgzqxq` (table: `public.all_service_data`)
- Match key: normalized chassis key (`upper(btrim(...))`) on source `chassis_no` -> target `chassis_no`
- First approved mapping: source `rto_date` -> target `vehicle_sale_date`
- Additional column mappings and guards will be appended incrementally as separate sub-tasks under this phase.

Practical source -> target mapping list (documented 2026-06-25):

1. `booking.chassis_no` -> `all_service_data.chassis_no`
2. `booking.rto_date` -> `all_service_data.vehicle_sale_date`
3. `booking.engine_no` -> `all_service_data.engine_no`
4. `booking.customer_phone` -> `all_service_data.contact_phones`
5. `booking.customer_name` -> `all_service_data.first_name`
6. `booking.insurance_company_name` -> `all_service_data.last_insurance_comapny`
7. `booking.insurance_date + interval '1 year'` -> `all_service_data.last_insurance_expiry_date`
8. `booking.updated_at` -> `all_service_data.last_updated_at` (implementation may stamp system sync time where required)
9. Constant `'Techwheels'` -> `all_service_data.sold_dealer` for newly inserted target rows
10. Constant `TRUE` -> `all_service_data.updated_by_sale` for newly inserted target rows
11. Constant `now()` -> `all_service_data.updated_by_sale_at` for newly inserted target rows
12. Constant `'New'` -> `all_service_data.last_service_type` for newly inserted target rows
13. `booking.rto_date` -> `all_service_data.last_service_date` for newly inserted target rows

Derived mappings from source JSON (`booking.quote_snapshot`) for inclusion in this phase:

1. `quote_snapshot.car.name` -> `all_service_data.model`
2. `quote_snapshot.variant.name` -> `all_service_data.product_line`
3. `quote_snapshot.variant.fuel_type.label` -> deferred (do not map in this phase)

Powertrain mapping note:

- Do not map `powertrain_type` in current phase.
- Derive later from variant/product-line logic when rule set is finalized.

#### Deferred Powertrain Derivation Rule (Placeholder)

Status:

- Queued for later phase (post Wave-1 insert-only stabilization).

Scope for deferred implementation:

1. Populate `all_service_data.powertrain_type` using deterministic derivation from variant/product-line signals.
2. Keep current Phase 7 flow unchanged until derivation rules are approved and validated.

Acceptance criteria (required before enabling):

1. **Rule contract finalized:** approved mapping table/spec exists for variant/product-line -> powertrain bucket values.
2. **Deterministic output:** same input always produces same `powertrain_type`; no ambiguous fallback path.
3. **Backfill safety:** historical backfill runs idempotently and does not modify non-target columns.
4. **Coverage threshold:** at least 95% of eligible rows derive a non-null `powertrain_type` after rule application.
5. **Unknown bucket governance:** unresolved rows are explicitly tagged (`UNKNOWN` or agreed equivalent) and measurable via checks.
6. **Read-only validation checks:** SQL checks include distribution, null-rate, and top-unresolved variants/product-lines.
7. **Rollback path:** reversible migration path documented to disable derivation without impacting Wave-1 insert-only ingestion.

Locked decisions (2026-06-25):

- Sync mode: continuous incremental sync.
- Source chassis key column: `public.booking.chassis_no`.
- Target uniqueness: `public.all_service_data` is treated as no-duplicate on chassis for this integration contract.
- Update guard: target mutations occur only when mapped source value is non-null.

Locked insert-only behavior (must stay):

1. Match row by source `chassis_no` to target `chassis_no`.
2. Do not update existing target row when chassis already exists.
3. Insert new target row only if no chassis match exists.

Two-layer insert gate (approved):

1. Hard gate (mandatory core fields for insert): `chassis_no`, `rto_date`, `engine_no`, `customer_phone`, `customer_name`, `insurance_company_name`, `insurance_date` (for `+1 year` expiry derivation), and source sync timestamp (`updated_at` or equivalent cursor timestamp).
2. Soft gate (optional derived JSON fields): `quote_snapshot.car.name` (`model`), `quote_snapshot.variant.name` (`product_line`), `quote_snapshot.variant.fuel_type.label` (`powertrain_type`). Missing derived values must not block insert.

Source audit snapshot (2026-06-25, provided by user from source project SQL editor):

- Confirmed source table contract fields and types:
  - `id uuid not null` (primary key)
  - `chassis_no text` (nullable)
  - `rto_date date` (nullable)
  - `engine_no text` (nullable)
  - `customer_phone text not null`
  - `customer_name text not null`
  - `insurance_company_name text` (nullable)
  - `insurance_date date` (nullable)
  - `quote_snapshot jsonb` (nullable)
  - `updated_at timestamptz` (nullable)
  - `created_at timestamptz not null`
- Confirmed key contract:
  - `PRIMARY KEY (id)` only.
- Confirmed hard-gate eligible count:
  - `eligible_insert_rows = 706` out of `total_rows = 1656`.
- Hard-gate completeness counts:
  - `missing_chassis_no = 878`
  - `missing_rto_date = 899`
  - `missing_engine_no = 879`
  - `missing_customer_phone = 0`
  - `missing_customer_name = 0`
  - `missing_insurance_company_name = 896`
  - `missing_insurance_date = 941`
  - `missing_both_timestamps = 0`
- Duplicate chassis evidence:
  - duplicate query returned no rows (`COUNT > 1` by normalized chassis), so source currently has one row per non-null normalized chassis.
- Watermark tie evidence:
  - timestamp ties exist and require deterministic tie-break by source `id`:
    - `2026-04-23 05:18:53.208261+00` -> 8 rows
    - `2026-05-21 07:21:12.318249+00` -> 7 rows
    - `2026-06-12 11:34:00.226659+00` -> 2 rows
- Fuel label evidence from `quote_snapshot.variant.fuel_type.label`:
  - `NULL = 1292`, `EV = 282`, `CNG = 45`, `PETROL = 19`, `DIESEL = 18`.
- Hardening decisions from evidence:
  - Keep two-layer gate (hard core fields + optional derived JSON).
  - Keep direct fuel-label pass-through (`EV/CNG/PETROL/DIESEL`) to `powertrain_type` with trim/case normalization only.
  - Use incremental watermark cursor as `(COALESCE(updated_at, created_at), id)` for stable replay-safe ordering.

Execution principles:

- Do not perform cross-project joins directly inside target SQL.
- Use an integration worker (Edge Function or controlled external job) that reads source rows and applies deterministic insert-only logic to target.
- Preserve target data quality with non-destructive update rules (default: no overwrite with null/blank unless explicitly approved).

- [x] **Task 7.1:** Lock source and target contracts.
  - Confirm source primary key / change cursor field (`updated_at` or equivalent) in `public.booking`.
  - Confirm duplicate policy in target when multiple rows share normalized `chassis_no`.
- [x] **Task 7.2:** Add target-side support indexes and deterministic matcher contract.
  - Ensure normalized index exists on `public.all_service_data(chassis_no)` expression path.
  - Define one-row target winner rule for updates (latest `last_updated_at`, then `id DESC`).
- [x] **Task 7.3:** Build source extraction contract for incremental batches.
  - Batch by stable cursor (`updated_at`, `id`) with restart-safe watermark.
  - Filter out null/blank chassis from source feed.
- [x] **Task 7.4:** Implement wave-1 mapping and merge behavior.
  - Skip matched target rows by normalized chassis (insert-only mode).
  - Insert new target row when no normalized chassis match exists.
  - Apply mapping `booking.rto_date` -> `all_service_data.vehicle_sale_date` with safe date parsing.
- [x] **Task 7.5:** Add read-only validation SQL checks for parity and safety.
  - Count checks: source eligible rows, target matched rows, inserted rows, skipped rows.
  - Sample parity checks for chassis and mapped `vehicle_sale_date`.
  - Drift checks for null/blank overwrite violations.
- [ ] **Task 7.6:** Add operational rollout and scheduling.
  - One-time historical backfill runbook.
  - Recurring incremental schedule with retry + idempotence guarantees.
  - Execution logging: processed, updated, inserted, skipped, failed.
- [ ] **Task 7.7:** Extend mapping matrix (wave 2+).
  - Add new source->target mappings one by one with explicit freshness and overwrite rules.
  - For each added mapping, include matching SQL checks and evidence update in this plan.

Execution update (2026-06-25):

- Executed and verified migrations/checks promoted:
  - `20260625201000_all_service_data_booking_source_sync_contract.sql`
  - `20260625174500_all_service_data_booking_source_add_last_service_seed_from_rto_date.sql`
  - `20260625181500_all_service_data_booking_source_backfill_last_service_seed.sql`
- Booking-sync seed behavior now active for new inserts:
  - `last_service_type = 'New'`
  - `last_service_date = rto_date` (stored in target as IST timestamptz)
- Historical backfill verification (sale-sync rows):
  - `sale_rows = 85`
  - `missing_last_service_type = 0`
  - `missing_last_service_date = 0`
  - `date_not_equal_vehicle_sale_date = 0`
- Operational status:
  - One-time historical backfill: completed.
  - Recurring incremental scheduler wiring: completed and verified (job `booking-source-sync-daily-ist-plus1h`, schedule `30 19 * * *` UTC = `01:00 IST`).

Scheduler runbook (daily IST +1h):

- Desired trigger: once daily at `01:00 IST` (one hour after IST date change).
- UTC cron equivalent: `30 19 * * *`.
- Migration artifact:
  - `supabase/migrations/20260625200500_schedule_daily_ist_plus1h_booking_source_sync_incremental.sql`
- Check artifact:
  - `supabase/sql_checks/20260625200500_schedule_daily_ist_plus1h_booking_source_sync_incremental_checks.sql`
- Invocation mode in scheduler:
  - edge function `booking-source-sync` with body `{ "dry_run": false, "batch_size": 200 }`.
- Auth mode for scheduler invocation:
  - `booking-source-sync` is configured with `verify_jwt = false` in `supabase/config.toml` so cron can call without vault bearer-token dependency.

### Robot Update Audit Columns (`all_service_data`)

Required schema additions in `public.all_service_data`:

- `updated_by_robot boolean`
- `updated_by_robot_at timestamptz`

Input semantics for `updated_by_robot`:

- PostgreSQL boolean parsing already accepts: `TRUE/FALSE`, `T/F`, `YES/NO`, `ON/OFF`, and `1/0`.

Operational expectation:

- Set `updated_by_robot = true` only when an automated process mutates a row.
- Set `updated_by_robot_at` to the write timestamp for the same robot-driven mutation.
- For non-robot/manual writes, keep `updated_by_robot = false` (or `NULL` if not asserted) and `updated_by_robot_at = NULL`.

### Temporary Backfill Script Contract (PV/EV -> `all_service_data`) - Historical (Retired)

Retirement update (2026-06-24):

- This temporary backfill workflow is no longer operational.
- Legacy source tables `public."EV_Vehicle_Data"` and `public."PV_Vehicle_Data"` are now scheduled for drop.
- Historical script remains in repo only for audit traceability and must not be used in active operations.

Execution mode:

- Use a reusable script (manual run any time) instead of one-shot migration-only execution.
- Script must create missing target columns only once via `ADD COLUMN IF NOT EXISTS`.

Primary artifact:

- `scripts/20260622_reusable_backfill_all_service_data_from_pv_ev.sql`

Schema guard behavior inside script:

- Ensures columns exist in `public.all_service_data`:
  - `updated_by_robot`
  - `updated_by_robot_at`
  - `engine_no`
  - `scheduled_next_service_type`

Final source-to-target mapping (approved):

- `registration_no -> vehicle_registration_number`
- `product_name -> model`
- `vehicle_type -> product_line`
- `resale_date -> vehicle_sale_date`
- `warranty_expiry_date -> extended_warranty_end_date`
- `engine_no -> engine_no` (PV source; EV contributes `NULL`)
- `next_service_date -> scheduled_next_service_date`
- `next_service_type -> scheduled_next_service_type`
- `last_service_date -> last_service_date`
- `last_service_km -> last_service_km`
- `dealer -> last_service_dealer`
- `first_name -> first_name`
- `contact_phones -> contact_phones`
- `created_at -> updated_by_robot_at`
- constant `true -> updated_by_robot`
- `now() -> last_updated_at`

Matching and dedupe contract:

- Match by normalized `chassis_no` (`upper(btrim(...))`) from source to target.
- If same chassis exists in both PV and EV sources, pick latest `created_at` (`NULLS LAST`, deterministic source tiebreak).

Source status policy (finalized):

- If any source row for a normalized chassis has `status = 'pending'` (case-insensitive, trimmed), skip update for that chassis entirely.
- Do not write fallback values (`false`/`NULL`) for robot-audit fields in this scenario; the row is excluded from the update set.

Safety contract:

- Data update runs only when any mapped target field would change (`IS DISTINCT FROM` checks).
- Safe to rerun repeatedly; schema and data operations are idempotent by design.

### Realtime Service-History Flow Contract (Selector finalized)

Scope:

- Source event tables: `public."EV_service_history_test"`, `public."PV_service_history_test"`
- Target table: `public.all_service_data`
- Join key: normalized `chassis_no` (`upper(btrim(...))`)

Validation result from authoritative schema audit:

- The full approved remap list is not directly available from Service-History tables alone.
- `EV_service_history_test`/`PV_service_history_test` contain only:
  - `id`, `chassis_no`, `registration_no`, `odometer_reading`, `serviced_at_dealer`, `sr_type`, `service_date_time`, `contact_full_name`, `created_at`

Final mappings approved from Service-History:

- `chassis_no` as target join key
- `registration_no -> vehicle_registration_number`
- `created_at -> updated_by_robot_at`
- constant `true -> updated_by_robot`
- `now() -> last_updated_at`
- `odometer_reading -> last_service_km`
- `serviced_at_dealer -> last_service_dealer`
- `service_date_time -> last_service_date`
- `contact_full_name -> first_name`
- `sr_type -> last_service_type`

Fields not present in Service-History (out of scope for trigger update):

- `product_name -> model`
- `vehicle_type -> product_line`
- `resale_date -> vehicle_sale_date`
- `warranty_expiry_date -> extended_warranty_end_date`
- `engine_no -> engine_no`
- `next_service_date -> scheduled_next_service_date`
- `next_service_type -> scheduled_next_service_type`
- `contact_phones -> contact_phones`

Implementation direction (approved and selector finalized):

- Trigger-driven realtime capture starts from Service-History inserts/updates.
- Per chassis, exactly one source row is selected by a deterministic rule.
- Trigger updates are limited strictly to the approved Service-History mapping set.
- No enrichment join to `EV_Vehicle_Data`/`PV_Vehicle_Data` is required for this trigger flow.
- Final update writes target mappings plus robot-audit fields only when data changes.
- One-row-per-chassis selector rule (finalized):
  - prefer rows where `sr_type` contains `Service` (case-insensitive)
  - then choose latest parsed `service_date_time` (`DD/MM/YYYY HH12:MI AM`)
  - tie-break by `created_at DESC NULLS LAST`, then source rank (EV before PV), then `id DESC`
- Write-format normalization rule (finalized):
  - source `service_date_time` is parsed from `DD/MM/YYYY HH12:MI AM`
  - target `last_service_date` is written in canonical target text format `DD/MM/YY`
  - if parsing fails, target `last_service_date` is not overwritten for that row

### `job_card_closed_data` -> `all_service_data` Mapping Discovery (Value-based, chassis-matched)

Primary goal update (locked):

- Update target `public.all_service_data` from source `public.job_card_closed_data` using only the finalized mapping list below.
- Primary join key contract: `upper(btrim(job_card_closed_data.chassis_number)) = upper(btrim(all_service_data.chassis_no))`.
- Fallback join key contract: if chassis not found in target, match by `upper(btrim(vehicle_registration_number))`.
- Source gate: only process source rows where `sr_type` contains `Service` (case-insensitive).
- Duplicate-source winner rule: when multiple source rows exist for the same normalized `chassis_number` or `vehicle_registration_number`, only the latest row that satisfies the `Service` gate is valid for target write.
- If neither chassis nor registration match exists in target, insert a new target row using mapped fields.

Authoritative evidence basis:

- Source table dump rows from `COPY public.job_card_closed_data (...)` in `local_folder/backups/chunks/full_database.sql.part_001`.
- Target table dump rows from `COPY public.all_service_data (...)` in `local_folder/backups/chunks/full_database.sql.part_000`.
- Same-chassis sample rows verified during audit:
  - `MAT867013SPKD1967` (Punch / Punch Pure CNG / RJ60CG4298)
  - `MAT627611SLD13788` (Nexon / Nexon Pure + 1.5 / RJ60CE7528)
  - `MAT627502PLN35530` (Nexon / Nexon Smart + 1.2 / 23BH1070M)
  - `MAT631555MPK89557` (Harrier / Harrier XZ+ Dark Edition New / RJ45CR5016)

Final mapping list (source -> target, approved):

| Source (`job_card_closed_data`) | Target (`all_service_data`) | Value evidence on same chassis | Confidence |
|---|---|---|---|
| `chassis_number` | `chassis_no` | Exact VIN/chassis equality in verified pairs above | HIGH |
| `vehicle_registration_number` | `vehicle_registration_number` | Exact match (`RJ60CG4298`, `RJ60CE7528`, `23BH1070M`, `RJ45CR5016`) | HIGH |
| `first_name` | `first_name` | Name equality observed (`BHAWNA`, `CANTEEN STORES DEPARTMENT`, `VINOD`) | HIGH |
| `last_name` | `last_name` | Equality when present (`SHARMA`, `BELANI`); both nullable | HIGH |
| `account_phone_number` | `contact_phones` | Phone values align (`7014743487`, `9785239697`, `9610850646`) | HIGH |
| `parent_product_line` | `model` | Model-family alignment (`Punch`, `Nexon`, `Harrier`) | HIGH |
| `product_line` | `product_line` | Exact/near-exact variant text alignment (`Punch Pure CNG`, `Nexon Pure + 1.5`) | HIGH |
| `vehicle_sale_date` | `vehicle_sale_date` | Same date values on sample chassis (`2025-12-10`, `2025-07-17`, `2023-12-22`, `2022-01-19`) | HIGH |
| `sr_type` | `last_service_type` | Service-type equality (`First/Second Free Service`, `Running Repairs`, `Paid Service`) | HIGH |
| `last_service_km` | `last_service_km` | Numeric alignment on same chassis (e.g., `3500`, `14526`, `65226`) | HIGH |
| `closed_date_time` | `last_service_date` | Same service-close datetime semantics; source is datetime, target is `timestamptz` | HIGH |
| constant `'FIRST MOBITAL PVT. LTD.'` | `last_service_dealer` | Business-mandated fixed dealer stamp for this sync flow | HIGH |

Closed-job audit columns to write on successful update/insert from this flow:

- `updated_by_closed_job = true`
- `updated_by_closed_job_at = now()`
- `last_service_dealer = 'FIRST MOBITAL PVT. LTD.'`

Execution contract for this source flow:

1. Filter source rows to only those with `sr_type ILIKE '%Service%'`.
2. Build a deterministic winner set from filtered rows:
  - For same normalized `chassis_number`, keep only latest row.
  - If chassis is null/blank, group by normalized `vehicle_registration_number` and keep only latest row.
  - Latest-order sort key: `COALESCE(closed_date_time, created_date_time, updated_at, created_at) DESC`, then `id DESC` as deterministic tie-break.
3. For each winner row, attempt target match by normalized chassis (`chassis_number` -> `chassis_no`).
4. If not matched, attempt target match by normalized registration (`vehicle_registration_number`).
5. If matched, update only when source `closed_date_time` is newer than target `last_service_date` (or target `last_service_date` is `NULL`); when source datetime is older/equal, skip update.
6. If matched and freshness gate passes, update mapped target columns and stamp `last_service_dealer='FIRST MOBITAL PVT. LTD.'`.
7. If not matched by either key, insert new target row populated with mapped fields and `last_service_dealer='FIRST MOBITAL PVT. LTD.'`.
8. For both update and insert paths, set `updated_by_closed_job=true` and `updated_by_closed_job_at=now()`.
9. Use timeout-safe reconcile strategy for scheduled runs:
  - daily cron executes `public.reconcile_all_service_data_from_job_card_closed_data_chunked(...)`
  - realtime source trigger continues to call `public.refresh_all_service_data_from_job_card_closed_data(...)` per row event.

Execution order (must follow):

1. Complete Phase 0 source-table in-place correction first (`20260622191000` + checks C/D).
2. Execute Phase 0.2 Step 2 dynamic-table alignment (in-place type correction + sync update + parity checks).
3. Only after Step 2 acceptance, continue trigger rollout/adjustments for wider realtime flows.

Long-term typed-date strategy (audit-backed):

- `public.all_service_data` baseline is now corrected in-place to canonical `date` / `timestamptz` types for key business date fields.
- `public.all_service_data_dynamic` is now aligned in-place to the same typed baseline (Step 2 complete).
- Realtime sync must remain type-consistent between source and dynamic after alignment.
- Any unparseable legacy values are intentionally coerced to `NULL` and tracked through parity checks.

Data hygiene prerequisite before realtime selector rollout:

- Normalize polluted `public."EV_Service_History".chassis_no` values before using them as selector input.
- Active cleanup rule uses MAT-only VIN extraction:
  - final chassis must start with `MAT`
  - final chassis must satisfy VIN-first 17-char extraction
- Artifact pair:
  - `supabase/migrations/20260622170000_fix_ev_service_history_chassis_no_strip_registration_suffix.sql`
  - `supabase/sql_checks/20260622170000_fix_ev_service_history_chassis_no_strip_registration_suffix_checks.sql`

### Phase 4 Calculation Logic (Approved for `assumed_next_service_date`)

`DoneDays` definition:
- `DoneDays = MOD(GREATEST(0, current_date - parsed_last_service_date), 180)`

`TargetDays` mapping from `last_service_type`:
- `60` when `last_service_type` is `New`.
- `120` when `last_service_type` is `First Free Service` or `TMA-First Free Service`.
- `180` for all other values (including `Second Free Service`, `TMA-Second Free Service`, `Third Free Service`, `TMA-Third Free Service`, `Fourth Free Service`, `Fifth Free Service`, `Sixth Free Service`, `Seventh Free Service`, `Tenth Free Service`, `Paid Service`).

Final expression:
- `assumed_next_service_date = current_date + (TargetDays - DoneDays)`

Operational interpretation:
- Projection is relative to `current_date`, not directly from `last_service_date`.
- Value changes day-by-day and requires daily refresh if physically stored.
- If `assumed_next_service_type = 'Unknown'`, `assumed_next_service_date` must be `NULL` (do not assume a date).
- If `last_service_date` is missing/unparseable, `assumed_next_service_date` remains `NULL`.

### Fuel Granularity (Petrol/Diesel/CNG/EV) - Safe Design

If you want Petrol or Diesel or CNG or EV granularity, do this safely:

- Keep existing `fuel_type` semantics compatible with current platform scope rules (`EV`/`PV`) to avoid downstream access/filter regressions.
- Add a separate derived column for granular classification (recommended name: `powertrain_type`).
- Populate `powertrain_type` deterministically from `product_line` text using ordered token rules.

Recommended deterministic rule order for `powertrain_type`:

- If `product_line` is `NULL`/blank: `NULL`.
- If `product_line` contains `EV`: `EV`.
- Else if `product_line` contains `CNG`: `CNG`.
- Else if `product_line` contains diesel markers (`(D)`, `DICOR`, `QJET`, `CR4`, diesel engine-size markers): `DIESEL`.
- Else if `product_line` contains petrol markers (`(P)`, `1.2 P`, `1.0 P`, `GDI`, `PETROL`): `PETROL`.
- Else try manual override lookup from `public.all_service_data_powertrain_overrides` by `priority` (lowest first) where `is_active = true` and `UPPER(product_line) LIKE UPPER(match_pattern)`.
- Else `UNKNOWN` (strict no-fallback policy).

Override lookup semantics:

- Overrides are evaluated only after explicit product_line fuel signals fail.
- First matching active override by priority wins.
- Overrides allow controlled one-by-one resolution of recurring `UNKNOWN` product lines without changing global token rules.
- If no override matches, row remains `UNKNOWN` until a specific override is added.

Dynamic table extension (new required columns):

- Ensure `public.all_service_data_dynamic` includes source columns:
  - `vehicle_sale_date`
  - `assumed_next_service_date`
  - `assumed_next_service_type`
  - `sold_dealer`
  - `updated_by_robot`
  - `updated_by_robot_at`
- Ensure `public.all_service_data_dynamic` includes derived column:
  - `fuel_tp` (`EV` if `product_line` contains `EV` case-insensitive, else `PV`)
- Source: `public.all_service_data`.
- Purpose: keep dynamic output aligned with Phase 4 derived next-service fields while Condition B evaluates `assumed_next_service_date`.

Best rollout strategy:

- Phase A (audit-first): deploy with strict `UNKNOWN` and run distribution checks.
- Phase B (token hardening): review top `UNKNOWN` `product_line` values and add deterministic token rules.
- Phase C (override curation): add targeted override rows (`match_pattern`, `powertrain_type`, `priority`) for unresolved product lines.
- Phase D (operationalization): keep trigger-based sync on `INSERT/UPDATE OF product_line` and periodically review remaining `UNKNOWN` distribution.

### Fuel Card API Contract (Sprint-Ready)

Scope:

- New Settings card name: `Fuel`.
- Location: same settings page where other settings cards are rendered.
- Functional goal: always show top 5 pending unknown `product_line` items and allow one-click resolution to `EV`, `CNG`, `DIESEL`, or `PETROL`.

Authentication and authorization:

- Require authenticated admin session.
- Same role gate as other settings write actions (`Admin Scope` user with settings write privilege).

#### Endpoint 1: Fetch Fuel Queue (Top 5)

- Method: `GET`
- Path: `/api/settings/fuel/queue`
- Query params:
  - `limit` (optional, default `5`, max `20`)
  - `cursor` (optional; opaque string for stable pagination, not required for basic top-5 mode)

Response `200`:

```json
{
  "items": [
    {
      "product_line": "Punch Adventure Rhythm",
      "unknown_rows": 713,
      "sample_model": "Punch",
      "sample_last_service_type": "Paid Service",
      "signals": {
        "contains_ev": false,
        "contains_cng": false,
        "diesel_markers": [],
        "petrol_markers": []
      },
      "existing_override": null,
      "suggested_powertrain_type": null
    }
  ],
  "limit": 5,
  "remaining_unknown_groups": 412,
  "as_of": "2026-06-21T04:50:00Z"
}
```

Query semantics:

- Source rows: `public.all_service_data` where `powertrain_type = 'UNKNOWN'` and `product_line` not blank.
- Group by `btrim(product_line)`.
- Order: `COUNT(*) DESC`, then `product_line ASC`.
- Limit by requested `limit`.

#### Endpoint 2: Resolve One Product Line

- Method: `POST`
- Path: `/api/settings/fuel/resolve`

Request body:

```json
{
  "product_line": "Punch Adventure Rhythm",
  "powertrain_type": "PETROL",
  "priority": 10,
  "notes": "manual verified by settings fuel card"
}
```

Validation:

- `product_line` required, trimmed, max 255 chars.
- `powertrain_type` required and must be one of: `EV`, `CNG`, `DIESEL`, `PETROL`.
- `priority` optional, integer default `10`.

Transactional behavior (single DB transaction):

1. Upsert active override in `public.all_service_data_powertrain_overrides` with exact `match_pattern = product_line`.
2. Recompute `powertrain_type` only for matching rows:
   - `UPDATE public.all_service_data SET powertrain_type = public.calc_all_service_powertrain_type(product_line) WHERE btrim(product_line) = btrim($1)`
3. Return updated top 5 queue payload (same shape as fetch endpoint).

Response `200`:

```json
{
  "resolved": {
    "product_line": "Punch Adventure Rhythm",
    "powertrain_type": "PETROL",
    "affected_rows": 713
  },
  "queue": {
    "items": [],
    "limit": 5,
    "remaining_unknown_groups": 411,
    "as_of": "2026-06-21T04:51:30Z"
  }
}
```

Error responses:

- `400` invalid payload.
- `401/403` unauthorized/forbidden.
- `409` conflict on concurrent resolution (optional if optimistic lock added).
- `500` internal failure.

#### Endpoint 3: Fuel Override List (Optional Admin View)

- Method: `GET`
- Path: `/api/settings/fuel/overrides`
- Returns active/inactive overrides for review/audit.

### Fuel Card UI Interaction Specification

Card and navigation:

- New card in Settings Sections: `Fuel`.
- Subtitle: `Resolve UNKNOWN powertrain variants with exact review workflow`.
- CTA: `OPEN SECTION ->`.

Section layout:

- Header metrics:
  - `Unknown Variant Groups`
  - `Unknown Rows`
  - `Resolved Today`
- Main queue table/list with fixed page size `5`.

Queue row fields:

- `Product Line` (exact text)
- `Pending Rows` (count)
- `Suggested Signals` (badges from parser hints)
- `Select Powertrain` (dropdown: EV/CNG/DIESEL/PETROL)
- `Confirm` action button

Interaction flow:

1. On section open, call `GET /api/settings/fuel/queue?limit=5`.
2. User selects fuel value for one row and clicks `Confirm`.
3. UI calls `POST /api/settings/fuel/resolve`.
4. On success:
   - Show toast: `Resolved <product_line> -> <powertrain_type> (<affected_rows> rows)`.
   - Replace queue with returned top-5 payload so list remains 5 until backlog shrinks.
5. On failure:
   - Preserve user selection.
   - Show inline error and retry option.

Concurrency and UX guards:

- Disable `Confirm` while request is in-flight for that row.
- Prevent duplicate submissions by row-level loading state.
- If row disappears due to another admin action, refresh queue and show `Already resolved` notice.

Long-term behavior requirement:

- Queue is always computed from live `UNKNOWN` rows, so any newly arriving unknown variant automatically appears in future top-5 results.
- No fallback auto-assignment is allowed; unresolved variants must remain `UNKNOWN` until explicitly confirmed.

### DB RPC Signatures (Supabase Native, Minimum Backend)

Fresh authoritative dump audit (chunk mirror) confirms:

- `public.all_service_data` and `public.all_service_data_powertrain_overrides` exist with expected columns/triggers.
- No explicit RLS policy entries were found for these two tables in current dump snapshot.
- ACL section currently grants broad table access (`GRANT ALL`) to `anon`, `authenticated`, and `service_role` for both tables.

To keep backend code minimal and centralize validation in SQL, use these RPCs:

1. `public.rpc_fuel_queue(p_limit integer DEFAULT 5) RETURNS jsonb`
2. `public.rpc_fuel_resolve(p_product_line text, p_powertrain_type text, p_priority integer DEFAULT 10, p_notes text DEFAULT NULL, p_limit integer DEFAULT 5) RETURNS jsonb`
3. `public.rpc_fuel_overrides(p_only_active boolean DEFAULT true, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0) RETURNS TABLE (...)`

Implementation behavior (enforced in function body):

- Access gate: every RPC performs `IF NOT public.can_manage_fuel_rules() THEN RAISE EXCEPTION ...`.
- `public.can_manage_fuel_rules()` allows:
  - Admin users (`public.is_admin() = true`)
  - `service_role` callers
  - SQL editor `postgres` sessions (to avoid false-negative admin checks when `auth.uid()` is null in console context)
- Queue RPC returns API-ready JSON (`items`, `limit`, `remaining_unknown_groups`, `as_of`).
- Resolve RPC:
  - Validates inputs (`product_line` non-empty, `powertrain_type` in `EV/CNG/DIESEL/PETROL`).
  - Deactivates existing exact-match active rule(s) for the same `product_line`.
  - Inserts a new active override row.
  - Recomputes affected rows in `all_service_data` using `calc_all_service_powertrain_type(product_line)`.
  - Returns `{ resolved, queue }` JSON in one round trip.
- Overrides RPC supports paginated admin review screens.

### Supabase Policy Notes (Hardening Path)

Current risk from dump snapshot:

- Direct table grants are currently broad, which can bypass intended UI workflow if client code accesses tables directly.

Recommended enforcement model for Fuel workflow:

1. Keep API/Frontend reads+writes on Fuel flow through RPC only.
2. Restrict RPC execution to `authenticated` + `service_role` and rely on `public.can_manage_fuel_rules()` gate inside RPC.
3. Add least-privilege table hardening for `public.all_service_data_powertrain_overrides`:
   - Revoke direct write grants from `anon` and `authenticated`.
   - Optionally enable RLS and add admin-only policy for direct access paths (for SQL editor/admin tooling).
4. For `public.all_service_data`, avoid broad policy changes in same sprint unless full regression audit is performed, because this table is cross-module and currently heavily used.

Deployment artifact (ready-to-run migration draft):

- `supabase/migrations/20260621113000_all_service_data_powertrain_rpc_contract.sql`
- `supabase/migrations/20260621114500_all_service_data_powertrain_rpc_access_hotfix.sql`

Read-only validation artifact:

- `supabase/sql_checks/20260621113000_all_service_data_powertrain_rpc_contract_checks.sql`

### Implementation Status (2026-06-21)

Completed in repo:

1. Database RPC contract implemented:
  - `supabase/migrations/20260621113000_all_service_data_powertrain_rpc_contract.sql`
2. RPC access-context hotfix implemented:
  - `supabase/migrations/20260621114500_all_service_data_powertrain_rpc_access_hotfix.sql`
3. Frontend Fuel card wiring implemented end-to-end:
  - `src/lib/api/settings.ts` (RPC wrappers: queue, resolve, overrides)
  - `src/pages/SettingsPage.tsx` (new `fuel` section, top-5 queue render, dropdown selection, confirm action, queue refresh)

Observed verification outcome:

- SQL verification now succeeds for:
  - `public.rpc_fuel_queue(5)`
  - `public.rpc_fuel_resolve(...)`
  - `public.rpc_fuel_overrides(...)`
- Operational queue reduction confirmed during manual runbook execution (unknown groups decrementing after each resolve).

Next hardening step (optional, separate migration):

- Restrict direct table writes for `public.all_service_data_powertrain_overrides` (revoke broad grants, optionally enable RLS + admin-only policies) while keeping UI flow RPC-only.

---

## SQL Deployment Script (Reference)

```sql
-- 1) Physical dynamic table
CREATE TABLE IF NOT EXISTS public.all_service_data_dynamic
AS
SELECT *
FROM public.all_service_data
WITH NO DATA;

ALTER TABLE public.all_service_data_dynamic
  ADD CONSTRAINT all_service_data_dynamic_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS all_service_data_dynamic_chassis_uq
  ON public.all_service_data_dynamic (chassis_no);

-- 2) Reusable predicate (exclude technical columns from NULL check)
CREATE OR REPLACE FUNCTION public.is_all_service_dynamic_match(r public.all_service_data)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.chassis_no IS NOT NULL
    AND COALESCE(
      (
        SELECT bool_and(e.value IS NULL)
        FROM jsonb_each(
          to_jsonb(r) - ARRAY['id','chassis_no','created_at','last_updated_at']
        ) AS e(key, value)
      ),
      true
    );
$$;

-- 3) Initial load
TRUNCATE TABLE public.all_service_data_dynamic;

INSERT INTO public.all_service_data_dynamic
SELECT a.*
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);

-- 4) Real-time sync trigger
CREATE OR REPLACE FUNCTION public.sync_all_service_data_dynamic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.all_service_data_dynamic d
    WHERE d.id = OLD.id;
    RETURN OLD;
  END IF;

  -- For INSERT or UPDATE, replace mirror row deterministically
  DELETE FROM public.all_service_data_dynamic d
  WHERE d.id = NEW.id;

  IF public.is_all_service_dynamic_match(NEW) THEN
    INSERT INTO public.all_service_data_dynamic
    SELECT (NEW).*;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_all_service_data_dynamic
  ON public.all_service_data;

CREATE TRIGGER trg_sync_all_service_data_dynamic
AFTER INSERT OR UPDATE OR DELETE
ON public.all_service_data
FOR EACH ROW
EXECUTE FUNCTION public.sync_all_service_data_dynamic();
```

---

## Activity Tracker

> Update this section in real time as execution proceeds.

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 0 / 0.2
```text
✅ 0.0.1 | Run pre-apply source parse-coverage checks | Platform Team | 2026-06-22 | 2026-06-22 | Executed via supabase/sql_checks/20260622191000_correct_all_service_data_column_types_to_supabase_defaults_checks.sql (A+B)
✅ 0.0.2 | Apply source in-place type correction migration | Platform Team | 2026-06-22 | 2026-06-22 | Executed via supabase/migrations/20260622191000_correct_all_service_data_column_types_to_supabase_defaults.sql
✅ 0.0.3 | Run post-apply source checks | Platform Team | 2026-06-22 | 2026-06-22 | Executed via supabase/sql_checks/20260622191000_correct_all_service_data_column_types_to_supabase_defaults_checks.sql (C+D)
✅ 0.2.1 | Align dynamic in-place date/time types | Platform Team | 2026-06-22 | 2026-06-22 | Executed via supabase/migrations/20260622200000_all_service_data_dynamic_inplace_type_alignment_and_sync.sql
✅ 0.2.2 | Update dynamic sync function for type consistency | Platform Team | 2026-06-22 | 2026-06-22 | Included in migration 20260622200000
✅ 0.2.3 | Run source/dynamic type+value parity checks | Platform Team | 2026-06-22 | 2026-06-22 | Executed via supabase/sql_checks/20260622200000_all_service_data_dynamic_inplace_type_alignment_and_sync_checks.sql; all mismatches = 0
✅ 0.3.1 | Correct EV/PV Service_History service_date_time in-place to timestamptz | Platform Team | 2026-06-22 | 2026-06-22 | Executed via supabase/migrations/20260622203000_service_history_inplace_datetime_type_correction.sql + supabase/sql_checks/20260622203000_service_history_inplace_datetime_type_correction_checks.sql; C/D/F passed
```

### Phase 1
```text
🔄 1.1 | Create physical dynamic table | Platform Team | 2026-06-20 | - | Migration drafted in supabase/migrations/20260620200000_all_service_data_dynamic_realtime_sync.sql
🔄 1.2 | Add PK and unique index | Platform Team | 2026-06-20 | - | Included in migration file; pending DB apply
🔄 1.3 | Create predicate function | Platform Team | 2026-06-20 | - | Included in migration file; pending DB apply
⏳ 1.4 | Validate NULL semantics | Platform Team | - | - | Pending execution after deployment
```

### Phase 2
```text
🔄 2.1 | Initial truncate and backfill | Platform Team | 2026-06-20 | - | Included in migration file; pending DB apply
🔄 2.2 | Create sync trigger function | Platform Team | 2026-06-20 | - | Included in migration file; pending DB apply
🔄 2.3 | Attach trigger to source table | Platform Team | 2026-06-20 | - | Included in migration file; pending DB apply
🔄 2.4 | Re-run safety check | Platform Team | 2026-06-21 | - | Pending post-apply verification after assumed-date pivot and dynamic-column refresh migrations
✅ 2.5 | Add deterministic dynamic fuel_tp column | Platform Team | 2026-06-21 | 2026-06-21 | Implemented via supabase/migrations/20260621123000_all_service_data_dynamic_add_fuel_tp.sql
✅ 2.6 | Add dynamic sold_dealer source projection | Platform Team | 2026-06-21 | 2026-06-21 | Implemented and verified via supabase/migrations/20260621140000_all_service_data_dynamic_add_sold_dealer.sql + supabase/sql_checks/20260621140000_all_service_data_dynamic_add_sold_dealer_checks.sql
✅ 2.7 | Add dynamic vehicle_sale_date source projection | Platform Team | 2026-06-21 | 2026-06-21 | Implemented via supabase/migrations/20260621143000_all_service_data_dynamic_add_vehicle_sale_date.sql + supabase/sql_checks/20260621143000_all_service_data_dynamic_add_vehicle_sale_date_checks.sql
⏳ 2.8 | Add dynamic robot-audit columns | Platform Team | - | - | Pending migration to add updated_by_robot and updated_by_robot_at on all_service_data_dynamic
⏳ 2.9 | Project robot-audit fields in realtime sync + backfill | Platform Team | - | - | Pending sync function update and one-time dynamic-table backfill
🔄 2.10 | Add Condition D predicate branch (`updated_by_robot` null/false/compat-blank) | Platform Team | 2026-06-23 | - | Migration drafted: supabase/migrations/20260623170000_all_service_data_dynamic_add_condition_d_updated_by_robot_filter.sql (pending DB apply)
🔄 2.11 | Add Condition D parity checks | Platform Team | 2026-06-23 | - | Checks drafted: supabase/sql_checks/20260623170000_all_service_data_dynamic_add_condition_d_updated_by_robot_filter_checks.sql (pending run)
```

### Phase 3
```text
✅ 3.1 | Count parity validation | Platform Team | 2026-06-20 | 2026-06-20 | matching_rows_in_all_service_data=0, exists_matching_row=false, expected_count=0, actual_count=0
⏳ 3.2 | Transition-case validation | Platform Team | - | - | Pending execution
⏳ 3.3 | Rollback runbook note | Platform Team | - | - | Pending execution
⏳ 3.4 | Evidence and sign-off | Platform Team | - | - | Pending execution
```

### Phase 4
```text
🔄 4.7 | Add robot audit columns on all_service_data | Platform Team | 2026-06-22 | - | Migration drafted in supabase/migrations/20260622123000_all_service_data_add_updated_by_robot_columns.sql
⏳ 4.8 | Validate boolean input variants + timestamp behavior | Platform Team | - | - | Pending DB apply + checks
✅ 4.9 | Add reusable temp backfill script (PV/EV -> all_service_data) | Platform Team | 2026-06-22 | 2026-06-22 | Implemented via scripts/20260622_reusable_backfill_all_service_data_from_pv_ev.sql
✅ 4.10 | Add guarded target columns for remap | Platform Team | 2026-06-22 | 2026-06-22 | Implemented via supabase/migrations/20260622131000_all_service_data_add_engine_no_and_scheduled_next_service_type.sql and script-level IF NOT EXISTS guards
✅ 4.11 | Lock final remap contract | Platform Team | 2026-06-22 | 2026-06-22 | Mapping finalized in script and checks artifacts
✅ 4.13 | Implement realtime update flow with one-row-per-chassis selector (rule finalized) | Platform Team | 2026-06-22 | 2026-06-23 | Executed and validated through layered rollout: 20260623153000 (source retarget), 20260623195500 (contact-name compatibility), 20260623183000 (post-insert replay), 20260623193000 (delayed queue worker + backlog processing)
✅ 4.17 | Optimize Service_History realtime sync to typed service_date_time + reattach source triggers | Platform Team | 2026-06-22 | 2026-06-22 | Executed via supabase/migrations/20260622204500_optimize_service_history_sync_use_typed_datetime.sql + supabase/sql_checks/20260622204500_optimize_service_history_sync_use_typed_datetime_checks.sql; trigger/function presence and typed-path proof passed
✅ 4.18 | Soft-deprecate legacy Service_History source tables (write-block + deprecation comment) | Platform Team | 2026-06-24 | 2026-06-24 | Executed+verified and promoted: supabase/exec_success_migrations/sql/20260624103000_soft_deprecate_legacy_service_history_tables.sql + supabase/exec_success_migrations/sql_check/20260624103000_soft_deprecate_legacy_service_history_tables_checks.sql
✅ 4.19 | Enforce robot-flag freshness for +2 due rows (`assumed_next_service_date = current_date + 2`) | Platform Team | 2026-06-24 | 2026-06-24 | Executed+verified+promoted: supabase/exec_success_migrations/sql/20260624170000_all_service_data_robot_flag_freshness_for_plus2_due.sql + supabase/exec_success_migrations/sql_check/20260624170000_all_service_data_robot_flag_freshness_for_plus2_due_checks.sql (`reconcile` updated 3 rows; `stale_robot_true_plus2_rows=0`; parity 288=288)
✅ 4.20 | Schedule daily IST reconcile for robot-flag freshness | Platform Team | 2026-06-24 | 2026-06-24 | Executed+verified+promoted: supabase/exec_success_migrations/sql/20260624173000_schedule_daily_ist_robot_flag_freshness_reconcile.sql + supabase/exec_success_migrations/sql_check/20260624173000_schedule_daily_ist_robot_flag_freshness_reconcile_checks.sql (`matching_job_rows=1`; cron `30 18 * * *` UTC = `00:00 IST`)
✅ 4.21 | Drop legacy service/vehicle source tables (`EV_Service_History`, `PV_Service_History`, `EV_Vehicle_Data`, `PV_Vehicle_Data`) | Platform Team | 2026-06-24 | 2026-06-24 | Executed+verified+promoted: supabase/exec_success_migrations/sql/20260624190000_drop_legacy_service_and_vehicle_source_tables.sql + supabase/exec_success_migrations/sql_check/20260624190000_drop_legacy_service_and_vehicle_source_tables_checks.sql (all four `to_regclass` checks null; `dropped_table_count=4`; `remaining_table_count=0`; no rows in guardrail scans)
✅ 4.22 | Finalize value-based mapping (`job_card_closed_data` -> `all_service_data`) | Platform Team | 2026-06-25 | 2026-06-25 | Mapping locked in plan and implemented in `20260625113000`; includes source gate, winner selector, chassis-first/VRN-fallback matching
✅ 4.23 | Implement idempotent winner-sync migration for closed-job source | Platform Team | 2026-06-25 | 2026-06-25 | Executed via `supabase/migrations/20260625113000_all_service_data_sync_from_job_card_closed_data_service_winner.sql`
✅ 4.24 | Add read-only parity/validation checks for closed-job sync | Platform Team | 2026-06-25 | 2026-06-25 | Implemented via `supabase/sql_checks/20260625113000_all_service_data_sync_from_job_card_closed_data_service_winner_checks.sql`
✅ 4.25 | Add closed-job audit columns on all_service_data | Platform Team | 2026-06-25 | 2026-06-25 | `updated_by_closed_job`, `updated_by_closed_job_at` added in migration `20260625113000`
✅ 4.26 | Enforce source Service gate | Platform Team | 2026-06-25 | 2026-06-25 | `sr_type ILIKE '%Service%'` implemented in source filter
✅ 4.27 | Enforce target match order (chassis -> VRN -> insert) | Platform Team | 2026-06-25 | 2026-06-25 | Implemented in migration `20260625113000`
✅ 4.28 | Enforce latest winner selection for duplicate source keys | Platform Team | 2026-06-25 | 2026-06-25 | Winner sort: `COALESCE(closed_date_time, created_date_time, updated_at, created_at) DESC, id DESC`
✅ 4.29 | Apply freshness gate + dealer backfill exception | Platform Team | 2026-06-25 | 2026-06-25 | Update path requires newer source `closed_date_time` OR target null OR target dealer null; dealer stamped to `FIRST MOBITAL PVT. LTD.`
✅ 4.30 | Add chunked reconcile helper and daily IST chunked cron | Platform Team | 2026-06-25 | 2026-06-25 | Added `public.reconcile_all_service_data_from_job_card_closed_data_chunked(...)`; scheduler now calls chunked helper via `20260625123000`
🔄 4.14 | Add canonical typed date companions + backfill (source + dynamic) | Platform Team | 2026-06-22 | - | Drafted via supabase/migrations/20260622193000_all_service_data_add_canonical_date_columns_backfill.sql (all_service_data + all_service_data_dynamic + dynamic sync projection update)
🔄 4.15 | Upgrade Service-History sync to canonical typed writes | Platform Team | 2026-06-22 | - | Drafted via supabase/migrations/20260622194000_service_history_sync_write_canonical_datetime_columns.sql
🔄 4.16 | Canonical date parse coverage + mismatch checks (source + dynamic) | Platform Team | 2026-06-22 | - | Drafted via supabase/sql_checks/20260622195000_all_service_data_canonical_dates_and_service_history_sync_checks.sql (includes dynamic typed-column parity)
```

### Phase 5 (Fuel / Powertrain Workflow)
```text
✅ 5.1 | Add granular powertrain derivation + trigger sync | Platform Team | 2026-06-21 | 2026-06-21 | Implemented via supabase/migrations/20260621100000_all_service_data_powertrain_type_granularity.sql
✅ 5.2 | Add UNKNOWN-focused validation checks | Platform Team | 2026-06-21 | 2026-06-21 | Implemented via supabase/sql_checks/20260621100000_all_service_data_powertrain_type_granularity_checks.sql
✅ 5.3 | Implement Fuel RPC contract (queue/resolve/overrides) | Platform Team | 2026-06-21 | 2026-06-21 | Implemented via supabase/migrations/20260621113000_all_service_data_powertrain_rpc_contract.sql
✅ 5.4 | Apply RPC access-context hotfix | Platform Team | 2026-06-21 | 2026-06-21 | Implemented via supabase/migrations/20260621114500_all_service_data_powertrain_rpc_access_hotfix.sql
✅ 5.5 | Validate RPC behavior from SQL checks | Platform Team | 2026-06-21 | 2026-06-21 | Queue/resolve/override checks passed via supabase/sql_checks/20260621113000_all_service_data_powertrain_rpc_contract_checks.sql
✅ 5.6 | Wire Fuel card in Settings UI end-to-end | Platform Team | 2026-06-21 | 2026-06-21 | Implemented in src/lib/api/settings.ts + src/pages/SettingsPage.tsx (top-5 queue, confirm resolve, refresh)
🔄 5.7 | Override curation backlog burn-down | Ops + Platform | 2026-06-21 | - | In progress through repeated rpc_fuel_resolve queue workflow
⏳ 5.8 | Direct-table hardening (optional) | Platform Team | - | - | Pending separate migration to reduce broad grants/RLS hardening on all_service_data_powertrain_overrides
```

### Phase 6 (Priority Ordering for Third-Party Top-N)
```text
✅ 6.1 | Add priority columns on dynamic table | Platform Team | 2026-06-21 | 2026-06-21 | Implemented via supabase/migrations/20260621142000_all_service_data_dynamic_priority_ordering_layer.sql
✅ 6.2 | Define business condition-to-priority mapping | Product + Platform | 2026-06-21 | 2026-06-21 | Confirmed ranking: sold_dealer -> date(NULL last) -> type -> vehicle_sale_date(new-to-old, NULL/unparseable last) -> id
✅ 6.3 | Backfill existing dynamic rows with priority values | Platform Team | 2026-06-21 | 2026-06-21 | Implemented in migration 20260621142000
✅ 6.4 | Add composite index for ordered reads | Platform Team | 2026-06-21 | 2026-06-21 | Implemented index: (priority_bucket, priority_score DESC, id ASC)
✅ 6.5 | Keep sync function priority-aware | Platform Team | 2026-06-21 | 2026-06-21 | sync_all_service_data_dynamic updated in migration 20260621142000
🔄 6.6 | Publish ordered REST/RPC consumption contract | Platform Team | 2026-06-21 | - | In progress; recommended REST order=priority_bucket.asc,priority_score.desc,id.asc
✅ 6.7 | Ordered top-N validation checks | Platform Team | 2026-06-21 | 2026-06-21 | Created supabase/sql_checks/20260621142000_all_service_data_dynamic_priority_ordering_layer_checks.sql
✅ 6.8 | Add vehicle_sale_date as tertiary score condition | Platform Team | 2026-06-21 | 2026-06-21 | Implemented via supabase/migrations/20260621144000_all_service_data_dynamic_priority_score_add_vehicle_sale_date.sql + supabase/sql_checks/20260621144000_all_service_data_dynamic_priority_score_add_vehicle_sale_date_checks.sql
✅ 6.9 | Make tertiary vehicle_sale_date ordering exact (day-level) | Platform Team | 2026-06-21 | 2026-06-21 | Implemented via supabase/migrations/20260621150000_all_service_data_dynamic_priority_score_exact_vehicle_sale_date.sql + supabase/sql_checks/20260621150000_all_service_data_dynamic_priority_score_exact_vehicle_sale_date_checks.sql
```

### Phase 7 (Cross-Project booking -> all_service_data Sync)
```text
✅ 7.1 | Lock source/target contracts and duplicate policy | Platform Team | 2026-06-25 | 2026-06-25 | Locked: continuous sync, source key=booking.chassis_no, target no-duplicate policy, existing chassis rows are skipped
✅ 7.2 | Add target matcher/index contract | Platform Team | 2026-06-25 | 2026-06-25 | Verified indexes (`idx_all_service_data_chassis_no_norm`, `idx_all_service_data_new_chassis_number_unique`) and executed contract migration `supabase/exec_success_migrations/sql/20260625201000_all_service_data_booking_source_sync_contract.sql`
✅ 7.3 | Build incremental source extraction contract | Platform Team | 2026-06-25 | 2026-06-25 | Watermark state (`public.integration_sync_state`) and cursor `(COALESCE(updated_at, created_at), id)` implemented in `supabase/functions/booking-source-sync/index.ts`
✅ 7.4 | Implement wave-1 mapping merge (rto_date -> vehicle_sale_date) | Platform Team | 2026-06-25 | 2026-06-25 | Insert-only helper live; mapping extended with `last_service_type='New'` and `last_service_date=rto_date` via executed migration `20260625174500...`
✅ 7.5 | Add read-only parity + safety checks | Platform Team | 2026-06-25 | 2026-06-25 | Executed checks archived under `supabase/exec_success_migrations/sql_check/` for prefixes `20260625201000`, `20260625174500`, and `20260625181500`; validation passed
✅ 7.6 | Rollout runbook + scheduler | Platform Team | 2026-06-25 | 2026-06-25 | One-time historical backfill completed (`20260625181500...`); daily IST+1h scheduler executed and verified via prefix `20260625200500`
⏳ 7.7 | Extend mapping matrix wave-2+ | Platform Team | - | - | Pending additional business mapping rules
```

---

## Dependencies & Prerequisites

- [ ] Access to run DDL in target database.
- [ ] Confirmation that empty strings should not be treated as NULL (or adjust predicate accordingly).
- [ ] Change window for trigger deployment.
- [ ] Post-deploy observer assigned for 24-hour monitoring.
- [ ] Business-rule sign-off for `assumed_next_service_type` mapping from `last_service_type` (date logic approved).

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Trigger overhead on heavy write load | Medium | Medium | Keep trigger logic minimal and indexed on `id`; monitor write latency post-deploy |
| Incorrect filter interpretation (NULL vs empty string) | Medium | High | Confirm semantic rule before production rollout |
| Duplicate-key conflict during migration rerun | Low | Medium | Use deterministic delete-then-insert approach already included |
| Drift if trigger disabled accidentally | Low | High | Add operational check and alert in runbook |

---

## Success Criteria

- ✅ `all_service_data_dynamic` exists as physical table with expected constraints.
- ✅ Row count always matches source predicate result.
- ✅ Insert/update/delete changes in source are reflected in target in real time.
- ✅ Rollback steps documented and tested.

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Product Owner: _______________ (Signature) (Date)
- [ ] Backend Lead: _______________ (Signature) (Date)
- [ ] DBA/Platform Owner: _______________ (Signature) (Date)

---

## Execution Notes

### 2026-06-25 - Closed-job winner-sync rollout executed (with chunked daily reconcile)

- Core migration executed:
  - `supabase/migrations/20260625113000_all_service_data_sync_from_job_card_closed_data_service_winner.sql`
- Scheduler migration executed:
  - `supabase/migrations/20260625123000_schedule_daily_ist_job_card_closed_service_winner_reconcile.sql`
- Supporting read-only checks:
  - `supabase/sql_checks/20260625113000_all_service_data_sync_from_job_card_closed_data_service_winner_checks.sql`
  - `supabase/sql_checks/20260625123000_schedule_daily_ist_job_card_closed_service_winner_reconcile_checks.sql`
  - `supabase/sql_checks/20260625124000_manual_chunked_backfill_job_card_closed_service_winner.sql`
- Implemented contracts:
  - source gate: `sr_type ILIKE '%Service%'`
  - winner selector per normalized key using latest timestamp (`COALESCE(...) DESC, id DESC`)
  - target match order: chassis -> VRN fallback -> insert
  - freshness gate: update when source `closed_date_time` is newer than target, with dealer-backfill exception when target dealer is null
  - dealer stamp: `last_service_dealer = 'FIRST MOBITAL PVT. LTD.'`
  - audit stamp: `updated_by_closed_job=true`, `updated_by_closed_job_at=now()`
- Daily job status:
  - job name: `all-service-data-closed-job-winner-sync-daily-ist`
  - schedule: `30 18 * * *` (UTC) => `00:00 IST`
  - command now calls chunked reconcile helper:
    `select public.reconcile_all_service_data_from_job_card_closed_data_chunked(1000, null);`
- Runtime verification outcome:
  - `pg_cron` installed (`extversion=1.6.4`)
  - exactly one active matching job
  - checks confirm cron command uses chunked reconcile helper

### 2026-06-24 - Full legacy source retirement (all 4 legacy tables) executed, verified, and promoted

- Decision update:
  - Legacy tables are approved for immediate retirement to remove operational confusion.
  - Scope: `public."EV_Service_History"`, `public."PV_Service_History"`, `public."EV_Vehicle_Data"`, `public."PV_Vehicle_Data"`.
- Executed migration (now promoted):
  - `supabase/exec_success_migrations/sql/20260624190000_drop_legacy_service_and_vehicle_source_tables.sql`
- Executed read-only verification (now promoted):
  - `supabase/exec_success_migrations/sql_check/20260624190000_drop_legacy_service_and_vehicle_source_tables_checks.sql`
- Validation gates in checks file:
  - all four tables absent via `to_regclass(...) is null`
  - hard assertion summary: dropped count 4, remaining count 0
  - no public function text references to dropped table names
  - no triggers attached to dropped table names
- Validation snapshot (reported from execution):
  - `ev_service_history_regclass = null`
  - `pv_service_history_regclass = null`
  - `ev_vehicle_data_regclass = null`
  - `pv_vehicle_data_regclass = null`
  - `dropped_table_count = 4`
  - `remaining_table_count = 0`
  - no rows returned in remaining guardrail scans

### 2026-06-24 - Daily IST pg_cron schedule for robot-flag freshness executed, verified, and promoted

- Executed migration (now promoted):
  - `supabase/exec_success_migrations/sql/20260624173000_schedule_daily_ist_robot_flag_freshness_reconcile.sql`
- Executed read-only verification (now promoted):
  - `supabase/exec_success_migrations/sql_check/20260624173000_schedule_daily_ist_robot_flag_freshness_reconcile_checks.sql`
- Job contract:
  - job name: `all-service-data-robot-flag-freshness-daily-ist`
  - schedule: `30 18 * * *` (UTC), which aligns to `00:00 IST` daily
  - command: `SELECT public.reconcile_all_service_data_robot_flag_freshness_for_plus2_due();`
- Idempotence behavior in migration:
  - checks `pg_cron` extension presence
  - unschedules existing same-name job when present
  - re-schedules canonical daily job definition
- Validation snapshot:
  - `pg_cron` present (`extversion=1.6.4`)
  - job present and active in `cron.job`
  - `matching_job_rows=1`

### 2026-06-24 - Robot-flag freshness guard for +2 due condition executed, verified, and promoted

- Executed migration (now promoted):
  - `supabase/exec_success_migrations/sql/20260624170000_all_service_data_robot_flag_freshness_for_plus2_due.sql`
- Executed read-only verification (now promoted):
  - `supabase/exec_success_migrations/sql_check/20260624170000_all_service_data_robot_flag_freshness_for_plus2_due_checks.sql`
- Rule enforced in source table (`public.all_service_data`):
  - when `assumed_next_service_date = current_date + 2`
  - and `updated_by_robot = true`
  - and `updated_by_robot_at` is null or not today (IST),
  - then force `updated_by_robot = false` and `updated_by_robot_at = NULL`.
- Implementation details:
  - BEFORE trigger function: `public.enforce_all_service_data_robot_flag_freshness_for_plus2_due()`
  - Trigger: `trg_enforce_all_service_data_robot_flag_freshness_for_plus2_due` on `public.all_service_data`
  - Reconcile helper: `public.reconcile_all_service_data_robot_flag_freshness_for_plus2_due()`
  - Migration includes immediate reconcile call so existing stale rows are corrected once at apply time.
- Dynamic-table effect:
  - no direct dynamic-table trigger change required; existing source->dynamic sync reflects `updated_by_robot=false` automatically after source update.
- Validation snapshot:
  - immediate reconcile returned `3` updated rows
  - `stale_robot_true_plus2_rows=0`
  - parity check matched: `expected_false_count=288`, `actual_false_count=288`

Operational caveat:

- Trigger handles future row writes. For day-rollover correction when rows are not written, run reconcile helper periodically (manual or cron).

### 2026-06-24 - Authority audit using baseline dump + post-dump overlay (current truth)

- Baseline marker used:
  - `supabase/evidence/authoritative_dump_manifest.json`
  - `created_at_utc`: `2026-06-24T10:21:01Z`
  - `sha256`: `56bc9448d6f2f00ff5be1bb7f6d4f6abb9de558893ec3e22c7e71de1205c839d`
- Access mirror source for dump-sized reads:
  - `local_folder/backups/chunks/full_database.sql.part_*`
- Post-dump overlay source used:
  - `supabase/evidence/post_dump_verified_promotions.md`
  - Verified promotion window entry:
    - prefix `20260624103000`
    - migration `20260624103000_soft_deprecate_legacy_service_history_tables.sql`
    - checks `20260624103000_soft_deprecate_legacy_service_history_tables_checks.sql`
- Overlay execution status (validated via check output):
  - Legacy source tables marked deprecated:
    - `public."EV_Service_History"`
    - `public."PV_Service_History"`
  - App-facing write privileges removed on legacy tables for `anon` and `authenticated`.
  - Realtime sync triggers remain correctly bound to test source tables:
    - `public."EV_service_history_test"`
    - `public."PV_service_history_test"`

Operational truth note:

- For this plan, current DB truth is interpreted as `baseline dump` + `post-dump verified overlay` until the next dump refresh resets overlay window.

### 2026-06-23 - Service-History winner-sync durability rollout executed and validated

- Compatibility hotfix executed successfully:
  - `supabase/migrations/20260623195500_service_history_refresh_contact_name_compat_fix.sql`
  - Validation confirmed function now supports both source column variants:
    - `contact_full_name`
    - `conatct_full_name`
  - Environment drift validated:
    - `EV_service_history_test`: `has_contact_full_name=0`, `has_conatct_full_name=1`
    - `PV_service_history_test`: `has_contact_full_name=1`, `has_conatct_full_name=0`
- Post-insert replay migration executed successfully:
  - `supabase/migrations/20260623183000_all_service_data_post_insert_history_sync_and_backfill.sql`
  - Checks passed for trigger/function presence and sample parity (`target_matches_chosen=true`).
  - Backfill coverage snapshot: `target_rows_with_any_history=95`.
- Delayed queue migration executed successfully:
  - `supabase/migrations/20260623193000_all_service_history_delayed_sync_queue_and_backfill.sql`
  - Worker processing result: `processed_count=96`, `remaining_due_count=0`.
  - Queue/worker checks passed:
    - `all_service_history_sync_queue` table exists
    - enqueue + processor functions exist
    - trigger helpers enqueue and do not call direct refresh
    - cron job active: `all-service-history-sync-queue-worker` on `* * * * *`
  - Known chassis parity proof (`MAT627165JLJ40356`):
    - chosen source id `cc7ea02f-2df7-4e2e-bc37-0b694a69cebb`
    - target alignment passed (`target_matches_chosen=true`) for `last_service_type`, `last_service_date`, `last_service_km`

Operational conclusion:

- Final objective is met: winning Service-History candidate now updates target `all_service_data.last_service_type` and `all_service_data.last_service_date` correctly, including late-created targets and batch/delay race windows.

### 2026-06-23 - Condition D implementation artifacts drafted (`updated_by_robot` null/false/blank)

- Dedicated migration drafted:
  - `supabase/migrations/20260623170000_all_service_data_dynamic_add_condition_d_updated_by_robot_filter.sql`
- Dedicated read-only checks drafted:
  - `supabase/sql_checks/20260623170000_all_service_data_dynamic_add_condition_d_updated_by_robot_filter_checks.sql`
- Migration scope:
  - updates `public.is_all_service_dynamic_match(public.all_service_data)` to add OR Condition D using compatibility-safe normalization on `updated_by_robot::text`
  - preserves existing Conditions A/B/C branches
  - updates function comment to include Condition D
  - triggers immediate dynamic reconcile (`refresh_all_service_data_dynamic_full()` when available, fallback inline upsert/delete reconcile when not)
- Status:
  - artifacts are drafted in repo; DB apply and check execution pending.

### 2026-06-23 - Authoritative dump audit + source-table retarget fix (`*_test`)

- Audit source used (authority preserved):
  - `local_folder/backups/chunks/full_database.sql.part_000`
  - `local_folder/backups/chunks/full_database.sql.part_004`
- Confirmed drift in active DB dump:
  - Both legacy and test service-history tables exist.
  - Realtime triggers were still attached to legacy sources:
    - `trg_sync_all_service_data_from_ev_service_history` on `public."EV_Service_History"`
    - `trg_sync_all_service_data_from_pv_service_history` on `public."PV_Service_History"`
  - `public.refresh_all_service_data_from_service_history(text)` still selected from legacy tables.
  - Function body contained stale `all_service_data.last_service_at` references not present in current authoritative `public.all_service_data` table definition.
- Corrective migration artifact created (pending DB apply):
  - `supabase/migrations/20260623153000_rewire_service_history_realtime_sync_to_test_tables.sql`
- Read-only verification artifact created:
  - `supabase/sql_checks/20260623153000_rewire_service_history_realtime_sync_to_test_tables_checks.sql`
- Fix scope implemented in migration:
  - rewires source union to `public."EV_service_history_test"` and `public."PV_service_history_test"`
  - removes stale `last_service_at` writes/compare logic
  - detaches legacy-table triggers and reattaches same trigger names on `*_test` tables
- Late-target durability artifacts created (pending DB apply):
  - `supabase/migrations/20260623183000_all_service_data_post_insert_history_sync_and_backfill.sql`
  - `supabase/sql_checks/20260623183000_all_service_data_post_insert_history_sync_and_backfill_checks.sql`
  - Adds `AFTER INSERT` trigger on `public.all_service_data` to invoke `public.refresh_all_service_data_from_service_history(NEW.chassis_no)`.
  - Replays historical chassis keys once so old cases are auto-corrected from existing `*_test` history rows.
- Validation outcomes (post-apply checks):
  - function text checks passed: `uses_ev_test=true`, `uses_pv_test=true`, `still_uses_ev_legacy=false`, `still_uses_pv_legacy=false`, `still_references_last_service_at=false`
  - trigger binding checks passed on test tables:
    - `trg_sync_all_service_data_from_ev_service_history` on `public."EV_service_history_test"`
    - `trg_sync_all_service_data_from_pv_service_history` on `public."PV_service_history_test"`
  - legacy-trigger absence check returned `0` rows (no stale realtime trigger on legacy tables)
  - source-row sanity: `EV_service_history_test=39`, `PV_service_history_test=704`

### 2026-06-22 - Service_History sync optimization (typed datetime path) executed and validated

- Applied migration:
  - `supabase/migrations/20260622204500_optimize_service_history_sync_use_typed_datetime.sql`
- Ran validation checks:
  - `supabase/sql_checks/20260622204500_optimize_service_history_sync_use_typed_datetime_checks.sql`
- Trigger presence (Section A):
  - `trg_sync_all_service_data_from_ev_service_history` present on `public."EV_Service_History"`
  - `trg_sync_all_service_data_from_pv_service_history` present on `public."PV_Service_History"`
- Function presence (Section B):
  - `public.refresh_all_service_data_from_service_history(p_chassis_key text) returns void`
  - `public.trg_sync_all_service_data_from_service_history() returns trigger`
- Optimization proof (Section C):
  - `uses_typed_service_date_time_path = true`
  - `direct_typed_assignment_present = true`
- Source type guard (Section D): all checks `type_ok = true` for:
  - `EV_Service_History.created_at`
  - `EV_Service_History.service_date_time`
  - `PV_Service_History.created_at`
  - `PV_Service_History.service_date_time`

### 2026-06-22 - Service_History in-place datetime type correction executed and validated

- Applied migration:
  - `supabase/migrations/20260622203000_service_history_inplace_datetime_type_correction.sql`
- Ran validation checks:
  - `supabase/sql_checks/20260622203000_service_history_inplace_datetime_type_correction_checks.sql`
- Post-apply type verification (Section C):
  - `EV_Service_History.created_at`: `timestamp with time zone` (match=true)
  - `EV_Service_History.service_date_time`: `timestamp with time zone` (match=true)
  - `PV_Service_History.created_at`: `timestamp with time zone` (match=true)
  - `PV_Service_History.service_date_time`: `timestamp with time zone` (match=true)
- Post-apply runtime sanity (Section D):
  - `EV_Service_History`: `total_rows=367`, `service_date_time_non_null=365`, `created_at_non_null=367`, runtime types both `timestamp with time zone`
  - `PV_Service_History`: `total_rows=1662`, `service_date_time_non_null=1662`, `created_at_non_null=1662`, runtime types both `timestamp with time zone`
- Sample inspection (Section E): timestamps are now stored as timezone-aware values.
- Parser compatibility (Section F): both overloads present for `public.parse_service_history_datetime_ist`:
  - `p_text text -> timestamptz`
  - `p_ts timestamptz -> timestamptz`

### 2026-06-22 - Step 2 dynamic in-place alignment executed and validated

- Applied migration:
  - `supabase/migrations/20260622200000_all_service_data_dynamic_inplace_type_alignment_and_sync.sql`
- Ran validation checks:
  - `supabase/sql_checks/20260622200000_all_service_data_dynamic_inplace_type_alignment_and_sync_checks.sql`
- Confirmed type parity (source vs dynamic):
  - `last_service_date`: `timestamp with time zone` vs `timestamp with time zone`
  - `scheduled_next_service_date`: `date` vs `date`
  - `vehicle_sale_date`: `date` vs `date`
- Confirmed value parity on joined rows:
  - `joined_rows = 6773`
  - `vehicle_sale_date_mismatch = 0`
  - `scheduled_next_service_date_mismatch = 0`
  - `last_service_date_mismatch = 0`
- Section D mismatch sample returned zero rows.
- Section E confirmed trigger/function sanity for `trg_sync_all_service_data_dynamic` and `public.sync_all_service_data_dynamic()`.

### 2026-06-22 - EV_Service_History chassis cleanup hardened (MAT-only VIN rule)

- Cleanup migration expanded to handle polluted `chassis_no` strings even when `registration_no` is itself malformed.
- Final extraction policy locked to MAT-only VIN rule:
  - output must match `MAT` prefix and 17-char VIN-first normalization
  - non-MAT outputs are excluded from update and left for manual review
- Checks file corrected for SQL editor behavior by making each query block self-contained (CTE scope fix).
- Final artifact pair:
  - `supabase/migrations/20260622170000_fix_ev_service_history_chassis_no_strip_registration_suffix.sql`
  - `supabase/sql_checks/20260622170000_fix_ev_service_history_chassis_no_strip_registration_suffix_checks.sql`

### 2026-06-22 - Realtime Service-History mapping validation recorded

- Validation completed for proposed realtime path from `EV_Service_History` and `PV_Service_History` to `all_service_data`.
- Finding: Service-History tables alone do not carry full approved remap fields (`product_name`, `vehicle_type`, `resale_date`, `warranty_expiry_date`, `engine_no`, `next_service_*`, `contact_phones`).
- Plan updated with a compatibility matrix:
  - final approved Service-History mappings include `registration_no`, `created_at`, `odometer_reading`, `serviced_at_dealer`, `service_date_time`, `contact_full_name`, `sr_type`, plus constants (`updated_by_robot=true`, `last_updated_at=now()`) and `chassis_no` join key
  - non-present fields are explicitly out of scope for this trigger flow (no enrichment join required)
- One-row-per-chassis selector rule finalized:
  - prefer `sr_type` containing `Service` (case-insensitive)
  - then latest parsed `service_date_time` (`DD/MM/YYYY HH12:MI AM`)
  - tie-break by `created_at DESC NULLS LAST`, then source rank (EV before PV), then `id DESC`

### 2026-06-22 - Realtime Service-History trigger migration drafted (no enrichment)

- Trigger-driven realtime update migration drafted for:
  - `public."EV_Service_History"`
  - `public."PV_Service_History"`
- Target update scope is strictly the approved Service-History mapping set only.
- No enrichment joins to `EV_Vehicle_Data` / `PV_Vehicle_Data` are used.
- Function + trigger artifacts created:
  - `public.refresh_all_service_data_from_service_history(text)`
  - `public.trg_sync_all_service_data_from_service_history()`
  - `trg_sync_all_service_data_from_ev_service_history`
  - `trg_sync_all_service_data_from_pv_service_history`
- Final row selector used in migration:
  - `sr_type` containing `Service` first (case-insensitive)
  - then latest parsed `service_date_time` (`DD/MM/YYYY HH12:MI AM`)
  - then `created_at DESC NULLS LAST`, source rank (EV before PV), then `id DESC`
- Final write-format rule used in migration:
  - parse source `service_date_time` using `DD/MM/YYYY HH12:MI AM`
  - write target `last_service_date` as canonical `DD/MM/YY`
  - skip `last_service_date` overwrite when parse fails
- Artifact pair:
  - `supabase/migrations/20260622180000_all_service_data_realtime_sync_from_service_history.sql`
  - `supabase/sql_checks/20260622180000_all_service_data_realtime_sync_from_service_history_checks.sql`

### 2026-06-22 - Authoritative dump audit for date-format policy (full_database mirror)

- Audit source used (authority preserved):
  - `local_folder/backups/chunks/full_database.sql.part_000`
- Confirmed schema facts:
  - `public.all_service_data.last_service_date` is `text`
  - `public."EV_Service_History".service_date_time` and `public."PV_Service_History".service_date_time` are `text`
- Source format evidence from dump data:
  - PV `service_date_time`: `1662/1662` rows match `DD/MM/YYYY HH:MI AM/PM`
  - EV `service_date_time`: `365/365` non-null rows match `DD/MM/YYYY HH:MI AM/PM` (2 null rows)
- Target format evidence from dump data (`all_service_data.last_service_date` non-null `44375` rows):
  - `DD/MM/YY`: `34206`
  - `YYYY/MM/DD`: `8654`
  - `DD/MM/YYYY`: `1515`
- Decision applied for realtime Service-History writes:
  - canonical target write format = `DD/MM/YY`
  - this normalizes incoming Service-History datetime text to current dominant target pattern.

### 2026-06-22 - Canonical typed-date migration set drafted (long-term)

- Whole-schema audit anchors from authoritative dump mirror:
  - `local_folder/backups/chunks/full_database.sql.part_000` table definitions:
    - `public.all_service_data` (mixed `text` + `date` + `timestamptz`)
    - `public.all_service_data_dynamic` (still text for several business dates)
    - `public."EV_Service_History"` / `public."PV_Service_History"` (`service_date_time` as `text`)
- Existing parser contract in dump already supports date parsing helper:
  - `public.parse_all_service_date_text(text)`
- New migration set drafted:
  - `supabase/migrations/20260622193000_all_service_data_add_canonical_date_columns_backfill.sql`
    - adds `last_service_at`, `scheduled_next_service_on`, `vehicle_sale_on`
    - backfills typed columns from legacy text using safe parsers
    - adds matching typed columns in `all_service_data_dynamic`
    - backfills dynamic typed columns from source by `id`
    - updates `public.sync_all_service_data_dynamic()` to project typed columns
  - `supabase/migrations/20260622194000_service_history_sync_write_canonical_datetime_columns.sql`
    - updates Service-History realtime sync to maintain canonical typed columns
    - retains legacy text compatibility write for `last_service_date`
  - `supabase/sql_checks/20260622195000_all_service_data_canonical_dates_and_service_history_sync_checks.sql`
    - parse coverage, post-backfill mismatch counts, Service-History sync mismatch counts, and dynamic typed-column parity
- Recommended run order:
  1. Run checks file section A+B (baseline)
  2. Run migration `20260622193000`
  3. Run migration `20260622194000`
  4. Run checks file section C+D (post-apply)

### 2026-06-22 - New requirement: robot-audit projection on dynamic table

- Requirement accepted to add robot-audit projection columns in `public.all_service_data_dynamic`:
  - `updated_by_robot`
  - `updated_by_robot_at`
- Source of truth remains `public.all_service_data`; dynamic table must project these fields in both:
  - realtime trigger path (`public.sync_all_service_data_dynamic()`)
  - initial/backfill load path
- Status: documented and queued under Phase 2 tasks `2.8` and `2.9`.

### 2026-06-22 - Reusable temp backfill script finalized (PV/EV -> `all_service_data`)

- Execution mode updated from migration-only to reusable script runbook for temporary operations.
- Final script created:
  - `scripts/20260622_reusable_backfill_all_service_data_from_pv_ev.sql`
- Script behavior:
  - creates missing target columns only once (`IF NOT EXISTS`)
  - updates mapped fields by normalized `chassis_no`
  - excludes any chassis from update when source `status` contains `pending`
  - sets `updated_by_robot=true`, `updated_by_robot_at=source.created_at`
  - updates only changed rows (`IS DISTINCT FROM` contract)
- Supporting artifacts retained:
  - `supabase/migrations/20260622131000_all_service_data_add_engine_no_and_scheduled_next_service_type.sql`
  - `supabase/migrations/20260622124500_one_time_backfill_all_service_data_from_pv_ev_vehicle_data.sql`
  - `supabase/sql_checks/20260622124500_one_time_backfill_all_service_data_from_pv_ev_vehicle_data_checks.sql`

### 2026-06-22 - Requested follow-up for robot audit columns

- Request accepted to add two columns in `public.all_service_data`:
  - `updated_by_robot` (boolean)
  - `updated_by_robot_at` (timestamptz)
- Input compatibility clarified for `updated_by_robot`:
  - PostgreSQL accepts `TRUE/FALSE`, `T/F`, `YES/NO`, `ON/OFF`, `1/0`.
- Migration created:
  - `supabase/migrations/20260622123000_all_service_data_add_updated_by_robot_columns.sql`

### 2026-06-21 - Requested follow-up for derived next-service columns

- Request accepted to add two columns in `public.all_service_data`:
  - `assumed_next_service_date`
  - `assumed_next_service_type`
- Intended source fields for derivation:
  - `last_service_date`
  - `last_service_type`
- Logic status: pending user-provided rules; implementation intentionally deferred until logic is confirmed.

### 2026-06-21 - Phase 4 logic finalized for `assumed_next_service_date` (Concrete v1)

- Approved date logic captured from sheet-equivalent rules:
  - `DoneDays = MOD(GREATEST(0, current_date - parsed_last_service_date), 180)`
  - `TargetDays` mapping: `60` (`New`), `120` (`First Free Service`/`TMA-First Free Service`), else `180`
  - `assumed_next_service_date = current_date + (TargetDays - DoneDays)`
- Concrete migration drafted:
  - `supabase/migrations/20260621090000_all_service_data_add_assumed_next_service_columns.sql`
- Paired read-only checks drafted:
  - `supabase/sql_checks/20260621090000_all_service_data_add_assumed_next_service_columns_checks.sql`
- `assumed_next_service_type` population remains pending separate mapping approval.

### 2026-06-21 - Phase 4 type mapping and sync drafted (Concrete v2)

- Added `assumed_next_service_type` calc function:
  - `public.calc_all_service_assumed_next_service_type(text)`
- Added sync trigger for insert/update of source fields:
  - `public.set_all_service_assumed_columns()`
  - `trg_set_all_service_assumed_columns` on `public.all_service_data`
- Added deterministic backfill update for both assumed columns.
- Concrete migration drafted:
  - `supabase/migrations/20260621093000_all_service_data_assumed_next_service_type_sync.sql`
- Paired read-only checks drafted:
  - `supabase/sql_checks/20260621093000_all_service_data_assumed_next_service_type_sync_checks.sql`

### 2026-06-21 - Phase 4 mapping policy update (`Unknown` for unmapped types)

- Policy change accepted: remove permissive fallback mapping to `Paid Service` for non-standard `last_service_type` values.
- New behavior for `assumed_next_service_type`:
  - Known mapped values continue as-is.
  - Blank input remains `NULL`.
  - Any non-blank unmapped value is set to `Unknown`.
- Concrete migration created:
  - `supabase/migrations/20260621124500_all_service_data_assumed_next_service_type_unknown_fallback.sql`
- Migration recomputes existing rows with strict `Unknown` policy.

### 2026-06-21 - Correction: keep operational buckets `Unknown` (no forced Paid mapping)

- Clarification accepted: these buckets must remain `Unknown` until explicit business rules are finalized:
  - `Running Repairs`
  - `Accident`
  - `Campaign`
  - `AMC - TM`
  - `E Breakdown`
- Corrective migration created:
  - `supabase/migrations/20260621132000_all_service_data_assumed_next_service_type_remove_bucket_paid_mappings.sql`
- Post-migration verification snapshot:
  - `Accident -> Unknown`: 1215
  - `AMC - TM -> Unknown`: 335
  - `Campaign -> Unknown`: 648
  - `E Breakdown -> Unknown`: 80
  - `Running Repairs -> Unknown`: 3088
- Result: no forced fallback-to-`Paid Service` for these categories; policy remains conservative and auditable.

### 2026-06-21 - Guardrail update: no assumed date for `Unknown` type

- Policy clarified and accepted:
  - When `assumed_next_service_type = 'Unknown'`, set `assumed_next_service_date = NULL`.
  - Rationale: if the next-service type cannot be determined, the next-service date must not be assumed.
- Enforcement migration created:
  - `supabase/migrations/20260621134000_all_service_data_assumed_next_service_date_null_for_unknown_type.sql`
- Implementation details:
  - Replaces `public.calc_all_service_assumed_next_service_date(...)` with an `Unknown` guard.
  - Recomputes existing rows so stored dates are nulled where inferred type is `Unknown`.

### 2026-06-21 - Phase 5 powertrain granularity drafted (Concrete v1)

- Added granular derived column in `public.all_service_data`:
  - `powertrain_type`
- Added deterministic calc function from `product_line`:
  - `public.calc_all_service_powertrain_type(text)`
  - Rule output set: `EV`, `CNG`, `DIESEL`, `PETROL`, `UNKNOWN` (audit fallback), `NULL` for blank input.
- Added sync trigger for insert/update of `product_line`:
  - `public.set_all_service_powertrain_type()`
  - `trg_set_all_service_powertrain_type` on `public.all_service_data`
- Added deterministic backfill update for existing rows.
- Concrete migration drafted:
  - `supabase/migrations/20260621100000_all_service_data_powertrain_type_granularity.sql`
- Paired read-only checks drafted:
  - `supabase/sql_checks/20260621100000_all_service_data_powertrain_type_granularity_checks.sql`

### 2026-06-21 - Fresh authoritative dump re-audit and rule hardening

- Re-audited authoritative source (`local_folder/backups/full_database.sql`) via mirror chunk (`local_folder/backups/chunks/full_database.sql.part_000`) before finalizing rule quality.
- Finding: model-level reinforcement reduced `UNKNOWN` but conflicts with mixed-fuel model families.
- Finalized direction updated per business decision:
  - Do not force model-level mapping.
  - Classify from explicit `product_line` fuel signals first.
  - Then apply manual override table (`public.all_service_data_powertrain_overrides`) by priority.
  - If still unresolved, keep `UNKNOWN` (no fallback).
- Signal-only dry-run distribution before overrides (dump simulation):
  - `bucket_EV`: 12482
  - `bucket_CNG`: 3349
  - `bucket_DIESEL`: 3891
  - `bucket_PETROL`: 13431
  - `bucket_UNKNOWN`: 15661

### 2026-06-20 - Post-deploy parity check

- `matching_rows_in_all_service_data`: 0
- `exists_matching_row`: false
- `matching_count`: 0
- `expected_count`: 0
- `actual_count`: 0
- Interpretation: currently no row in source satisfies the strict NULL predicate; dynamic table is aligned with source predicate result.

### 2026-06-20 - Column-pruning follow-up requested

- Request accepted to keep only these columns in `public.all_service_data_dynamic`:
  - `id`
  - `chassis_no`
  - `vehicle_registration_number`
  - `model`
  - `product_line`
  - `scheduled_next_service_date`
  - `assumed_next_service_date`
  - `assumed_next_service_type`
  - `last_service_date`
  - `last_service_type`
- Follow-up migration created:
  - `supabase/migrations/20260620203000_all_service_data_dynamic_prune_columns.sql`
- Paired read-only checks created:
  - `supabase/sql_checks/20260620203000_all_service_data_dynamic_prune_columns_checks.sql`
- Status: pending execution in DB.

### 2026-06-20 - Post-prune parity check

- `expected_count`: 0
- `actual_count`: 0
- Interpretation: after pruning columns, dynamic table row parity with source predicate remains correct.

### 2026-06-20 - Added plus-2 condition (initial scheduled-date version)

- New inclusion rule added: include rows where `scheduled_next_service_date = current_date + 2` (with format parsing support).
- Predicate updated in:
  - `supabase/migrations/20260620204500_all_service_data_dynamic_add_plus2_condition.sql`
- Paired read-only verification created:
  - `supabase/sql_checks/20260620204500_all_service_data_dynamic_add_plus2_condition_checks.sql`
- Dynamic table backfill included in migration so existing rows are re-evaluated immediately under updated active conditions.
- Note: this rule is superseded in current plan authority by `assumed_next_service_date = current_date + 2`.

### 2026-06-20 - Plus-2 rollout execution update

- Executed migration file:
  - `supabase/migrations/20260620204500_all_service_data_dynamic_add_plus2_condition.sql`
- Executed checks file:
  - `supabase/sql_checks/20260620204500_all_service_data_dynamic_add_plus2_condition_checks.sql`
- Verification output snapshot not yet recorded in this plan.

### 2026-06-20 - Authoritative dump parser audit and fix

- Audit scope: authoritative dump mirror in `local_folder/backups/chunks/full_database.sql.part_*`.
- Finding: `scheduled_next_service_date` values in `all_service_data` commonly use `YYYY/MM/DD`, which was not included in the prior parser.
- Evidence from dump-scan:
  - `condB_old_parser`: 0
  - `condB_with_YYYY_MM_DD`: 10
- Fix created:
  - `supabase/migrations/20260620210000_all_service_data_dynamic_add_yyyy_mm_dd_parser.sql`
- Paired checks created:
  - `supabase/sql_checks/20260620210000_all_service_data_dynamic_add_yyyy_mm_dd_parser_checks.sql`
- Historical scope note: parser fix was for the prior scheduled-date Condition B implementation.

### 2026-06-21 - Added deterministic `fuel_tp` in `all_service_data_dynamic`

- Added new column in dynamic table:
  - `fuel_tp`
- Deterministic rule implemented:
  - `fuel_tp = 'EV'` when `UPPER(product_line)` contains `EV`
  - Else `fuel_tp = 'PV'`
- Added check constraint on dynamic table values:
  - `fuel_tp IN ('EV','PV')`
- Backfill and realtime sync updated so `fuel_tp` is maintained for existing and incoming rows.
- Migration created:
  - `supabase/migrations/20260621123000_all_service_data_dynamic_add_fuel_tp.sql`

### 2026-06-21 - Added `sold_dealer` projection in `all_service_data_dynamic`

- Added new source-projected column in dynamic table:
  - `sold_dealer`
- Backfilled existing dynamic rows from `public.all_service_data` by `id`.
- Realtime sync function updated so new/updated matching rows persist `NEW.sold_dealer` into dynamic table.
- Execution validation status: completed and confirmed as reflected in data.
- Migration created:
  - `supabase/migrations/20260621140000_all_service_data_dynamic_add_sold_dealer.sql`
- Paired read-only checks created and executed:
  - `supabase/sql_checks/20260621140000_all_service_data_dynamic_add_sold_dealer_checks.sql`

### 2026-06-21 - Added `vehicle_sale_date` projection in `all_service_data_dynamic`

- Added new source-projected column in dynamic table:
  - `vehicle_sale_date`
- Backfilled existing dynamic rows from `public.all_service_data` by `id`.
- Realtime sync function updated so new/updated matching rows persist `NEW.vehicle_sale_date` into dynamic table.
- Migration created:
  - `supabase/migrations/20260621143000_all_service_data_dynamic_add_vehicle_sale_date.sql`
- Paired read-only checks created:
  - `supabase/sql_checks/20260621143000_all_service_data_dynamic_add_vehicle_sale_date_checks.sql`

### 2026-06-21 - Added Condition C include rule in dynamic predicate

- Predicate updated to include rows when:
  - `last_service_type` is `NULL`/blank, or
  - `last_service_type` does not contain `Service` text.
- Dynamic table rebuilt under updated predicate semantics.
- Migration created:
  - `supabase/migrations/20260621141000_all_service_data_dynamic_add_condition_c_last_service_type_filter.sql`
- Paired read-only checks created:
  - `supabase/sql_checks/20260621141000_all_service_data_dynamic_add_condition_c_last_service_type_filter_checks.sql`

### 2026-06-21 - Priority ordering strategy approved for limited-row consumers

- Strategy accepted for third-party readers that only fetch first N rows from dynamic table.
- Implementation to proceed with:
  - `priority_bucket` (lower first)
  - `priority_score` (higher first)
  - deterministic tie-break by `id ASC`
- Storage-order dependency explicitly rejected; ordered query contract required.
- Pending next input: business ordering conditions to derive bucket and score values.

### 2026-06-21 - Priority ordering implemented with confirmed ranking

- Implemented dynamic priority fields:
  - `priority_bucket` (`Techwheels`=1, `Others`=2, `NULL`/other=3)
  - `priority_score` (encodes date-first, type-second ranking inside bucket)
- Ranking applied as confirmed:
  - `sold_dealer` (`Techwheels`, `Others`, `NULL`/other)
  - `assumed_next_service_date` ascending (`NULL` last)
  - `assumed_next_service_type` rank: `First Free Service`, `Second Free Service`, `Third Free Service`, `Paid Service`, `Unknown`, `NULL`/blank, others
  - final tie-break by `id ASC`
- Added ordered-read index:
  - `(priority_bucket, priority_score DESC, id ASC)`
- Updated realtime sync function to maintain priority fields on insert/update.
- Migration created:
  - `supabase/migrations/20260621142000_all_service_data_dynamic_priority_ordering_layer.sql`
- Paired read-only checks created:
  - `supabase/sql_checks/20260621142000_all_service_data_dynamic_priority_ordering_layer_checks.sql`

### 2026-06-21 - Priority score V2: added `vehicle_sale_date` tertiary condition

- Priority scorer upgraded to include tertiary component:
  - `vehicle_sale_date` new to old (`NULL`/unparseable last)
- Implemented in 3-arg scorer:
  - `public.calc_all_service_dynamic_priority_score(date, text, text)`
- Compatibility wrapper retained for existing 2-arg calls:
  - `public.calc_all_service_dynamic_priority_score(date, text)`
- Existing dynamic rows recomputed under V2 scoring.
- Realtime sync updated to pass `NEW.vehicle_sale_date` into scorer.
- Migration created:
  - `supabase/migrations/20260621144000_all_service_data_dynamic_priority_score_add_vehicle_sale_date.sql`
- Paired read-only checks created:
  - `supabase/sql_checks/20260621144000_all_service_data_dynamic_priority_score_add_vehicle_sale_date_checks.sql`

### 2026-06-21 - Priority score V3: exact vehicle_sale_date tertiary ordering

- Validation of V2 output showed tertiary ties for distinct `vehicle_sale_date` values due to coarse component granularity.
- V3 fix applied:
  - upgraded `public.all_service_data_dynamic.priority_score` from `integer` to `bigint`
  - scorer now encodes `vehicle_sale_date` at exact day-level (new to old)
  - `NULL`/unparseable `vehicle_sale_date` remains last
- Realtime sync remains aligned with the 3-arg scorer call path including `NEW.vehicle_sale_date`.
- Migration created:
  - `supabase/migrations/20260621150000_all_service_data_dynamic_priority_score_exact_vehicle_sale_date.sql`
- Paired read-only checks created:
  - `supabase/sql_checks/20260621150000_all_service_data_dynamic_priority_score_exact_vehicle_sale_date_checks.sql`

### 2026-06-21 - Authoritative fresh-dump audit (post V3)

- Audit target: `local_folder/backups/full_database.sql` as authoritative source.
- Direct editor read was blocked by file-size sync limit (>50MB), so audit used mirror chunks:
  - `local_folder/backups/chunks/full_database.sql.part_000`
  - `local_folder/backups/chunks/full_database.sql.part_004`
- Confirmed in dump snapshot:
  - `public.all_service_data_dynamic.priority_score` is `bigint`
  - 3-arg scorer returns `bigint` and includes exact day-level tertiary component:
    - `LEAST(99999, GREATEST(1, (p.vehicle_sale_dt - DATE '2000-01-01') + 1))`
    - score composition weights `* 10000000` and `* 100000`
  - `public.sync_all_service_data_dynamic()` calls scorer with `NEW.vehicle_sale_date`
  - Composite index exists for deterministic ordered reads:
    - `all_service_data_dynamic_priority_idx` on `(priority_bucket, priority_score DESC, id)`
- Audit conclusion:
  - Fresh dump is aligned with V3 priority-ordering implementation and deterministic query contract.

---

## Validation Queries (Execution Checklist)

```sql
-- Expected parity counts
SELECT COUNT(*) AS expected_count
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);

SELECT COUNT(*) AS actual_count
FROM public.all_service_data_dynamic;

-- Should return zero rows if perfectly aligned
SELECT a.id
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a)
EXCEPT
SELECT d.id
FROM public.all_service_data_dynamic d;

SELECT d.id
FROM public.all_service_data_dynamic d
EXCEPT
SELECT a.id
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);
```

---

## Rollback Procedure

```sql
DROP TRIGGER IF EXISTS trg_sync_all_service_data_dynamic ON public.all_service_data;
DROP FUNCTION IF EXISTS public.sync_all_service_data_dynamic();
DROP FUNCTION IF EXISTS public.is_all_service_dynamic_match(public.all_service_data);
DROP TABLE IF EXISTS public.all_service_data_dynamic;
```

---

## Related Documentation

- `docs/Implementation_plans/STRUCTURE_AND_WORKFLOW.md`
- `docs/Implementation_plans/webversion/INDEX.md`
- `docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md`
- `supabase/migrations/20260620200000_all_service_data_dynamic_realtime_sync.sql`
- `supabase/migrations/20260620203000_all_service_data_dynamic_prune_columns.sql`
- `supabase/migrations/20260620204500_all_service_data_dynamic_add_plus2_condition.sql`
- `supabase/sql_checks/20260620204500_all_service_data_dynamic_add_plus2_condition_checks.sql`
- `supabase/migrations/20260620210000_all_service_data_dynamic_add_yyyy_mm_dd_parser.sql`
- `supabase/sql_checks/20260620210000_all_service_data_dynamic_add_yyyy_mm_dd_parser_checks.sql`
- `supabase/migrations/20260621090000_all_service_data_add_assumed_next_service_columns.sql`
- `supabase/sql_checks/20260621090000_all_service_data_add_assumed_next_service_columns_checks.sql`
- `supabase/migrations/20260621093000_all_service_data_assumed_next_service_type_sync.sql`
- `supabase/sql_checks/20260621093000_all_service_data_assumed_next_service_type_sync_checks.sql`
- `supabase/migrations/20260621124500_all_service_data_assumed_next_service_type_unknown_fallback.sql`
- `supabase/migrations/20260621132000_all_service_data_assumed_next_service_type_remove_bucket_paid_mappings.sql`
- `supabase/migrations/20260621134000_all_service_data_assumed_next_service_date_null_for_unknown_type.sql`
- `supabase/migrations/20260621100000_all_service_data_powertrain_type_granularity.sql`
- `supabase/sql_checks/20260621100000_all_service_data_powertrain_type_granularity_checks.sql`
- `supabase/migrations/20260621123000_all_service_data_dynamic_add_fuel_tp.sql`
- `supabase/migrations/20260621140000_all_service_data_dynamic_add_sold_dealer.sql`
- `supabase/sql_checks/20260621140000_all_service_data_dynamic_add_sold_dealer_checks.sql`
- `supabase/migrations/20260621141000_all_service_data_dynamic_add_condition_c_last_service_type_filter.sql`
- `supabase/sql_checks/20260621141000_all_service_data_dynamic_add_condition_c_last_service_type_filter_checks.sql`
- `supabase/migrations/20260621142000_all_service_data_dynamic_priority_ordering_layer.sql`
- `supabase/sql_checks/20260621142000_all_service_data_dynamic_priority_ordering_layer_checks.sql`
- `supabase/migrations/20260621143000_all_service_data_dynamic_add_vehicle_sale_date.sql`
- `supabase/sql_checks/20260621143000_all_service_data_dynamic_add_vehicle_sale_date_checks.sql`
- `supabase/migrations/20260621144000_all_service_data_dynamic_priority_score_add_vehicle_sale_date.sql`
- `supabase/sql_checks/20260621144000_all_service_data_dynamic_priority_score_add_vehicle_sale_date_checks.sql`
- `supabase/migrations/20260621150000_all_service_data_dynamic_priority_score_exact_vehicle_sale_date.sql`
- `supabase/sql_checks/20260621150000_all_service_data_dynamic_priority_score_exact_vehicle_sale_date_checks.sql`
- `supabase/migrations/20260622123000_all_service_data_add_updated_by_robot_columns.sql`
- `supabase/migrations/20260622131000_all_service_data_add_engine_no_and_scheduled_next_service_type.sql`
- `supabase/migrations/20260622124500_one_time_backfill_all_service_data_from_pv_ev_vehicle_data.sql`
- `supabase/sql_checks/20260622124500_one_time_backfill_all_service_data_from_pv_ev_vehicle_data_checks.sql`
- `supabase/migrations/20260622180000_all_service_data_realtime_sync_from_service_history.sql`
- `supabase/sql_checks/20260622180000_all_service_data_realtime_sync_from_service_history_checks.sql`
- `supabase/migrations/20260623153000_rewire_service_history_realtime_sync_to_test_tables.sql`
- `supabase/sql_checks/20260623153000_rewire_service_history_realtime_sync_to_test_tables_checks.sql`
- `supabase/migrations/20260623183000_all_service_data_post_insert_history_sync_and_backfill.sql`
- `supabase/sql_checks/20260623183000_all_service_data_post_insert_history_sync_and_backfill_checks.sql`
- `supabase/migrations/20260623193000_all_service_history_delayed_sync_queue_and_backfill.sql`
- `supabase/sql_checks/20260623193000_all_service_history_delayed_sync_queue_and_backfill_checks.sql`
- `supabase/migrations/20260623195500_service_history_refresh_contact_name_compat_fix.sql`
- `supabase/sql_checks/20260623195500_service_history_refresh_contact_name_compat_fix_checks.sql`
- `supabase/migrations/20260622193000_all_service_data_add_canonical_date_columns_backfill.sql`
- `supabase/migrations/20260622194000_service_history_sync_write_canonical_datetime_columns.sql`
- `supabase/sql_checks/20260622195000_all_service_data_canonical_dates_and_service_history_sync_checks.sql`
- `supabase/migrations/20260623170000_all_service_data_dynamic_add_condition_d_updated_by_robot_filter.sql`
- `supabase/sql_checks/20260623170000_all_service_data_dynamic_add_condition_d_updated_by_robot_filter_checks.sql`
- `supabase/migrations/20260625113000_all_service_data_sync_from_job_card_closed_data_service_winner.sql`
- `supabase/sql_checks/20260625113000_all_service_data_sync_from_job_card_closed_data_service_winner_checks.sql`
- `supabase/migrations/20260625123000_schedule_daily_ist_job_card_closed_service_winner_reconcile.sql`
- `supabase/sql_checks/20260625123000_schedule_daily_ist_job_card_closed_service_winner_reconcile_checks.sql`
- `supabase/sql_checks/20260625124000_manual_chunked_backfill_job_card_closed_service_winner.sql`
- `supabase/exec_success_migrations/sql/20260624170000_all_service_data_robot_flag_freshness_for_plus2_due.sql`
- `supabase/exec_success_migrations/sql_check/20260624170000_all_service_data_robot_flag_freshness_for_plus2_due_checks.sql`
- `supabase/exec_success_migrations/sql/20260624173000_schedule_daily_ist_robot_flag_freshness_reconcile.sql`
- `supabase/exec_success_migrations/sql_check/20260624173000_schedule_daily_ist_robot_flag_freshness_reconcile_checks.sql`
- `supabase/exec_success_migrations/sql/20260624190000_drop_legacy_service_and_vehicle_source_tables.sql`
- `supabase/exec_success_migrations/sql_check/20260624190000_drop_legacy_service_and_vehicle_source_tables_checks.sql`
- `supabase/exec_success_migrations/sql/20260624103000_soft_deprecate_legacy_service_history_tables.sql`
- `supabase/exec_success_migrations/sql_check/20260624103000_soft_deprecate_legacy_service_history_tables_checks.sql`
- `scripts/20260622_reusable_backfill_all_service_data_from_pv_ev.sql` (historical; retired from active operations)

---

**Last Updated:** 2026-06-25 (Closed-job winner-sync + daily IST chunked reconcile implemented and validated) by GitHub Copilot  
**Status:** 🟡 IN PROGRESS (Closed-job winner-sync objectives complete; remaining unrelated roadmap items continue)
