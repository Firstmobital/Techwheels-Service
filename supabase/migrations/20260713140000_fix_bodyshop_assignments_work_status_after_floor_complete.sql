-- ============================================================
-- Fix: bodyshop_assignments rows where the BS floor is marked
-- complete but one or more role work_status columns still show
-- 'work_inprocess' (roles assigned AFTER floor completion).
--
-- Strategy: for every such role column, if:
--   • the row has bs_floor_completed_at IS NOT NULL  (floor done)
--   • the role's work_status = 'work_inprocess'       (bad state)
-- → set work_status = 'completed'
-- → set out_ts     = bs_floor_completed_at  (use floor-done time)
-- → set completed_by = bs_floor_completed_by (use floor-done actor)
--
-- This is safe to re-run (WHERE clauses are idempotent).
-- ============================================================

DO $$
DECLARE
  v_count integer;
BEGIN

  -- DENTOR
  UPDATE public.bodyshop_assignments
  SET
    dentor_work_status  = 'completed',
    dentor_out_ts       = COALESCE(dentor_out_ts, bs_floor_completed_at),
    dentor_completed_by = COALESCE(dentor_completed_by, bs_floor_completed_by)
  WHERE is_active = true
    AND bs_floor_completed_at IS NOT NULL
    AND dentor_work_status = 'work_inprocess'
    AND dentor_employee_code IS NOT NULL
    AND dentor_employee_code <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'dentor: fixed % row(s)', v_count;

  -- PAINTER
  UPDATE public.bodyshop_assignments
  SET
    painter_work_status  = 'completed',
    painter_out_ts       = COALESCE(painter_out_ts, bs_floor_completed_at),
    painter_completed_by = COALESCE(painter_completed_by, bs_floor_completed_by)
  WHERE is_active = true
    AND bs_floor_completed_at IS NOT NULL
    AND painter_work_status = 'work_inprocess'
    AND painter_employee_code IS NOT NULL
    AND painter_employee_code <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'painter: fixed % row(s)', v_count;

  -- TECHNICIAN
  UPDATE public.bodyshop_assignments
  SET
    technician_work_status  = 'completed',
    technician_out_ts       = COALESCE(technician_out_ts, bs_floor_completed_at),
    technician_completed_by = COALESCE(technician_completed_by, bs_floor_completed_by)
  WHERE is_active = true
    AND bs_floor_completed_at IS NOT NULL
    AND technician_work_status = 'work_inprocess'
    AND technician_employee_code IS NOT NULL
    AND technician_employee_code <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'technician: fixed % row(s)', v_count;

  -- FLOOR_INCHARGE (supervisor)
  UPDATE public.bodyshop_assignments
  SET
    supervisor_work_status  = 'completed',
    supervisor_out_ts       = COALESCE(supervisor_out_ts, bs_floor_completed_at),
    supervisor_completed_by = COALESCE(supervisor_completed_by, bs_floor_completed_by)
  WHERE is_active = true
    AND bs_floor_completed_at IS NOT NULL
    AND supervisor_work_status = 'work_inprocess'
    AND supervisor_employee_code IS NOT NULL
    AND supervisor_employee_code <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'supervisor (floor_incharge): fixed % row(s)', v_count;

  -- DENTOR_HELPER
  UPDATE public.bodyshop_assignments
  SET
    dentor_helper_work_status  = 'completed',
    dentor_helper_out_ts       = COALESCE(dentor_helper_out_ts, bs_floor_completed_at),
    dentor_helper_completed_by = COALESCE(dentor_helper_completed_by, bs_floor_completed_by)
  WHERE is_active = true
    AND bs_floor_completed_at IS NOT NULL
    AND dentor_helper_work_status = 'work_inprocess'
    AND dentor_helper_employee_code IS NOT NULL
    AND dentor_helper_employee_code <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'dentor_helper: fixed % row(s)', v_count;

  -- PAINTER_HELPER
  UPDATE public.bodyshop_assignments
  SET
    painter_helper_work_status  = 'completed',
    painter_helper_out_ts       = COALESCE(painter_helper_out_ts, bs_floor_completed_at),
    painter_helper_completed_by = COALESCE(painter_helper_completed_by, bs_floor_completed_by)
  WHERE is_active = true
    AND bs_floor_completed_at IS NOT NULL
    AND painter_helper_work_status = 'work_inprocess'
    AND painter_helper_employee_code IS NOT NULL
    AND painter_helper_employee_code <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'painter_helper: fixed % row(s)', v_count;

  -- RUBBING
  UPDATE public.bodyshop_assignments
  SET
    rubbing_work_status  = 'completed',
    rubbing_out_ts       = COALESCE(rubbing_out_ts, bs_floor_completed_at),
    rubbing_completed_by = COALESCE(rubbing_completed_by, bs_floor_completed_by)
  WHERE is_active = true
    AND bs_floor_completed_at IS NOT NULL
    AND rubbing_work_status = 'work_inprocess'
    AND rubbing_employee_code IS NOT NULL
    AND rubbing_employee_code <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'rubbing: fixed % row(s)', v_count;

  -- EDP
  UPDATE public.bodyshop_assignments
  SET
    edp_work_status  = 'completed',
    edp_out_ts       = COALESCE(edp_out_ts, bs_floor_completed_at),
    edp_completed_by = COALESCE(edp_completed_by, bs_floor_completed_by)
  WHERE is_active = true
    AND bs_floor_completed_at IS NOT NULL
    AND edp_work_status = 'work_inprocess'
    AND edp_employee_code IS NOT NULL
    AND edp_employee_code <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'edp: fixed % row(s)', v_count;

  -- PARTS_INCHARGE
  UPDATE public.bodyshop_assignments
  SET
    parts_incharge_work_status  = 'completed',
    parts_incharge_out_ts       = COALESCE(parts_incharge_out_ts, bs_floor_completed_at),
    parts_incharge_completed_by = COALESCE(parts_incharge_completed_by, bs_floor_completed_by)
  WHERE is_active = true
    AND bs_floor_completed_at IS NOT NULL
    AND parts_incharge_work_status = 'work_inprocess'
    AND parts_incharge_employee_code IS NOT NULL
    AND parts_incharge_employee_code <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'parts_incharge: fixed % row(s)', v_count;

END $$;
