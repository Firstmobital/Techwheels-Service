-- ACCOUNTS-001 / DBL-0048
-- Mechanical Capture: lookup a unique live DMS invoice by JC.
-- Fills invoice number / date / billed in the UI only. Does not write
-- accounts_mechanical_invoices or remaining/receipts.
-- 0 or 2+ live rows => unique=false. Skip Cancelled. Amount 0 is valid.
-- Safe to re-run. Authority: psf_revenue_dms + accounts_can_access.

CREATE OR REPLACE FUNCTION public.lookup_accounts_mechanical_dms_invoice(p_jc_number text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_jc text;
  v_count integer := 0;
  v_row public.psf_revenue_dms%ROWTYPE;
BEGIN
  IF NOT public.accounts_can_access() THEN
    RAISE EXCEPTION 'permission denied: requires accounts view'
      USING ERRCODE = '42501';
  END IF;

  v_jc := upper(btrim(COALESCE(p_jc_number, '')));
  IF v_jc = '' THEN
    RETURN jsonb_build_object(
      'jc_number', NULL,
      'match_count', 0,
      'unique', false,
      'invoice_number', NULL,
      'invoice_date', NULL,
      'total_invoice_amount', NULL
    );
  END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM public.psf_revenue_dms d
   WHERE upper(btrim(d.job_card_number)) = v_jc
     AND COALESCE(d.invoice_status, '') <> 'Cancelled'
     AND NULLIF(btrim(d.invoice_number), '') IS NOT NULL
     AND d.total_invoice_amount IS NOT NULL;

  IF v_count = 1 THEN
    SELECT *
      INTO v_row
      FROM public.psf_revenue_dms d
     WHERE upper(btrim(d.job_card_number)) = v_jc
       AND COALESCE(d.invoice_status, '') <> 'Cancelled'
       AND NULLIF(btrim(d.invoice_number), '') IS NOT NULL
       AND d.total_invoice_amount IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'jc_number', NULLIF(v_jc, ''),
    'match_count', v_count,
    'unique', (v_count = 1),
    'invoice_number', CASE WHEN v_count = 1 THEN NULLIF(btrim(v_row.invoice_number), '') ELSE NULL END,
    'invoice_date', CASE WHEN v_count = 1 THEN to_char(v_row.invoice_date, 'YYYY-MM-DD') ELSE NULL END,
    'total_invoice_amount', CASE WHEN v_count = 1 THEN v_row.total_invoice_amount ELSE NULL END
  );
END;
$$;

COMMENT ON FUNCTION public.lookup_accounts_mechanical_dms_invoice(text) IS
  'ACCOUNTS-001: Unique live psf_revenue_dms invoice for a mechanical JC. Capture form fill only; does not persist remaining.';

GRANT EXECUTE ON FUNCTION public.lookup_accounts_mechanical_dms_invoice(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
