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
- Supported text formats for `scheduled_next_service_date`: `YYYY-MM-DD`, `YYYY/MM/DD`, `DD-MM-YYYY`, `DD/MM/YYYY`.

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

---

**Last Updated:** 2026-06-20 by GitHub Copilot  
**Status:** 🟡 IN PROGRESS
