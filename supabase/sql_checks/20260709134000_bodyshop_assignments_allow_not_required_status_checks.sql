-- Read-only verification checks for:
-- supabase/migrations/20260709134000_bodyshop_assignments_allow_not_required_status.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Constraints include not_required
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.bodyshop_assignments'::regclass
  AND conname LIKE 'bodyshop_assignments_%_work_status_check'
ORDER BY conname;

-- 2) Smoke: not_required assignment+status accepted for dentor (rolled back)
BEGIN;
UPDATE public.bodyshop_assignments
SET dentor_employee_code = 'NOT_REQUIRED',
    dentor_employee_name = 'Not Required',
    dentor_work_status = 'not_required',
    dentor_remark = NULL,
    dentor_out_ts = NULL,
    dentor_completed_by = NULL
WHERE upper(btrim(job_card_number)) = 'JC-MBTPLT-JP1-2627-003456';
ROLLBACK;
