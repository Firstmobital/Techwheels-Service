-- BODYSHOP-RECOVERY-001 / DBL-0033
-- Recovery users post Stage 18 DO Payment (Main/GST/TDS) without bodyshop_repair.
-- More-case RPC returns identity + documents org-wide.
-- Customer posts and header upsert stay repair-modify only.
-- Do not re-run DBL-0026 / DBL-0029 / DBL-0031 / DBL-0032.
-- Timestamp 20260904190000 because 20260904180000 is DBL-0032.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.bodyshop_settlement_can_post_do(p_repair_card_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN true;
  END IF;
  IF public.has_module_view('bodyshop_recovery')
     OR public.has_module_modify('bodyshop_recovery') THEN
    RETURN true;
  END IF;
  RETURN public.bodyshop_settlement_can_modify(p_repair_card_id);
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

  IF NOT public.bodyshop_settlement_can_modify(p_repair_card_id) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_repair modify'
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

CREATE OR REPLACE FUNCTION public.reverse_bodyshop_settlement_line(
  p_line_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security = off
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

  IF v_line.party = 'insurance' AND v_line.line_type = 'do_component' THEN
    v_allowed := public.bodyshop_settlement_can_post_do(v_line.repair_card_id);
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

CREATE OR REPLACE FUNCTION public.get_bodyshop_recovery_case(p_repair_card_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security = off
AS $$
DECLARE
  v_card public.bodyshop_repair_cards%ROWTYPE;
  v_header public.bodyshop_settlements%ROWTYPE;
  v_docs jsonb;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_view('bodyshop_recovery')
    OR public.has_module_modify('bodyshop_recovery')
  ) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_recovery view'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_card FROM public.bodyshop_repair_cards WHERE id = p_repair_card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'repair card % not found', p_repair_card_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_header FROM public.bodyshop_settlements WHERE repair_card_id = p_repair_card_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.uploaded_at DESC, d.id DESC), '[]'::jsonb)
    INTO v_docs
    FROM (
      SELECT
        doc.id,
        doc.doc_key,
        doc.file_name,
        doc.content_type,
        doc.drive_url,
        doc.storage_bucket,
        doc.storage_path,
        doc.uploaded_at
      FROM public.bodyshop_repair_card_documents doc
      WHERE doc.repair_card_id = p_repair_card_id
    ) d;

  RETURN jsonb_build_object(
    'repair_card_id', v_card.id,
    'job_card_no', v_card.job_card_no,
    'reg_number', v_card.reg_number,
    'customer_name', v_card.customer_name,
    'customer_phone', v_card.customer_phone,
    'customer_type', v_card.customer_type,
    'branch', v_card.branch,
    'sa_name', v_card.sa_name,
    'insurance_company', v_card.insurance_company,
    'insurance_policy_no', v_card.insurance_policy_no,
    'claim_intimation_no', v_card.claim_intimation_no,
    'insurance_type', v_card.insurance_type,
    'insurance_valid_date', v_card.insurance_valid_date,
    'invoice_number', v_header.invoice_number,
    'invoice_date', v_header.invoice_date,
    'invoice_amount', v_header.invoice_amount,
    'invoice_account', v_header.invoice_account,
    'do_amount', v_header.do_amount,
    'do_released_amount', v_header.do_released_amount,
    'insurance_due_amount', v_header.insurance_due_amount,
    'do_payment_status', v_header.do_payment_status,
    'documents', v_docs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bodyshop_settlement_can_post_do(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_bodyshop_settlement_line(integer, text, text, text, numeric, date, text, text, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_bodyshop_settlement_line(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_bodyshop_recovery_case(integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
