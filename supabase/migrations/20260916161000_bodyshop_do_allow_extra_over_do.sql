-- BODYSHOP-SETTLEMENT-001 / DBL-0071
-- Allow Main + GST + TDS to exceed DO amount (extra DO / insurance receipt).
-- Insurance due stays >= 0; Released stores the full posted total.
-- Do not re-run DBL-0026 / DBL-0029 / DBL-0045.
-- Timestamp 20260916161000 because 20260916150000 is DBL-0070.

CREATE OR REPLACE FUNCTION public.recalc_bodyshop_settlement(p_settlement_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_h public.bodyshop_settlements%ROWTYPE;
  v_released numeric(14,2);
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
    ELSE GREATEST(round(v_h.do_amount - v_released, 2), 0)
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

CREATE OR REPLACE FUNCTION public.add_bodyshop_settlement_line(
  p_repair_card_id integer,
  p_party text DEFAULT NULL,
  p_line_type text DEFAULT NULL,
  p_component text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_txn_date date DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_main_amount numeric DEFAULT NULL,
  p_gst_amount numeric DEFAULT NULL,
  p_tds_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_id bigint;
  v_h public.bodyshop_settlements%ROWTYPE;
  v_actor_id uuid;
  v_actor_email text;
  v_date date;
  v_main numeric;
  v_gst numeric;
  v_tds numeric;
BEGIN
  v_main := CASE WHEN COALESCE(p_main_amount, 0) > 0 THEN round(p_main_amount, 2) ELSE 0 END;
  v_gst := CASE WHEN COALESCE(p_gst_amount, 0) > 0 THEN round(p_gst_amount, 2) ELSE 0 END;
  v_tds := CASE WHEN COALESCE(p_tds_amount, 0) > 0 THEN round(p_tds_amount, 2) ELSE 0 END;

  IF v_main > 0 OR v_gst > 0 OR v_tds > 0 THEN
    IF NOT public.bodyshop_settlement_can_post_do(p_repair_card_id) THEN
      RAISE EXCEPTION 'permission denied: requires bodyshop_recovery view or bodyshop_repair modify'
        USING ERRCODE = '42501';
    END IF;

    v_id := public._bodyshop_ensure_settlement(p_repair_card_id);
    SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = v_id;
    SELECT a.actor_id, a.actor_email INTO v_actor_id, v_actor_email
      FROM public._bodyshop_settlement_actor() a;
    v_date := COALESCE(p_txn_date, CURRENT_DATE);

    IF v_h.do_amount IS NULL THEN
      RAISE EXCEPTION 'DO amount must be captured before posting DO payment'
        USING ERRCODE = '23514';
    END IF;

    IF v_main > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'MAIN', v_main,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email
      );
    END IF;
    IF v_gst > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'GST', v_gst,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email
      );
    END IF;
    IF v_tds > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'TDS', v_tds,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email
      );
    END IF;
    UPDATE public.bodyshop_settlements SET do_not_received = false, updated_by = v_actor_email WHERE id = v_id;
    PERFORM public.recalc_bodyshop_settlement(v_id);
    RETURN public.get_bodyshop_settlement(p_repair_card_id);
  END IF;

  IF NOT public.bodyshop_settlement_can_post_customer(p_repair_card_id) THEN
    RAISE EXCEPTION 'permission denied: requires accounts view or bodyshop_repair modify'
      USING ERRCODE = '42501';
  END IF;

  v_id := public._bodyshop_ensure_settlement(p_repair_card_id);
  SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = v_id;
  SELECT a.actor_id, a.actor_email INTO v_actor_id, v_actor_email
    FROM public._bodyshop_settlement_actor() a;
  v_date := COALESCE(p_txn_date, CURRENT_DATE);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than 0' USING ERRCODE = '23514';
  END IF;

  IF upper(btrim(COALESCE(p_component, ''))) IN ('CUSTOMER', 'CUSTOMER_REFUND')
     OR lower(btrim(COALESCE(p_party, ''))) = 'customer' THEN
    PERFORM public.recalc_bodyshop_settlement(v_id);
    SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = v_id;
    IF v_h.customer_settlement_kind IS NULL OR v_h.customer_settlement_kind = 'none' THEN
      RAISE EXCEPTION 'no customer due or refund to post against'
        USING ERRCODE = '23514';
    END IF;
    IF v_h.customer_settlement_kind = 'due' THEN
      IF upper(btrim(COALESCE(p_component, 'CUSTOMER'))) = 'CUSTOMER_REFUND'
         OR lower(btrim(COALESCE(p_line_type, 'receipt'))) = 'refund' THEN
        RAISE EXCEPTION 'refunds are not allowed when customer diff is recoverable'
          USING ERRCODE = '23514';
      END IF;
      IF round(p_amount, 2) > round(COALESCE(v_h.customer_remaining_amount, 0), 2) THEN
        RAISE EXCEPTION 'customer receipt cannot exceed remaining recoverable'
          USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email
      ) VALUES (
        v_id, p_repair_card_id, 'customer', 'receipt', 'CUSTOMER', round(p_amount, 2),
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email
      );
    ELSE
      IF upper(btrim(COALESCE(p_component, 'CUSTOMER_REFUND'))) = 'CUSTOMER'
         OR lower(btrim(COALESCE(p_line_type, 'refund'))) = 'receipt' THEN
        RAISE EXCEPTION 'receipts are not allowed when customer diff is a refund'
          USING ERRCODE = '23514';
      END IF;
      IF round(p_amount, 2) > round(COALESCE(v_h.customer_remaining_amount, 0), 2) THEN
        RAISE EXCEPTION 'customer refund cannot exceed remaining refund'
          USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email
      ) VALUES (
        v_id, p_repair_card_id, 'customer', 'refund', 'CUSTOMER_REFUND', round(p_amount, 2),
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email
      );
    END IF;
    UPDATE public.bodyshop_settlements SET customer_not_received = false, updated_by = v_actor_email WHERE id = v_id;
    PERFORM public.recalc_bodyshop_settlement(v_id);
    RETURN public.get_bodyshop_settlement(p_repair_card_id);
  END IF;

  RAISE EXCEPTION 'unsupported settlement line; use Main/GST/TDS batch or customer amount'
    USING ERRCODE = '23514';
END;
$$;

COMMENT ON FUNCTION public.add_bodyshop_settlement_line(integer, text, text, text, numeric, date, text, text, numeric, numeric, numeric) IS
  'Post DO Main/GST/TDS (extra over DO allowed) or customer receipt/refund. Recalc clamps insurance due at ₹0.';

GRANT EXECUTE ON FUNCTION public.recalc_bodyshop_settlement(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_bodyshop_settlement_line(integer, text, text, text, numeric, date, text, text, numeric, numeric, numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
