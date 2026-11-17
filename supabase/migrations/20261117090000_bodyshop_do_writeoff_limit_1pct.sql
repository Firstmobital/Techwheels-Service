-- BODYSHOP-DO-WRITEOFF-001 follow-up: raise the DO residual write-off limit from 0.5% to 1% of the DO amount.
-- * Only write_off_bodyshop_do_residual changes (limit check due * 100 <= do_amount, message and comment).
-- * Admin bypass, remark requirement, permission and WAIVER line behaviour are unchanged. Existing write-off lines untouched.
-- * Same signature and grants (CREATE OR REPLACE keeps them; REVOKE/GRANT repeated for safety).
-- Apply per DB_CHANGE_PROTOCOL. Ledger: DBL-0100. Requires DBL-0099.
--
-- ROLLBACK:
--   Re-create write_off_bodyshop_do_residual from 20261116233000_bodyshop_do_residual_writeoff.sql (due * 200 limit).

CREATE OR REPLACE FUNCTION public.write_off_bodyshop_do_residual(
  p_repair_card_id integer,
  p_remark text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
AS $$
DECLARE
  v_id bigint;
  v_h public.bodyshop_settlements%ROWTYPE;
  v_actor_id uuid;
  v_actor_email text;
  v_remark text := nullif(btrim(COALESCE(p_remark, '')), '');
BEGIN
  IF NOT public.bodyshop_settlement_can_post_do(p_repair_card_id) THEN
    RAISE EXCEPTION 'permission denied: requires accounts, recovery or bodyshop_repair modify'
      USING ERRCODE = '42501';
  END IF;
  IF v_remark IS NULL OR length(v_remark) < 3 THEN
    RAISE EXCEPTION 'A remark (reason) is required for a write-off'
      USING ERRCODE = '23514';
  END IF;

  v_id := public._bodyshop_ensure_settlement(p_repair_card_id);
  PERFORM public.recalc_bodyshop_settlement(v_id);
  SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = v_id;

  IF v_h.do_amount IS NULL OR v_h.do_amount <= 0 THEN
    RAISE EXCEPTION 'DO amount must be captured before a write-off'
      USING ERRCODE = '23514';
  END IF;
  IF COALESCE(v_h.insurance_due_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'No insurance due left to write off'
      USING ERRCODE = '23514';
  END IF;
  IF v_h.insurance_due_amount * 100 > v_h.do_amount AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Remaining % is above 1%% of the DO amount (%). Post Main/GST/TDS lines instead.',
      to_char(v_h.insurance_due_amount, 'FM999G999G990D00'), to_char(v_h.do_amount, 'FM999G999G990D00')
      USING ERRCODE = '23514';
  END IF;

  SELECT a.actor_id, a.actor_email INTO v_actor_id, v_actor_email
    FROM public._bodyshop_settlement_actor() a;

  INSERT INTO public.bodyshop_settlement_lines (
    settlement_id, repair_card_id, party, line_type, component, amount,
    txn_date, reference, remarks, actor_id, actor_email
  ) VALUES (
    v_id, p_repair_card_id, 'insurance', 'waiver', 'WAIVER', v_h.insurance_due_amount,
    CURRENT_DATE, 'Write-off (not cash)', v_remark, v_actor_id, v_actor_email
  );

  UPDATE public.bodyshop_settlements SET do_not_received = false, updated_by = v_actor_email WHERE id = v_id;
  PERFORM public.recalc_bodyshop_settlement(v_id);
  RETURN public.get_bodyshop_settlement(p_repair_card_id);
END;
$$;

COMMENT ON FUNCTION public.write_off_bodyshop_do_residual(integer, text) IS 'DBL-0099: write off remaining insurance due as a WAIVER line (not cash). Limit 1% of DO amount unless admin. Remark required.';

REVOKE ALL ON FUNCTION public.write_off_bodyshop_do_residual(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_off_bodyshop_do_residual(integer, text) TO authenticated, service_role;
