-- DO recovery pending/partial reason note on settlement header (Bodyshop Recovery list).

ALTER TABLE public.bodyshop_settlements
  ADD COLUMN IF NOT EXISTS do_recovery_remark text;

COMMENT ON COLUMN public.bodyshop_settlements.do_recovery_remark IS
  'Accounts/Recovery note explaining why insurance DO payment is still pending, partial, or not received.';

CREATE OR REPLACE FUNCTION public.set_bodyshop_do_recovery_remark(
  p_repair_card_id integer,
  p_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
SET row_security TO off
AS $$
DECLARE
  v_id bigint;
  v_remark text;
  v_actor text;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_modify('accounts')
    OR public.has_module_modify('bodyshop_recovery')
  ) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_recovery or accounts modify'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bodyshop_repair_cards WHERE id = p_repair_card_id
  ) THEN
    RAISE EXCEPTION 'repair card % not found', p_repair_card_id USING ERRCODE = 'P0002';
  END IF;

  v_id := public._bodyshop_ensure_settlement(p_repair_card_id);
  v_remark := NULLIF(btrim(COALESCE(p_remark, '')), '');
  SELECT a.actor_email INTO v_actor FROM public._bodyshop_settlement_actor() a;

  UPDATE public.bodyshop_settlements
     SET do_recovery_remark = v_remark,
         updated_by = v_actor,
         updated_at = now()
   WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'repair_card_id', p_repair_card_id,
    'do_recovery_remark', v_remark
  );
END;
$$;

COMMENT ON FUNCTION public.set_bodyshop_do_recovery_remark(integer, text) IS
  'Set trimmed DO recovery remark on bodyshop_settlements. Blank clears. Requires accounts or bodyshop_recovery modify.';

REVOKE ALL ON FUNCTION public.set_bodyshop_do_recovery_remark(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_bodyshop_do_recovery_remark(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_bodyshop_do_recovery_remark(integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.list_bodyshop_do_recovery()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
SET row_security TO off
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_view('bodyshop_recovery')
    OR public.has_module_modify('bodyshop_recovery')
  ) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_recovery view'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.insurance_due_amount DESC, x.invoice_date DESC NULLS LAST, x.repair_card_id DESC),
    '[]'::jsonb
  )
    INTO v_rows
    FROM (
      SELECT
        s.repair_card_id,
        s.job_card_no,
        c.reg_number,
        c.customer_name,
        c.branch,
        c.sa_name,
        c.insurance_company,
        c.overall_status,
        c.current_stage,
        s.invoice_number,
        s.invoice_date,
        s.invoice_amount,
        s.invoice_account,
        s.do_amount,
        s.do_released_amount,
        s.insurance_due_amount,
        s.do_payment_status,
        s.needs_accounts_review,
        s.do_recovery_remark
      FROM public.bodyshop_settlements s
      JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
      WHERE s.do_amount IS NOT NULL
        AND COALESCE(c.overall_status, 'active') <> 'cancelled'
    ) x;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.export_bodyshop_do_recovery(p_repair_card_ids integer[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
SET row_security TO off
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
        s.do_recovery_remark,
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