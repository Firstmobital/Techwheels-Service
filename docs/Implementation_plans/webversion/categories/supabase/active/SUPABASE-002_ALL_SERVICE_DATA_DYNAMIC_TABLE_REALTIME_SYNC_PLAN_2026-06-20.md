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

2. **Condition B - Scheduled date rule**
- `chassis_no` is present.
- `scheduled_next_service_date` resolves to `current_date + 2`.
- Observed source format in `all_service_data` (authoritative dump): `YYYY/MM/DD`.
- Parser-supported text formats for `scheduled_next_service_date` (for robustness): `YYYY-MM-DD`, `YYYY/MM/DD`, `DD-MM-YYYY`, `DD/MM/YYYY`.

Effective implementation source:
- `supabase/migrations/20260620210000_all_service_data_dynamic_add_yyyy_mm_dd_parser.sql`

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

Best rollout strategy:

- Phase A (audit-first): deploy with strict `UNKNOWN` and run distribution checks.
- Phase B (token hardening): review top `UNKNOWN` `product_line` values and add deterministic token rules.
- Phase C (override curation): add targeted override rows (`match_pattern`, `powertrain_type`, `priority`) for unresolved product lines.
- Phase D (operationalization): keep trigger-based sync on `INSERT/UPDATE OF product_line` and periodically review remaining `UNKNOWN` distribution.

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

### 2026-06-20 - Added scheduled_next_service_date plus-2 condition

- New inclusion rule added: include rows where `scheduled_next_service_date = current_date + 2` (with format parsing support).
- Predicate updated in:
  - `supabase/migrations/20260620204500_all_service_data_dynamic_add_plus2_condition.sql`
- Paired read-only verification created:
  - `supabase/sql_checks/20260620204500_all_service_data_dynamic_add_plus2_condition_checks.sql`
- Dynamic table backfill included in migration so existing rows are re-evaluated immediately under updated active conditions.

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
