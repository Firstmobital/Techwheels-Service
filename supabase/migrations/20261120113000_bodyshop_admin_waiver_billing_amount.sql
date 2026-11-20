-- Allow pre-billing waiver when billed_amount is set (parts_entry_status may still be pending on imports).

CREATE OR REPLACE FUNCTION public.bodyshop_admin_waive_pre_billing_stages(p_repair_card_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
SET row_security TO off
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_card public.bodyshop_repair_cards%ROWTYPE;
  v_reconcile jsonb;
  v_open_floor boolean;
BEGIN
  IF v_email <> 'admin@firstmobital.com' THEN
    RAISE EXCEPTION 'permission denied: admin waiver restricted'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_card FROM public.bodyshop_repair_cards WHERE id = p_repair_card_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'repair_card_not_found');
  END IF;

  IF lower(btrim(coalesce(v_card.overall_status, ''))) <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'card_not_active');
  END IF;

  IF COALESCE(v_card.billed_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'billing_amount_missing');
  END IF;

  IF v_card.pre_billing_stages_waived_at IS NOT NULL THEN
    PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(
      v_card.id, 1, 18, 'admin_waive_pre_billing_refresh'
    );
    RETURN jsonb_build_object(
      'ok', true,
      'already_waived', true,
      'waived_at', v_card.pre_billing_stages_waived_at,
      'waived_by', v_card.pre_billing_stages_waived_by
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.bodyshop_assignments ba
    WHERE ba.is_active = true
      AND ba.bs_floor_completed_at IS NULL
      AND (
        ba.repair_card_id = v_card.id
        OR upper(btrim(coalesce(ba.job_card_number, ''))) = upper(btrim(coalesce(v_card.job_card_no, '')))
      )
  ) INTO v_open_floor;

  IF v_open_floor AND lower(btrim(coalesce(v_card.floor_status, ''))) <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'open_floor_assignment');
  END IF;

  UPDATE public.bodyshop_repair_cards
  SET
    pre_billing_stages_waived_at = now(),
    pre_billing_stages_waived_by = v_email,
    updated_at = now()
  WHERE id = v_card.id;

  INSERT INTO public.bodyshop_repair_card_stage_history (
    repair_card_id, from_stage, to_stage, source, reason, actor
  ) VALUES (
    v_card.id,
    v_card.current_stage,
    v_card.current_stage,
    'admin_waive_pre_billing',
    'pre_billing_stages_waiver_projection_only',
    auth.uid()
  );

  PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(
    v_card.id, 1, 18, 'admin_waive_pre_billing'
  );

  PERFORM set_config('bodyshop.stage_change_reason', 'admin_waive_pre_billing', true);
  v_reconcile := public.bodyshop_reconcile_repair_card_current_stage(v_card.id);

  RETURN jsonb_build_object(
    'ok', true,
    'repair_card_id', v_card.id,
    'reconcile', v_reconcile,
    'waived_by', v_email
  );
END;
$$;