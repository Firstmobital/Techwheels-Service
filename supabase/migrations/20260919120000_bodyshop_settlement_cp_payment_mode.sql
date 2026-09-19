-- BODYSHOP-SETTLEMENT-001 / Stage 18 DO Payment
-- Persist Customer Payment (CP) mode of payment on the existing settlement line.
-- Main / GST / TDS remain insurance components and stay NULL.
-- Historical CP rows stay NULL. Safe to re-run.

ALTER TABLE public.bodyshop_settlement_lines
  ADD COLUMN IF NOT EXISTS payment_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'bodyshop_settlement_lines_payment_mode_check'
       AND conrelid = 'public.bodyshop_settlement_lines'::regclass
  ) THEN
    ALTER TABLE public.bodyshop_settlement_lines
      ADD CONSTRAINT bodyshop_settlement_lines_payment_mode_check
      CHECK (
        payment_mode IS NULL
        OR payment_mode = ANY (ARRAY['cash', 'upi', 'card', 'cheque', 'bank', 'other']::text[])
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.bodyshop_settlement_lines.payment_mode IS
  'Customer Payment (CP) receipt mode. Same stored values as accounts_mechanical_payment_lines.payment_mode. NULL for insurance Main/GST/TDS, refunds, and historical CP rows.';

DROP FUNCTION IF EXISTS public.add_bodyshop_settlement_line(integer, text, text, text, numeric, date, text, text, numeric, numeric, numeric, text);

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
  p_tds_amount numeric DEFAULT NULL,
  p_import_row_token text DEFAULT NULL,
  p_payment_mode text DEFAULT NULL
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
  v_token text;
  v_mode text;
BEGIN
  v_token := NULLIF(btrim(p_import_row_token), '');
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
        txn_date, reference, remarks, actor_id, actor_email, import_row_token
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'MAIN', v_main,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email, v_token
      );
    END IF;
    IF v_gst > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email, import_row_token
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'GST', v_gst,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email, v_token
      );
    END IF;
    IF v_tds > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email, import_row_token
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'TDS', v_tds,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email, v_token
      );
    END IF;
    UPDATE public.bodyshop_settlements SET do_not_received = false, updated_by = v_actor_email WHERE id = v_id;
    PERFORM public.recalc_bodyshop_settlement(v_id);
    RETURN public.get_bodyshop_settlement(p_repair_card_id);
  END IF;

  v_mode := lower(btrim(COALESCE(p_payment_mode, '')));
  IF v_mode = '' THEN
    v_mode := NULL;
  ELSIF v_mode NOT IN ('cash', 'upi', 'card', 'cheque', 'bank', 'other') THEN
    RAISE EXCEPTION 'invalid payment_mode'
      USING ERRCODE = '23514';
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
        txn_date, reference, remarks, actor_id, actor_email, import_row_token, payment_mode
      ) VALUES (
        v_id, p_repair_card_id, 'customer', 'receipt', 'CUSTOMER', round(p_amount, 2),
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email, v_token, v_mode
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
        txn_date, reference, remarks, actor_id, actor_email, import_row_token
      ) VALUES (
        v_id, p_repair_card_id, 'customer', 'refund', 'CUSTOMER_REFUND', round(p_amount, 2),
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email, v_token
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

COMMENT ON FUNCTION public.add_bodyshop_settlement_line(integer, text, text, text, numeric, date, text, text, numeric, numeric, numeric, text, text) IS
  'Post DO Main/GST/TDS (extra over DO allowed) or customer receipt/refund. Optional import_row_token is Excel bulk idempotency. Optional p_payment_mode applies only to customer receipt (CP) rows.';

GRANT EXECUTE ON FUNCTION public.add_bodyshop_settlement_line(integer, text, text, text, numeric, date, text, text, numeric, numeric, numeric, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
