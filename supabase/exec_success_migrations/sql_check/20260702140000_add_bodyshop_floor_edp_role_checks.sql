-- Read-only verification checks for:
-- supabase/migrations/20260702140000_add_bodyshop_floor_edp_role.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) New EDP columns exist with expected types.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bodyshop_assignments'
  AND column_name LIKE 'edp_%'
ORDER BY column_name;

-- 2) Work-status check constraint present with expected allowed values.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.bodyshop_assignments'::regclass
  AND conname = 'bodyshop_assignments_edp_work_status_check';

-- 3) Table still queryable (row-count sanity check, informational).
SELECT COUNT(*) AS bodyshop_assignments_row_count
FROM public.bodyshop_assignments;
