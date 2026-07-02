-- Bodyshop Floor: add EDP role columns to bodyshop_assignments, mirroring the
-- existing per-role columnar pattern (employee_code / employee_name /
-- work_status / remark / in_ts / out_ts / completed_by).

ALTER TABLE public.bodyshop_assignments
  ADD COLUMN IF NOT EXISTS edp_employee_code text,
  ADD COLUMN IF NOT EXISTS edp_employee_name text,
  ADD COLUMN IF NOT EXISTS edp_work_status text,
  ADD COLUMN IF NOT EXISTS edp_remark text,
  ADD COLUMN IF NOT EXISTS edp_in_ts timestamptz,
  ADD COLUMN IF NOT EXISTS edp_out_ts timestamptz,
  ADD COLUMN IF NOT EXISTS edp_completed_by text;

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_edp_work_status_check
    CHECK (edp_work_status IS NULL OR edp_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text]));
