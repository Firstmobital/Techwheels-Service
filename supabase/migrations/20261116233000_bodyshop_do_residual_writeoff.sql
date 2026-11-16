-- BODYSHOP-DO-WRITEOFF-001: small insurance/DO residuals are written off as WAIVER lines, not posted as MAIN cash.
-- * New RPC write_off_bodyshop_do_residual(card, remark): posts one insurance line (line_type 'waiver',
--   component 'WAIVER') for the full remaining insurance due. Uses the existing WAIVER values already allowed
--   by bodyshop_settlement_lines constraints, so no schema change.
-- * Allowed only when 0 < insurance_due <= 0.5% of DO amount (due * 200 <= do_amount). Admin may bypass the limit.
-- * Remark is required (min 3 characters). Permission: bodyshop_settlement_can_post_do (same as DO posting).
-- * recalc_bodyshop_settlement: insurance_due = do_amount - cash released (MAIN/GST/TDS) - non-reversed WAIVER.
--   do_released_amount stays cash only, so cash / bank / BUSY / Recovery totals (which filter do_component
--   MAIN/GST/TDS) are unchanged by write-offs.
-- * reverse_bodyshop_settlement_line: insurance 'waiver' lines are reversible with the DO-post permission.
-- * Existing lines are not touched. The old Rs 1.10 MAIN line (if any) is left as is.
-- Apply per DB_CHANGE_PROTOCOL. Ledger: DBL-0099.
--
-- ROLLBACK:
--   Reverse every non-reversed WAIVER line first (Reverse button), otherwise insurance due will jump back.
--   Then re-create recalc_bodyshop_settlement and reverse_bodyshop_settlement_line from the DBL-0098-era
--   supabase/backups/full_metadata.sql (remove v_waived and the 'waiver' branch), and
--   DROP FUNCTION public.write_off_bodyshop_do_residual(integer, text);

