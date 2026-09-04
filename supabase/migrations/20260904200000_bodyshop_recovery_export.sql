-- BODYSHOP-RECOVERY-001 / DBL-0034
-- Recovery Excel export payload (More fields, posted lines, document URLs)
-- plus shared insurer mismatch helper (policy vs DMS bill-to, C/O stripped).
-- Do not re-run DBL-0031 / DBL-0032 / DBL-0033.
-- Timestamp 20260904200000 because 20260904190000 is DBL-0033.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.bodyshop_insurer_payer_mismatch(p_policy text, p_bill_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    v.p <> '' AND v.b <> ''
    AND position(split_part(v.p, ' ', 1) in v.b) = 0
    AND position(split_part(v.b, ' ', 1) in v.p) = 0
  FROM (
    SELECT
      regexp_replace(
        regexp_replace(lower(btrim(split_part(lower(COALESCE(p_policy, '')), ' c/o ', 1))), '^m/s\.?\s+', ''),
        '^the\s+',
        ''
      ) AS p,
      regexp_replace(
        regexp_replace(lower(btrim(split_part(lower(COALESCE(p_bill_to, '')), ' c/o ', 1))), '^m/s\.?\s+', ''),
        '^the\s+',
        ''
      ) AS b
  ) v;
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

GRANT EXECUTE ON FUNCTION public.bodyshop_insurer_payer_mismatch(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_bodyshop_do_recovery(integer[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
