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

Effective implementation source:
- `supabase/migrations/20260620210000_all_service_data_dynamic_add_yyyy_mm_dd_parser.sql` (historical parser enhancement for scheduled-date version)
- Condition-B pivot to `assumed_next_service_date`: documented in this plan and pending dedicated migration rollout.

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

### Phase 4: `all_service_data` Derived Next-Service Columns (Concrete v1)
- [ ] **Task 4.1:** Add nullable columns to `public.all_service_data`:
  - `assumed_next_service_date`
  - `assumed_next_service_type`
- [ ] **Task 4.2:** Implement deterministic `assumed_next_service_date` logic based on `last_service_date` and `last_service_type`.
- [ ] **Task 4.3:** Backfill existing rows using agreed logic.
- [ ] **Task 4.4:** Add read-only validation checks for nulls, coverage, and edge-format handling.
- [ ] **Task 4.5:** Document operational ownership (when/how daily recalculation runs).
- [ ] **Task 4.6:** Keep `assumed_next_service_type` nullable until separate type-mapping rules are finalized.

### Phase 4 Calculation Logic (Approved for `assumed_next_service_date`)

`DoneDays` definition:
- `DoneDays = MOD(GREATEST(0, current_date - parsed_last_service_date), 180)`

`TargetDays` mapping from `last_service_type`:
- `60` when `last_service_type` is `NULL`, empty, or `New`.
- `120` when `last_service_type` is `First Free Service` or `TMA-First Free Service`.
- `180` for all other values (including `Second Free Service`, `TMA-Second Free Service`, `Third Free Service`, `TMA-Third Free Service`, `Fourth Free Service`, `Fifth Free Service`, `Sixth Free Service`, `Seventh Free Service`, `Tenth Free Service`, `Paid Service`).

Final expression:
- `assumed_next_service_date = current_date + (TargetDays - DoneDays)`

Operational interpretation:
- Projection is relative to `current_date`, not directly from `last_service_date`.
- Value changes day-by-day and requires daily refresh if physically stored.
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
  - `assumed_next_service_date`
  - `assumed_next_service_type`
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
⏳ 2.4 | Re-run safety check | Platform Team | - | - | Pending post-apply verification
```

### Phase 3
```text
✅ 3.1 | Count parity validation | Platform Team | 2026-06-20 | 2026-06-20 | matching_rows_in_all_service_data=0, exists_matching_row=false, expected_count=0, actual_count=0
⏳ 3.2 | Transition-case validation | Platform Team | - | - | Pending execution
⏳ 3.3 | Rollback runbook note | Platform Team | - | - | Pending execution
⏳ 3.4 | Evidence and sign-off | Platform Team | - | - | Pending execution
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
  - `TargetDays` mapping: `60` (`New`/NULL/empty), `120` (`First Free Service`/`TMA-First Free Service`), else `180`
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
- `supabase/migrations/20260621100000_all_service_data_powertrain_type_granularity.sql`
- `supabase/sql_checks/20260621100000_all_service_data_powertrain_type_granularity_checks.sql`

---

**Last Updated:** 2026-06-21 by GitHub Copilot  
**Status:** 🟡 IN PROGRESS
