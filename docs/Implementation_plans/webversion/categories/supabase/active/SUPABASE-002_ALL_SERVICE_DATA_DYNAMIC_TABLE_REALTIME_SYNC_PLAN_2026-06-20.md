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

At present, `public.all_service_data_dynamic` includes a row from `public.all_service_data` when either condition below is true:

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

Effective implementation source:
- `supabase/migrations/20260620210000_all_service_data_dynamic_add_yyyy_mm_dd_parser.sql` (historical parser enhancement for scheduled-date version)
- Condition-B pivot to `assumed_next_service_date`: documented in this plan and pending dedicated migration rollout.
- Condition-C (`last_service_type` null/blank/non-service-text) inclusion:
  - `supabase/migrations/20260621141000_all_service_data_dynamic_add_condition_c_last_service_type_filter.sql`
  - `supabase/sql_checks/20260621141000_all_service_data_dynamic_add_condition_c_last_service_type_filter_checks.sql`

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
    - `vehicle_sale_date` is stored as text in source/dynamic tables and parsed in scorer via `public.parse_all_service_date_text(...)`.
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

### Phase 1: Schema and Predicate Setup
- [ ] **Task 1.1:** Create `public.all_service_data_dynamic` using `CREATE TABLE ... AS SELECT ... WITH NO DATA`.
- [ ] **Task 1.2:** Add primary key on `id` and unique index on `chassis_no`.
- [ ] **Task 1.3:** Create predicate function `public.is_all_service_dynamic_match(r public.all_service_data)`.
- [ ] **Task 1.4:** Confirm predicate behavior for `NULL` semantics and JSONB field evaluation.

### Phase 2: Initial Backfill and Real-Time Sync
- [ ] **Task 2.1:** Truncate target table and run initial filtered load from source.
- [ ] **Task 2.2:** Create trigger function `public.sync_all_service_data_dynamic()` for `INSERT/UPDATE/DELETE`.
- [ ] **Task 2.3:** Create trigger `trg_sync_all_service_data_dynamic` on `public.all_service_data`.
- [ ] **Task 2.4:** Verify idempotence and re-runnable deployment behavior.

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

---

**Last Updated:** 2026-06-21 by GitHub Copilot  
**Status:** 🟡 IN PROGRESS
