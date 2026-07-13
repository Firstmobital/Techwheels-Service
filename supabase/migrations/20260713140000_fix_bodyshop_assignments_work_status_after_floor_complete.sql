-- ============================================================
-- Fix: bodyshop_assignments rows where the BS floor is marked
-- complete but one or more role work_status columns still show
-- 'work_inprocess' (roles assigned AFTER floor completion).
--
-- Strategy A — real employees with wrong status:
--   • bs_floor_completed_at IS NOT NULL  (floor done)
--   • work_status = 'work_inprocess'
--   • employee_code is a real person (not NOT_REQUIRED)
--   → set work_status = 'completed', fill out_ts & completed_by
--
-- Strategy B — NOT_REQUIRED roles with wrong status:
--   • employee_code = 'NOT_REQUIRED'
--   • work_status <> 'not_required'
--   → set work_status = 'not_required', clear out_ts/completed_by
--
-- Safe to re-run (WHERE clauses are idempotent).
-- ============================================================

DO $$
DECLARE
  v_count integer;
BEGIN

  -- ── Strategy A: real employees whose work_status is still work_inprocess ──

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
    AND upper(trim(dentor_employee_code)) <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'dentor (real employee): fixed % row(s)', v_count;

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
    AND upper(trim(painter_employee_code)) <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'painter (real employee): fixed % row(s)', v_count;

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
    AND upper(trim(technician_employee_code)) <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'technician (real employee): fixed % row(s)', v_count;

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
    AND upper(trim(supervisor_employee_code)) <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'supervisor/floor_incharge (real employee): fixed % row(s)', v_count;

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
    AND upper(trim(dentor_helper_employee_code)) <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'dentor_helper (real employee): fixed % row(s)', v_count;

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
    AND upper(trim(painter_helper_employee_code)) <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'painter_helper (real employee): fixed % row(s)', v_count;

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
    AND upper(trim(rubbing_employee_code)) <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'rubbing (real employee): fixed % row(s)', v_count;

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
    AND upper(trim(edp_employee_code)) <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'edp (real employee): fixed % row(s)', v_count;

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
    AND upper(trim(parts_incharge_employee_code)) <> 'NOT_REQUIRED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'parts_incharge (real employee): fixed % row(s)', v_count;


  -- ── Strategy B: NOT_REQUIRED roles with incorrect work_status ──
  -- These should always have work_status = 'not_required', never 'work_inprocess'.
  -- Applies regardless of bs_floor_completed_at.

  UPDATE public.bodyshop_assignments
  SET dentor_work_status = 'not_required',
      dentor_out_ts = NULL, dentor_completed_by = NULL
  WHERE is_active = true
    AND upper(trim(COALESCE(dentor_employee_code, ''))) = 'NOT_REQUIRED'
    AND dentor_work_status <> 'not_required';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'dentor (NOT_REQUIRED status fix): fixed % row(s)', v_count;

  UPDATE public.bodyshop_assignments
  SET painter_work_status = 'not_required',
      painter_out_ts = NULL, painter_completed_by = NULL
  WHERE is_active = true
    AND upper(trim(COALESCE(painter_employee_code, ''))) = 'NOT_REQUIRED'
    AND painter_work_status <> 'not_required';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'painter (NOT_REQUIRED status fix): fixed % row(s)', v_count;

  UPDATE public.bodyshop_assignments
  SET technician_work_status = 'not_required',
      technician_out_ts = NULL, technician_completed_by = NULL
  WHERE is_active = true
    AND upper(trim(COALESCE(technician_employee_code, ''))) = 'NOT_REQUIRED'
    AND technician_work_status <> 'not_required';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'technician (NOT_REQUIRED status fix): fixed % row(s)', v_count;

  UPDATE public.bodyshop_assignments
  SET supervisor_work_status = 'not_required',
      supervisor_out_ts = NULL, supervisor_completed_by = NULL
  WHERE is_active = true
    AND upper(trim(COALESCE(supervisor_employee_code, ''))) = 'NOT_REQUIRED'
    AND supervisor_work_status <> 'not_required';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'supervisor/floor_incharge (NOT_REQUIRED status fix): fixed % row(s)', v_count;

  UPDATE public.bodyshop_assignments
  SET dentor_helper_work_status = 'not_required',
      dentor_helper_out_ts = NULL, dentor_helper_completed_by = NULL
  WHERE is_active = true
    AND upper(trim(COALESCE(dentor_helper_employee_code, ''))) = 'NOT_REQUIRED'
    AND dentor_helper_work_status <> 'not_required';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'dentor_helper (NOT_REQUIRED status fix): fixed % row(s)', v_count;

  UPDATE public.bodyshop_assignments
  SET painter_helper_work_status = 'not_required',
      painter_helper_out_ts = NULL, painter_helper_completed_by = NULL
  WHERE is_active = true
    AND upper(trim(COALESCE(painter_helper_employee_code, ''))) = 'NOT_REQUIRED'
    AND painter_helper_work_status <> 'not_required';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'painter_helper (NOT_REQUIRED status fix): fixed % row(s)', v_count;

  UPDATE public.bodyshop_assignments
  SET rubbing_work_status = 'not_required',
      rubbing_out_ts = NULL, rubbing_completed_by = NULL
  WHERE is_active = true
    AND upper(trim(COALESCE(rubbing_employee_code, ''))) = 'NOT_REQUIRED'
    AND rubbing_work_status <> 'not_required';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'rubbing (NOT_REQUIRED status fix): fixed % row(s)', v_count;

  UPDATE public.bodyshop_assignments
  SET edp_work_status = 'not_required',
      edp_out_ts = NULL, edp_completed_by = NULL
  WHERE is_active = true
    AND upper(trim(COALESCE(edp_employee_code, ''))) = 'NOT_REQUIRED'
    AND edp_work_status <> 'not_required';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'edp (NOT_REQUIRED status fix): fixed % row(s)', v_count;

  UPDATE public.bodyshop_assignments
  SET parts_incharge_work_status = 'not_required',
      parts_incharge_out_ts = NULL, parts_incharge_completed_by = NULL
  WHERE is_active = true
    AND upper(trim(COALESCE(parts_incharge_employee_code, ''))) = 'NOT_REQUIRED'
    AND parts_incharge_work_status <> 'not_required';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'parts_incharge (NOT_REQUIRED status fix): fixed % row(s)', v_count;

END $$;
