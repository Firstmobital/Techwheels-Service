-- Allow "not_required" on bodyshop_assignments role work_status columns.
-- "Not Required" is an assignment choice (employee_code/name = NOT_REQUIRED / Not Required)
-- and the matching work_status value is 'not_required'.
--
-- Rollback: recreate each constraint without 'not_required' (only after clearing
-- any rows that use not_required).

ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_dentor_work_status_check;
ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_dentor_helper_work_status_check;
ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_painter_work_status_check;
ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_painter_helper_work_status_check;
ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_technician_work_status_check;
ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_rubbing_work_status_check;
ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_edp_work_status_check;
ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_supervisor_work_status_check;
ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_det_work_status_check;
ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_electrician_work_status_check;
ALTER TABLE public.bodyshop_assignments DROP CONSTRAINT IF EXISTS bodyshop_assignments_parts_incharge_work_status_check;

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_dentor_work_status_check
  CHECK ((dentor_work_status IS NULL) OR (dentor_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_dentor_helper_work_status_check
  CHECK ((dentor_helper_work_status IS NULL) OR (dentor_helper_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_painter_work_status_check
  CHECK ((painter_work_status IS NULL) OR (painter_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_painter_helper_work_status_check
  CHECK ((painter_helper_work_status IS NULL) OR (painter_helper_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_technician_work_status_check
  CHECK ((technician_work_status IS NULL) OR (technician_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_rubbing_work_status_check
  CHECK ((rubbing_work_status IS NULL) OR (rubbing_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_edp_work_status_check
  CHECK ((edp_work_status IS NULL) OR (edp_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_supervisor_work_status_check
  CHECK ((supervisor_work_status IS NULL) OR (supervisor_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_det_work_status_check
  CHECK ((det_work_status IS NULL) OR (det_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_electrician_work_status_check
  CHECK ((electrician_work_status IS NULL) OR (electrician_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));

ALTER TABLE public.bodyshop_assignments
  ADD CONSTRAINT bodyshop_assignments_parts_incharge_work_status_check
  CHECK ((parts_incharge_work_status IS NULL) OR (parts_incharge_work_status = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text, 'not_required'::text])));
