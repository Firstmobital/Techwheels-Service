-- BODYSHOP-RECOVERY-001 / DBL-0035
-- More modal: get_bodyshop_recovery_case ordered documents by d.id but the
-- subquery did not select id. Include doc.id. Do not re-run DBL-0033.
-- Timestamp 20260904210000 because 20260904200000 is DBL-0034.
-- Safe to re-run.

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

GRANT EXECUTE ON FUNCTION public.get_bodyshop_recovery_case(integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
