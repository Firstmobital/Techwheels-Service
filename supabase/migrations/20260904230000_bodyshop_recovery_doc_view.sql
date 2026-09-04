-- BODYSHOP-RECOVERY-001 / DBL-0037
-- Recovery More → View: autodoc storage is dealer-scoped, but Recovery is org-wide
-- (NO-DEALER / other-dealer logins get "Object not found" on createSignedUrl).
-- Allow recovery view/modify to SELECT bodyshop-docs objects. Prefer Drive URL
-- when present (no schema change). Also fix export ORDER BY l.id (column missing).
-- Do not re-run DBL-0034 / DBL-0035. Timestamp 20260904230000.
-- Safe to re-run.

DROP POLICY IF EXISTS "autodoc objects: recovery read" ON storage.objects;
CREATE POLICY "autodoc objects: recovery read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'autodoc'
    AND position('/service-advisor-bodyshop-docs/' in name) > 0
    AND (
      public.has_module_view('bodyshop_recovery')
      OR public.has_module_modify('bodyshop_recovery')
    )
  );

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
        NULLIF(btrim(COALESCE(doc.drive_url, '')), '') AS drive_url,
        NULLIF(btrim(COALESCE(doc.drive_file_id, '')), '') AS drive_file_id,
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

CREATE OR REPLACE FUNCTION public.export_bodyshop_do_recovery(p_repair_card_ids integer[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security = off
AS $$
DECLARE
  v_ids integer[];
  v_cases jsonb;
  v_lines jsonb;
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

  v_ids := COALESCE((
    SELECT ARRAY_AGG(DISTINCT x)
    FROM unnest(COALESCE(p_repair_card_ids, ARRAY[]::integer[])) AS x
    WHERE x IS NOT NULL
  ), ARRAY[]::integer[]);

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.insurance_due_amount DESC NULLS LAST, c.repair_card_id), '[]'::jsonb)
    INTO v_cases
    FROM (
      SELECT
        brc.id AS repair_card_id,
        brc.job_card_no,
        brc.reg_number,
        brc.customer_name,
        brc.customer_phone,
        brc.branch,
        brc.sa_name,
        brc.insurance_company,
        brc.insurance_policy_no,
        brc.claim_intimation_no,
        s.invoice_number,
        s.invoice_date,
        s.invoice_amount,
        s.invoice_account,
        s.do_amount,
        s.do_released_amount,
        s.insurance_due_amount,
        s.do_payment_status,
        public.bodyshop_insurer_payer_mismatch(brc.insurance_company, s.invoice_account) AS insurer_mismatch
      FROM public.bodyshop_repair_cards brc
      LEFT JOIN public.bodyshop_settlements s ON s.repair_card_id = brc.id
      WHERE brc.id = ANY (v_ids)
    ) c;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.repair_card_id, l.created_at, l.id), '[]'::jsonb)
    INTO v_lines
    FROM (
      SELECT
        sl.id,
        sl.repair_card_id,
        brc.job_card_no,
        brc.reg_number,
        sl.component,
        sl.line_type,
        sl.amount,
        sl.reference,
        sl.remarks,
        sl.actor_email,
        sl.created_at,
        sl.is_reversed
      FROM public.bodyshop_settlement_lines sl
      JOIN public.bodyshop_repair_cards brc ON brc.id = sl.repair_card_id
      WHERE sl.repair_card_id = ANY (v_ids)
    ) l;

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.repair_card_id, d.doc_key), '[]'::jsonb)
    INTO v_docs
    FROM (
      SELECT
        doc.repair_card_id,
        brc.job_card_no,
        brc.reg_number,
        doc.doc_key,
        doc.file_name,
        NULLIF(btrim(COALESCE(doc.drive_url, '')), '') AS drive_url,
        doc.storage_bucket,
        doc.storage_path
      FROM public.bodyshop_repair_card_documents doc
      JOIN public.bodyshop_repair_cards brc ON brc.id = doc.repair_card_id
      WHERE doc.repair_card_id = ANY (v_ids)
    ) d;

  RETURN jsonb_build_object(
    'cases', v_cases,
    'lines', v_lines,
    'documents', v_docs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bodyshop_recovery_case(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_bodyshop_do_recovery(integer[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
