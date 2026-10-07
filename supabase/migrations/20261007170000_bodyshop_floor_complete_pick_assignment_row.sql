-- complete_bodyshop_floor_work_role: pick the active row that actually holds the role slot,
-- not a newer empty duplicate row (same job card).

CREATE OR REPLACE FUNCTION public.complete_bodyshop_floor_work_role(
  p_job_card_number text,
  p_floor_role text,
  p_actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jc text := upper(trim(p_job_card_number));
  v_role text := upper(trim(p_floor_role));
  v_row public.bodyshop_assignments%ROWTYPE;
  v_me text := upper(trim(public.my_employee_code()));
  v_step int;
  v_active_step int := NULL;
  v_actor text := nullif(trim(p_actor_email), '');
BEGIN
  IF v_jc = '' OR v_role = '' THEN
    RETURN jsonb_build_object('error', 'Job card and role are required');
  END IF;

  IF NOT public.has_module_modify('bodyshop_floor_work') THEN
    RETURN jsonb_build_object('error', 'Floor Work modify permission required');
  END IF;

  SELECT * INTO v_row
  FROM public.bodyshop_assignments ba
  WHERE upper(trim(ba.job_card_number)) = v_jc
    AND ba.is_active = true
  ORDER BY
    CASE v_role
      WHEN 'DENTOR' THEN CASE WHEN public._bodyshop_floor_role_slot_active(ba.dentor_employee_code) THEN 1 ELSE 0 END
      WHEN 'DENTOR_HELPER' THEN CASE WHEN public._bodyshop_floor_role_slot_active(ba.dentor_helper_employee_code) THEN 1 ELSE 0 END
      WHEN 'PAINTER' THEN CASE WHEN public._bodyshop_floor_role_slot_active(ba.painter_employee_code) THEN 1 ELSE 0 END
      WHEN 'PAINTER_HELPER' THEN CASE WHEN public._bodyshop_floor_role_slot_active(ba.painter_helper_employee_code) THEN 1 ELSE 0 END
      WHEN 'TECHNICIAN' THEN CASE WHEN public._bodyshop_floor_role_slot_active(ba.technician_employee_code) THEN 1 ELSE 0 END
      WHEN 'RUBBING' THEN CASE WHEN public._bodyshop_floor_role_slot_active(ba.rubbing_employee_code) THEN 1 ELSE 0 END
      ELSE 0
    END DESC,
    ba.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Active assignment not found');
  END IF;

  IF NOT public.dealer_code_in_scope(v_row.dealer_code) THEN
    RETURN jsonb_build_object('error', 'Dealer scope denied');
  END IF;

  IF v_row.bs_floor_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Bodyshop floor already completed for this vehicle');
  END IF;

  IF v_role = 'DENTOR' AND upper(trim(v_row.dentor_employee_code)) IS DISTINCT FROM v_me AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'You are not assigned to this role slot');
  ELSIF v_role = 'DENTOR_HELPER' AND upper(trim(v_row.dentor_helper_employee_code)) IS DISTINCT FROM v_me AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'You are not assigned to this role slot');
  ELSIF v_role = 'PAINTER' AND upper(trim(v_row.painter_employee_code)) IS DISTINCT FROM v_me AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'You are not assigned to this role slot');
  ELSIF v_role = 'PAINTER_HELPER' AND upper(trim(v_row.painter_helper_employee_code)) IS DISTINCT FROM v_me AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'You are not assigned to this role slot');
  ELSIF v_role = 'TECHNICIAN' AND upper(trim(v_row.technician_employee_code)) IS DISTINCT FROM v_me AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'You are not assigned to this role slot');
  ELSIF v_role = 'RUBBING' AND upper(trim(v_row.rubbing_employee_code)) IS DISTINCT FROM v_me AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'You are not assigned to this role slot');
  ELSIF v_role NOT IN ('DENTOR','DENTOR_HELPER','PAINTER','PAINTER_HELPER','TECHNICIAN','RUBBING') THEN
    RETURN jsonb_build_object('error', 'Invalid floor role');
  END IF;

  FOR v_step IN 0..3 LOOP
    IF NOT public._bodyshop_floor_pipeline_step_done(v_row, v_step) THEN
      v_active_step := v_step;
      EXIT;
    END IF;
  END LOOP;

  IF v_active_step IS NULL THEN
    RETURN jsonb_build_object('error', 'No active pipeline step for this vehicle');
  END IF;

  IF (v_active_step = 0 AND v_role NOT IN ('DENTOR','DENTOR_HELPER'))
     OR (v_active_step = 1 AND v_role NOT IN ('PAINTER','PAINTER_HELPER'))
     OR (v_active_step = 2 AND v_role <> 'TECHNICIAN')
     OR (v_active_step = 3 AND v_role <> 'RUBBING') THEN
    RETURN jsonb_build_object('error', 'This role is not active on the pipeline yet');
  END IF;

  UPDATE public.bodyshop_assignments
  SET
    dentor_work_status = CASE WHEN v_role = 'DENTOR' THEN 'completed' ELSE dentor_work_status END,
    dentor_out_ts = CASE WHEN v_role = 'DENTOR' THEN COALESCE(dentor_out_ts, now()) ELSE dentor_out_ts END,
    dentor_completed_by = CASE WHEN v_role = 'DENTOR' THEN v_actor ELSE dentor_completed_by END,
    dentor_helper_work_status = CASE WHEN v_role = 'DENTOR_HELPER' THEN 'completed' ELSE dentor_helper_work_status END,
    dentor_helper_out_ts = CASE WHEN v_role = 'DENTOR_HELPER' THEN COALESCE(dentor_helper_out_ts, now()) ELSE dentor_helper_out_ts END,
    dentor_helper_completed_by = CASE WHEN v_role = 'DENTOR_HELPER' THEN v_actor ELSE dentor_helper_completed_by END,
    painter_work_status = CASE WHEN v_role = 'PAINTER' THEN 'completed' ELSE painter_work_status END,
    painter_out_ts = CASE WHEN v_role = 'PAINTER' THEN COALESCE(painter_out_ts, now()) ELSE painter_out_ts END,
    painter_completed_by = CASE WHEN v_role = 'PAINTER' THEN v_actor ELSE painter_completed_by END,
    painter_helper_work_status = CASE WHEN v_role = 'PAINTER_HELPER' THEN 'completed' ELSE painter_helper_work_status END,
    painter_helper_out_ts = CASE WHEN v_role = 'PAINTER_HELPER' THEN COALESCE(painter_helper_out_ts, now()) ELSE painter_helper_out_ts END,
    painter_helper_completed_by = CASE WHEN v_role = 'PAINTER_HELPER' THEN v_actor ELSE painter_helper_completed_by END,
    technician_work_status = CASE WHEN v_role = 'TECHNICIAN' THEN 'completed' ELSE technician_work_status END,
    technician_out_ts = CASE WHEN v_role = 'TECHNICIAN' THEN COALESCE(technician_out_ts, now()) ELSE technician_out_ts END,
    technician_completed_by = CASE WHEN v_role = 'TECHNICIAN' THEN v_actor ELSE technician_completed_by END,
    rubbing_work_status = CASE WHEN v_role = 'RUBBING' THEN 'completed' ELSE rubbing_work_status END,
    rubbing_out_ts = CASE WHEN v_role = 'RUBBING' THEN COALESCE(rubbing_out_ts, now()) ELSE rubbing_out_ts END,
    rubbing_completed_by = CASE WHEN v_role = 'RUBBING' THEN v_actor ELSE rubbing_completed_by END
  WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
