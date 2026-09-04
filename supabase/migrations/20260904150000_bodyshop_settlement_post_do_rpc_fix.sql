-- BODYSHOP-SETTLEMENT-001 / DBL-0029
-- Post DO payment 400: SECURITY DEFINER writes were blocked by RLS (no INSERT
-- policy) and the write RPC needed row_security off + paise rounding.
-- Do not re-run DBL-0026. This file is safe to re-run.
-- Timestamp 20260904150000 because 20260904140000 is DBL-0028 (payroll).

-- Actor: do not SELECT auth.users (JWT email is enough).
CREATE OR REPLACE FUNCTION public._bodyshop_settlement_actor()
RETURNS TABLE (actor_id uuid, actor_email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  RETURN QUERY
  SELECT auth.uid(),
         COALESCE(auth.jwt() ->> 'email', auth.uid()::text);
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
SET row_security = off
AS $$
DECLARE
  v_id bigint;
  v_h public.bodyshop_settlements%ROWTYPE;
  v_actor_id uuid;
  v_actor_email text;
  v_date date;
  v_new_release numeric;
  v_main numeric;
  v_gst numeric;
  v_tds numeric;
BEGIN
  IF NOT public.bodyshop_settlement_can_modify(p_repair_card_id) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_repair modify'
      USING ERRCODE = '42501';
  END IF;

  v_id := public._bodyshop_ensure_settlement(p_repair_card_id);
  SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = v_id;
  SELECT a.actor_id, a.actor_email INTO v_actor_id, v_actor_email
    FROM public._bodyshop_settlement_actor() a;
  v_date := COALESCE(p_txn_date, CURRENT_DATE);
  v_main := CASE WHEN COALESCE(p_main_amount, 0) > 0 THEN round(p_main_amount, 2) ELSE 0 END;
  v_gst := CASE WHEN COALESCE(p_gst_amount, 0) > 0 THEN round(p_gst_amount, 2) ELSE 0 END;
  v_tds := CASE WHEN COALESCE(p_tds_amount, 0) > 0 THEN round(p_tds_amount, 2) ELSE 0 END;

  -- Batch Main/GST/TDS (GST may be omitted)
  IF v_main > 0 OR v_gst > 0 OR v_tds > 0 THEN
    IF v_h.do_amount IS NULL THEN
      RAISE EXCEPTION 'DO amount must be captured before posting DO payment'
        USING ERRCODE = '23514';
    END IF;
    v_new_release := round(COALESCE(v_h.do_released_amount, 0), 2) + v_main + v_gst + v_tds;
    IF v_new_release > round(v_h.do_amount, 2) THEN
      RAISE EXCEPTION 'Main + GST + TDS cannot exceed DO amount'
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

ALTER FUNCTION public.upsert_bodyshop_settlement_header(integer, text, text, date, numeric, numeric, numeric, text, text, numeric, text, text)
  SET row_security = off;
ALTER FUNCTION public.recalc_bodyshop_settlement(bigint)
  SET row_security = off;
ALTER FUNCTION public._bodyshop_ensure_settlement(integer)
  SET row_security = off;
ALTER FUNCTION public.reverse_bodyshop_settlement_line(bigint, text)
  SET row_security = off;
ALTER FUNCTION public.mark_bodyshop_settlement_not_received(integer, text, text)
  SET row_security = off;

-- RLS: SELECT stays dealer-scoped. INSERT/UPDATE policies exist so SECURITY DEFINER
-- can write even if FORCE ROW LEVEL SECURITY is on. authenticated still has no
-- INSERT/UPDATE GRANT, so REST cannot write rows directly.
DROP POLICY IF EXISTS bodyshop_settlements_insert_internal ON public.bodyshop_settlements;
CREATE POLICY bodyshop_settlements_insert_internal ON public.bodyshop_settlements
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS bodyshop_settlements_update_internal ON public.bodyshop_settlements;
CREATE POLICY bodyshop_settlements_update_internal ON public.bodyshop_settlements
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bodyshop_settlement_lines_insert_internal ON public.bodyshop_settlement_lines;
CREATE POLICY bodyshop_settlement_lines_insert_internal ON public.bodyshop_settlement_lines
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS bodyshop_settlement_lines_update_internal ON public.bodyshop_settlement_lines;
CREATE POLICY bodyshop_settlement_lines_update_internal ON public.bodyshop_settlement_lines
  FOR UPDATE USING (true) WITH CHECK (true);

DO $$
DECLARE
  v_seq text;
BEGIN
  v_seq := pg_get_serial_sequence('public.bodyshop_settlements', 'id');
  IF v_seq IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO postgres, service_role', v_seq);
  END IF;
  v_seq := pg_get_serial_sequence('public.bodyshop_settlement_lines', 'id');
  IF v_seq IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO postgres, service_role', v_seq);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._bodyshop_settlement_actor() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.add_bodyshop_settlement_line(integer, text, text, text, numeric, date, text, text, numeric, numeric, numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
