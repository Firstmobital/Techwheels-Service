-- Reopen a vehicle on Bodyshop Floor after bs_floor_completed (rework cycle).

CREATE OR REPLACE FUNCTION public._bodyshop_floor_status_after_reopen(
  p_reset boolean,
  p_code text,
  p_status text,
  p_in_ts timestamptz
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_reset, true)
      AND public._bodyshop_floor_role_slot_active(p_code)
      AND lower(coalesce(trim(p_status), '')) = 'completed'
    THEN 'work_inprocess'
    ELSE p_status
  END;
$$;

CREATE OR REPLACE FUNCTION public._bodyshop_floor_in_ts_after_reopen(
  p_reset boolean,
  p_code text,
  p_status text,
  p_in_ts timestamptz
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_reset, true)
      AND public._bodyshop_floor_role_slot_active(p_code)
      AND lower(coalesce(trim(p_status), '')) = 'completed'
    THEN coalesce(p_in_ts, now())
    ELSE p_in_ts
  END;
$$;

CREATE OR REPLACE FUNCTION public._bodyshop_floor_out_ts_after_reopen(
  p_reset boolean,
  p_code text,
  p_status text,
  p_out_ts timestamptz
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_reset, true)
      AND public._bodyshop_floor_role_slot_active(p_code)
      AND lower(coalesce(trim(p_status), '')) = 'completed'
    THEN NULL
    ELSE p_out_ts
  END;
$$;