CREATE OR REPLACE FUNCTION public.recalc_bodyshop_settlement(p_settlement_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_h public.bodyshop_settlements%ROWTYPE;
  v_released numeric(14,2);
  v_waived numeric(14,2);
  v_posted numeric(14,2);
  v_diff numeric(14,2);
  v_kind text;
  v_ins_due numeric(14,2);
  v_cust_rem numeric(14,2);
  v_do_pay text;
  v_cust_pay text;
  v_overall text;
  v_actor text;
BEGIN
  SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement % not found', p_settlement_id USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_released
    FROM public.bodyshop_settlement_lines
   WHERE settlement_id = p_settlement_id
     AND is_reversed = false
     AND party = 'insurance'
     AND line_type = 'do_component'
     AND component IN ('MAIN', 'GST', 'TDS');

  -- DBL-0099: insurance write-offs (WAIVER) reduce insurance due but are not cash received.
  SELECT COALESCE(SUM(amount), 0)
    INTO v_waived
    FROM public.bodyshop_settlement_lines
   WHERE settlement_id = p_settlement_id
     AND is_reversed = false
     AND party = 'insurance'
     AND line_type = 'waiver'
     AND component = 'WAIVER';

  v_diff := CASE
    WHEN v_h.invoice_amount IS NOT NULL AND v_h.do_amount IS NOT NULL
      THEN v_h.invoice_amount - v_h.do_amount
    ELSE v_h.customer_diff_amount
  END;

  v_kind := CASE
    WHEN v_diff IS NULL THEN NULL
    WHEN v_diff > 0 THEN 'due'
    WHEN v_diff < 0 THEN 'refund'
    ELSE 'none'
  END;

  IF v_kind = 'due' THEN
    SELECT COALESCE(SUM(amount), 0)
      INTO v_posted
      FROM public.bodyshop_settlement_lines
     WHERE settlement_id = p_settlement_id
       AND is_reversed = false
       AND party = 'customer'
       AND line_type = 'receipt'
       AND component = 'CUSTOMER';
  ELSIF v_kind = 'refund' THEN
    SELECT COALESCE(SUM(amount), 0)
      INTO v_posted
      FROM public.bodyshop_settlement_lines
     WHERE settlement_id = p_settlement_id
       AND is_reversed = false
       AND party = 'customer'
       AND line_type = 'refund'
       AND component = 'CUSTOMER_REFUND';
  ELSE
    v_posted := 0;
  END IF;

  -- Extra Main/GST/TDS above DO is allowed; due does not go negative.
  v_ins_due := CASE
    WHEN v_h.do_amount IS NULL THEN NULL
    ELSE GREATEST(round(v_h.do_amount - v_released - v_waived, 2), 0)
  END;
  v_cust_rem := CASE
    WHEN v_diff IS NULL THEN NULL
    WHEN v_kind = 'none' THEN 0
    ELSE abs(v_diff) - v_posted
  END;

  IF v_h.do_amount IS NULL THEN
    v_do_pay := 'pending';
  ELSIF v_h.do_not_received AND v_released = 0 THEN
    v_do_pay := 'not_received';
  ELSIF v_ins_due = v_h.do_amount THEN
    v_do_pay := 'pending';
  ELSIF v_ins_due > 0 THEN
    v_do_pay := 'partial';
  ELSE
    v_do_pay := 'received';
  END IF;

  IF v_kind IS NULL THEN
    v_cust_pay := 'pending';
  ELSIF v_kind = 'none' THEN
    v_cust_pay := 'received';
  ELSIF v_h.customer_not_received AND v_posted = 0 THEN
    v_cust_pay := 'not_received';
  ELSIF v_cust_rem = abs(v_diff) THEN
    v_cust_pay := 'pending';
  ELSIF v_cust_rem > 0 THEN
    v_cust_pay := 'partial';
  ELSE
    v_cust_pay := 'received';
  END IF;

  IF v_do_pay = 'not_received' AND v_cust_pay = 'not_received' THEN
    v_overall := 'not_received';
  ELSIF v_do_pay = 'received' AND v_cust_pay = 'received' THEN
    v_overall := 'received';
  ELSIF v_do_pay IN ('partial', 'received', 'not_received')
     OR v_cust_pay IN ('partial', 'received', 'not_received') THEN
    IF (v_do_pay IN ('partial', 'received') OR v_cust_pay IN ('partial', 'received'))
       AND NOT (v_do_pay = 'received' AND v_cust_pay = 'received') THEN
      v_overall := 'partial';
    ELSIF v_do_pay = 'pending' AND v_cust_pay = 'pending' THEN
      v_overall := 'pending';
    ELSE
      v_overall := 'partial';
    END IF;
  ELSE
    v_overall := 'pending';
  END IF;

  v_actor := COALESCE(v_h.updated_by, v_h.created_by);

  UPDATE public.bodyshop_settlements
     SET customer_diff_amount = v_diff,
         customer_settlement_kind = v_kind,
         do_released_amount = v_released,
         insurance_due_amount = v_ins_due,
         customer_posted_amount = v_posted,
         customer_remaining_amount = v_cust_rem,
         outstanding_amount = COALESCE(v_ins_due, 0) + COALESCE(v_cust_rem, 0),
         do_payment_status = v_do_pay,
         customer_payment_status = v_cust_pay,
         derived_payment_status = v_overall,
         updated_at = now()
   WHERE id = p_settlement_id;

  UPDATE public.bodyshop_repair_cards
     SET billed_amount = v_h.invoice_amount,
         do_amount = v_h.do_amount,
         do_status = COALESCE(v_h.do_status, do_status),
         customer_diff_amount = v_diff,
         do_payment_status = v_do_pay,
         customer_payment_status = v_cust_pay,
         customer_settlement_kind = v_kind,
         payment_status = v_overall,
         updated_at = now()
   WHERE id = v_h.repair_card_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_bodyshop_settlement_line(p_line_id bigint, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
DECLARE
  v_line public.bodyshop_settlement_lines%ROWTYPE;
  v_actor_id uuid;
  v_actor_email text;
  v_allowed boolean;
BEGIN
  SELECT * INTO v_line FROM public.bodyshop_settlement_lines WHERE id = p_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'line % not found', p_line_id USING ERRCODE = 'P0002';
  END IF;

  IF v_line.party = 'insurance' AND v_line.line_type IN ('do_component', 'waiver') THEN
    v_allowed := public.bodyshop_settlement_can_post_do(v_line.repair_card_id);
  ELSIF v_line.party = 'customer' THEN
    v_allowed := public.bodyshop_settlement_can_post_customer(v_line.repair_card_id);
  ELSE
    v_allowed := public.bodyshop_settlement_can_modify(v_line.repair_card_id);
  END IF;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'permission denied'
      USING ERRCODE = '42501';
  END IF;

  IF v_line.is_reversed OR v_line.line_type = 'reversal' THEN
    RAISE EXCEPTION 'line is already reversed' USING ERRCODE = '23514';
  END IF;

  SELECT a.actor_id, a.actor_email INTO v_actor_id, v_actor_email
    FROM public._bodyshop_settlement_actor() a;

  INSERT INTO public.bodyshop_settlement_lines (
    settlement_id, repair_card_id, party, line_type, component, amount,
    txn_date, reference, remarks, reverses_line_id, actor_id, actor_email
  ) VALUES (
    v_line.settlement_id, v_line.repair_card_id, v_line.party, 'reversal', v_line.component, v_line.amount,
    CURRENT_DATE, v_line.reference, COALESCE(p_reason, 'reversed'), p_line_id, v_actor_id, v_actor_email
  );

  PERFORM public._bodyshop_settlement_mark_line_reversed(p_line_id);
  PERFORM public.recalc_bodyshop_settlement(v_line.settlement_id);
  RETURN public.get_bodyshop_settlement(v_line.repair_card_id);
END;
$$;

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
  IF v_h.insurance_due_amount * 200 > v_h.do_amount AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Remaining % is above 0.5%% of the DO amount (%). Post Main/GST/TDS lines instead.',
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

COMMENT ON FUNCTION public.write_off_bodyshop_do_residual(integer, text) IS 'DBL-0099: write off remaining insurance due as a WAIVER line (not cash). Limit 0.5% of DO amount unless admin. Remark required.';

REVOKE ALL ON FUNCTION public.write_off_bodyshop_do_residual(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_off_bodyshop_do_residual(integer, text) TO authenticated, service_role;
