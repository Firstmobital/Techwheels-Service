-- Bodyshop Floor: add Supervisor, Dentor Helper, Painter Helper and Rubbing role columns
-- to bodyshop_assignments, mirroring the existing per-role columnar pattern
-- (employee_code / employee_name / work_status / remark / in_ts / out_ts / completed_by).

ALTER TABLE public.bodyshop_assignments
  ADD COLUMN IF NOT EXISTS supervisor_employee_code text,
  ADD COLUMN IF NOT EXISTS supervisor_employee_name text,
  ADD COLUMN IF NOT EXISTS supervisor_work_status text,
  ADD COLUMN IF NOT EXISTS supervisor_remark text,
  ADD COLUMN IF NOT EXISTS supervisor_in_ts timestamptz,
  ADD COLUMN IF NOT EXISTS supervisor_out_ts timestamptz,
  ADD COLUMN IF NOT EXISTS supervisor_completed_by text,

  ADD COLUMN IF NOT EXISTS dentor_helper_employee_code text,
  ADD COLUMN IF NOT EXISTS dentor_helper_employee_name text,
  ADD COLUMN IF NOT EXISTS dentor_helper_work_status text,
  ADD COLUMN IF NOT EXISTS dentor_helper_remark text,
  ADD COLUMN IF NOT EXISTS dentor_helper_in_ts timestamptz,
  ADD COLUMN IF NOT EXISTS dentor_helper_out_ts timestamptz,
  ADD COLUMN IF NOT EXISTS dentor_helper_completed_by text,

  ADD COLUMN IF NOT EXISTS painter_helper_employee_code text,
  ADD COLUMN IF NOT EXISTS painter_helper_employee_name text,
  ADD COLUMN IF NOT EXISTS painter_helper_work_status text,
  ADD COLUMN IF NOT EXISTS painter_helper_remark text,
  ADD COLUMN IF NOT EXISTS painter_helper_in_ts timestamptz,
  ADD COLUMN IF NOT EXISTS painter_helper_out_ts timestamptz,
  ADD COLUMN IF NOT EXISTS painter_helper_completed_by text,

  ADD COLUMN IF NOT EXISTS rubbing_employee_code text,
  ADD COLUMN IF NOT EXISTS rubbing_employee_name text,
  ADD COLUMN IF NOT EXISTS rubbing_work_status text,
  ADD COLUMN IF NOT EXISTS rubbing_remark text,
  ADD COLUMN IF NOT EXISTS rubbing_in_ts timestamptz,
  ADD COLUMN IF NOT EXISTS rubbing_out_ts timestamptz,
  ADD COLUMN IF NOT EXISTS rubbing_completed_by text;

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_supervisor_work_status_check
    CHECK (supervisor_work_status IS NULL OR supervisor_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text])),
  ADD CONSTRAINT bodyshop_assignments_dentor_helper_work_status_check
    CHECK (dentor_helper_work_status IS NULL OR dentor_helper_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text])),
  ADD CONSTRAINT bodyshop_assignments_painter_helper_work_status_check
    CHECK (painter_helper_work_status IS NULL OR painter_helper_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text])),
  ADD CONSTRAINT bodyshop_assignments_rubbing_work_status_check
    CHECK (rubbing_work_status IS NULL OR rubbing_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text]));