CREATE OR REPLACE FUNCTION public._bodyshop_floor_completed_by_after_reopen(
  p_reset boolean,
  p_code text,
  p_status text,
  p_completed_by text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_reset, true)
      AND public._bodyshop_floor_role_slot_active(p_code)
      AND lower(coalesce(trim(p_status), '')) = 'completed'
    THEN NULL
    ELSE p_completed_by
  END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_bodyshop_floor_for_rework(
  p_job_card_number text,
  p_reason text DEFAULT NULL,
  p_reset_worker_roles boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jc text := upper(trim(p_job_card_number));
  v_row public.bodyshop_assignments%ROWTYPE;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_reset boolean := coalesce(p_reset_worker_roles, true);
  v_remark_line text;
  v_reset_count int := 0;
BEGIN
  IF v_jc = '' THEN
    RETURN jsonb_build_object('error', 'Job card number is required');
  END IF;

  IF NOT (
    public.is_admin()
    OR public.has_module_modify('bodyshop_floor')
    OR public.user_is_linked_bodyshop_floor_incharge()
  ) THEN
    RETURN jsonb_build_object('error', 'Only Admin or Floor Incharge can reopen the floor for rework');
  END IF;

  SELECT * INTO v_row
  FROM public.bodyshop_assignments ba
  WHERE upper(trim(ba.job_card_number)) = v_jc
    AND ba.is_active = true
  ORDER BY ba.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Active floor assignment not found for this job card');
  END IF;

  IF NOT public.dealer_code_in_scope(v_row.dealer_code) THEN
    RETURN jsonb_build_object('error', 'Dealer scope denied');
  END IF;

  IF v_row.bs_floor_completed_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Floor is not marked complete — nothing to reopen');
  END IF;

  IF v_reset THEN
    IF public._bodyshop_floor_role_slot_active(v_row.supervisor_employee_code)
       AND lower(coalesce(trim(v_row.supervisor_work_status), '')) = 'completed' THEN
      v_reset_count := v_reset_count + 1;
    END IF;
    IF public._bodyshop_floor_role_slot_active(v_row.dentor_employee_code)
       AND lower(coalesce(trim(v_row.dentor_work_status), '')) = 'completed' THEN
      v_reset_count := v_reset_count + 1;
    END IF;
    IF public._bodyshop_floor_role_slot_active(v_row.dentor_helper_employee_code)
       AND lower(coalesce(trim(v_row.dentor_helper_work_status), '')) = 'completed' THEN
      v_reset_count := v_reset_count + 1;
    END IF;
    IF public._bodyshop_floor_role_slot_active(v_row.painter_employee_code)
       AND lower(coalesce(trim(v_row.painter_work_status), '')) = 'completed' THEN
      v_reset_count := v_reset_count + 1;
    END IF;
    IF public._bodyshop_floor_role_slot_active(v_row.painter_helper_employee_code)
       AND lower(coalesce(trim(v_row.painter_helper_work_status), '')) = 'completed' THEN
      v_reset_count := v_reset_count + 1;
    END IF;
    IF public._bodyshop_floor_role_slot_active(v_row.technician_employee_code)
       AND lower(coalesce(trim(v_row.technician_work_status), '')) = 'completed' THEN
      v_reset_count := v_reset_count + 1;
    END IF;
    IF public._bodyshop_floor_role_slot_active(v_row.rubbing_employee_code)
       AND lower(coalesce(trim(v_row.rubbing_work_status), '')) = 'completed' THEN
      v_reset_count := v_reset_count + 1;
    END IF;
  END IF;

  v_remark_line := NULL;
  IF v_reason IS NOT NULL THEN
    v_remark_line := 'Rework reopen (' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST): ' || v_reason;
  END IF;

  UPDATE public.bodyshop_assignments ba
  SET
    bs_floor_completed_at = NULL,
    bs_floor_completed_by = NULL,
    supervisor_work_status = public._bodyshop_floor_status_after_reopen(v_reset, ba.supervisor_employee_code, ba.supervisor_work_status, ba.supervisor_in_ts),
    supervisor_in_ts = public._bodyshop_floor_in_ts_after_reopen(v_reset, ba.supervisor_employee_code, ba.supervisor_work_status, ba.supervisor_in_ts),
    supervisor_out_ts = public._bodyshop_floor_out_ts_after_reopen(v_reset, ba.supervisor_employee_code, ba.supervisor_work_status, ba.supervisor_out_ts),
    supervisor_completed_by = public._bodyshop_floor_completed_by_after_reopen(v_reset, ba.supervisor_employee_code, ba.supervisor_work_status, ba.supervisor_completed_by),
    supervisor_remark = CASE
      WHEN v_remark_line IS NULL THEN ba.supervisor_remark
      ELSE trim(both E'\n' from concat(coalesce(ba.supervisor_remark, ''), E'\n', v_remark_line))
    END,
    dentor_work_status = public._bodyshop_floor_status_after_reopen(v_reset, ba.dentor_employee_code, ba.dentor_work_status, ba.dentor_in_ts),
    dentor_in_ts = public._bodyshop_floor_in_ts_after_reopen(v_reset, ba.dentor_employee_code, ba.dentor_work_status, ba.dentor_in_ts),
    dentor_out_ts = public._bodyshop_floor_out_ts_after_reopen(v_reset, ba.dentor_employee_code, ba.dentor_work_status, ba.dentor_out_ts),
    dentor_completed_by = public._bodyshop_floor_completed_by_after_reopen(v_reset, ba.dentor_employee_code, ba.dentor_work_status, ba.dentor_completed_by),
    dentor_helper_work_status = public._bodyshop_floor_status_after_reopen(v_reset, ba.dentor_helper_employee_code, ba.dentor_helper_work_status, ba.dentor_helper_in_ts),
    dentor_helper_in_ts = public._bodyshop_floor_in_ts_after_reopen(v_reset, ba.dentor_helper_employee_code, ba.dentor_helper_work_status, ba.dentor_helper_in_ts),
    dentor_helper_out_ts = public._bodyshop_floor_out_ts_after_reopen(v_reset, ba.dentor_helper_employee_code, ba.dentor_helper_work_status, ba.dentor_helper_out_ts),
    dentor_helper_completed_by = public._bodyshop_floor_completed_by_after_reopen(v_reset, ba.dentor_helper_employee_code, ba.dentor_helper_work_status, ba.dentor_helper_completed_by),
    painter_work_status = public._bodyshop_floor_status_after_reopen(v_reset, ba.painter_employee_code, ba.painter_work_status, ba.painter_in_ts),
    painter_in_ts = public._bodyshop_floor_in_ts_after_reopen(v_reset, ba.painter_employee_code, ba.painter_work_status, ba.painter_in_ts),
    painter_out_ts = public._bodyshop_floor_out_ts_after_reopen(v_reset, ba.painter_employee_code, ba.painter_work_status, ba.painter_out_ts),
    painter_completed_by = public._bodyshop_floor_completed_by_after_reopen(v_reset, ba.painter_employee_code, ba.painter_work_status, ba.painter_completed_by),
    painter_helper_work_status = public._bodyshop_floor_status_after_reopen(v_reset, ba.painter_helper_employee_code, ba.painter_helper_work_status, ba.painter_helper_in_ts),
    painter_helper_in_ts = public._bodyshop_floor_in_ts_after_reopen(v_reset, ba.painter_helper_employee_code, ba.painter_helper_work_status, ba.painter_helper_in_ts),
    painter_helper_out_ts = public._bodyshop_floor_out_ts_after_reopen(v_reset, ba.painter_helper_employee_code, ba.painter_helper_work_status, ba.painter_helper_out_ts),
    painter_helper_completed_by = public._bodyshop_floor_completed_by_after_reopen(v_reset, ba.painter_helper_employee_code, ba.painter_helper_work_status, ba.painter_helper_completed_by),
    technician_work_status = public._bodyshop_floor_status_after_reopen(v_reset, ba.technician_employee_code, ba.technician_work_status, ba.technician_in_ts),
    technician_in_ts = public._bodyshop_floor_in_ts_after_reopen(v_reset, ba.technician_employee_code, ba.technician_work_status, ba.technician_in_ts),
    technician_out_ts = public._bodyshop_floor_out_ts_after_reopen(v_reset, ba.technician_employee_code, ba.technician_work_status, ba.technician_out_ts),
    technician_completed_by = public._bodyshop_floor_completed_by_after_reopen(v_reset, ba.technician_employee_code, ba.technician_work_status, ba.technician_completed_by),
    rubbing_work_status = public._bodyshop_floor_status_after_reopen(v_reset, ba.rubbing_employee_code, ba.rubbing_work_status, ba.rubbing_in_ts),
    rubbing_in_ts = public._bodyshop_floor_in_ts_after_reopen(v_reset, ba.rubbing_employee_code, ba.rubbing_work_status, ba.rubbing_in_ts),
    rubbing_out_ts = public._bodyshop_floor_out_ts_after_reopen(v_reset, ba.rubbing_employee_code, ba.rubbing_work_status, ba.rubbing_out_ts),
    rubbing_completed_by = public._bodyshop_floor_completed_by_after_reopen(v_reset, ba.rubbing_employee_code, ba.rubbing_work_status, ba.rubbing_completed_by),
    updated_at = now()
  WHERE ba.id = v_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'assignment_id', v_row.id,
    'job_card_number', v_jc,
    'roles_reset_to_in_process', v_reset_count,
    'reset_worker_roles', v_reset
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_bodyshop_floor_for_rework(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_bodyshop_floor_for_rework(text, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.reopen_bodyshop_floor_for_rework(text, text, boolean) IS
  'Clears bs_floor_completed and sets completed worker/floor-incharge slots back to work_inprocess for rework. Prior daily logs are kept.';