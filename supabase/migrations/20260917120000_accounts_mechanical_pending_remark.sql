-- ACCOUNTS-001 / DBL-0075
-- Mechanical Accounts desk: persist Pending Remark on the existing invoice header.
-- Reuses accounts_mechanical_invoices.payment_notes (DBL-0045). Does not add a
-- second notes table or a second money ledger.
-- Distinct from keep_on_credit_reason and payment-line remark.
-- Does NOT change billed/received/remaining, payment_status, vouchers,
-- Keep on Credit, Gatepass, or Bodyshop settlement.
-- Safe to re-run. Do not re-run DBL-0045 / 0066 / 0073 / 0074.
-- Timestamp 20260917120000.
-- Authority: live accounts_mechanical_invoices.payment_notes (DBL-0045) +
--   upsert_accounts_mechanical_invoice (DBL-0074) +
--   list_accounts_mechanical_cases / accounts_mechanical_case_json (DBL-0066).

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Header field already exists. Document the Accounts-desk Pending Remark use.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.accounts_mechanical_invoices.payment_notes IS
  'DBL-0075: Mechanical Accounts Pending Remark (why payment is still outstanding). Invoice-header notes from DBL-0045. Not keep_on_credit_reason. Not payment-line remark. Survives settlement; recalc/receipts must not clear it.';

-- Authenticated still cannot INSERT/UPDATE/DELETE the table directly.
REVOKE INSERT, UPDATE, DELETE ON public.accounts_mechanical_invoices FROM authenticated, anon;
GRANT SELECT ON public.accounts_mechanical_invoices TO authenticated;
GRANT ALL ON public.accounts_mechanical_invoices TO service_role;

-- ---------------------------------------------------------------------------
-- B. Dedicated setter. Does not call recalc. Does not touch money or vouchers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_accounts_mechanical_pending_remark(
  p_reception_entry_id bigint,
  p_pending_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_entry public.service_reception_entries%ROWTYPE;
  v_remark text;
BEGIN
  IF NOT public.accounts_can_access() THEN
    RAISE EXCEPTION 'permission denied: requires accounts view'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_entry
    FROM public.service_reception_entries
   WHERE id = p_reception_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_entry.invoice_done_at IS NULL THEN
    RAISE EXCEPTION 'case is not Mark Done on Service Advisor'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.is_floor_incharge_service_type(v_entry.service_type) THEN
    RAISE EXCEPTION 'not a mechanical Floor Incharge service type'
      USING ERRCODE = '23514';
  END IF;
  IF NULLIF(btrim(v_entry.jc_number), '') IS NULL THEN
    RAISE EXCEPTION 'jc_number is required'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accounts_mechanical_invoices
     WHERE reception_entry_id = p_reception_entry_id
  ) THEN
    RAISE EXCEPTION 'capture invoice number and billed amount first'
      USING ERRCODE = '23514';
  END IF;

  v_remark := NULLIF(btrim(COALESCE(p_pending_remark, '')), '');

  UPDATE public.accounts_mechanical_invoices
     SET payment_notes = v_remark,
         updated_at = now()
   WHERE reception_entry_id = p_reception_entry_id;

  RETURN public.accounts_mechanical_case_json(p_reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.set_accounts_mechanical_pending_remark(bigint, text) IS
  'ACCOUNTS-001 / DBL-0075: Set Mechanical Pending Remark on accounts_mechanical_invoices.payment_notes. Trimmed blank stores NULL. Requires accounts access and an existing invoice header. Does not rewrite billed, amount_received, payment_status, payment lines, or vouchers. Does not delete the value when the case later becomes received.';

REVOKE ALL ON FUNCTION public.set_accounts_mechanical_pending_remark(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_accounts_mechanical_pending_remark(bigint, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C. Invoice capture must not wipe a saved Pending Remark when p_payment_notes
-- is omitted (current web client never sends it). After receipts, still preserve.
-- Keep DBL-0074 lock/fill/voucher-assign behaviour.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_accounts_mechanical_invoice(
  p_reception_entry_id bigint,
  p_invoice_number text DEFAULT NULL,
  p_invoice_date date DEFAULT NULL,
  p_billed_amount numeric DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_amount_received numeric DEFAULT NULL,
  p_payment_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_entry public.service_reception_entries%ROWTYPE;
  v_actor text;
  v_existing public.accounts_mechanical_invoices%ROWTYPE;
  v_has_lines boolean := false;
  v_invoice_number text;
  v_invoice_date date;
  v_billed numeric;
  v_notes text;
BEGIN
  IF NOT public.accounts_can_access() THEN
    RAISE EXCEPTION 'permission denied: requires accounts view'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_entry
    FROM public.service_reception_entries
   WHERE id = p_reception_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_entry.invoice_done_at IS NULL THEN
    RAISE EXCEPTION 'case is not Mark Done on Service Advisor'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.is_floor_incharge_service_type(v_entry.service_type) THEN
    RAISE EXCEPTION 'not a mechanical Floor Incharge service type'
      USING ERRCODE = '23514';
  END IF;
  IF NULLIF(btrim(v_entry.jc_number), '') IS NULL THEN
    RAISE EXCEPTION 'jc_number is required'
      USING ERRCODE = '23514';
  END IF;
  IF p_billed_amount IS NOT NULL AND p_billed_amount < 0 THEN
    RAISE EXCEPTION 'billed_amount cannot be negative'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_existing
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = p_reception_entry_id;

  IF FOUND THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.accounts_mechanical_payment_lines l
      WHERE l.reception_entry_id = p_reception_entry_id
    ) INTO v_has_lines;
  END IF;

  IF v_has_lines THEN
    v_invoice_number := COALESCE(
      NULLIF(btrim(v_existing.invoice_number), ''),
      NULLIF(btrim(p_invoice_number), '')
    );
    v_invoice_date := COALESCE(v_existing.invoice_date, p_invoice_date);
    v_billed := v_existing.billed_amount;
  ELSE
    v_invoice_number := NULLIF(btrim(p_invoice_number), '');
    v_invoice_date := p_invoice_date;
    v_billed := CASE WHEN p_billed_amount IS NULL THEN NULL ELSE round(p_billed_amount, 2) END;
  END IF;

  IF v_has_lines OR p_payment_notes IS NULL THEN
    v_notes := v_existing.payment_notes;
  ELSE
    v_notes := NULLIF(btrim(p_payment_notes), '');
  END IF;

  v_actor := COALESCE(
    NULLIF(auth.jwt() ->> 'email', ''),
    NULLIF(auth.uid()::text, ''),
    'system'
  );

  INSERT INTO public.accounts_mechanical_invoices (
    reception_entry_id, jc_number, invoice_number, invoice_date, billed_amount,
    payment_status, amount_received, payment_notes, captured_by, captured_at, updated_at
  ) VALUES (
    p_reception_entry_id,
    btrim(v_entry.jc_number),
    v_invoice_number,
    v_invoice_date,
    v_billed,
    'pending',
    NULL,
    v_notes,
    v_actor,
    now(),
    now()
  )
  ON CONFLICT (reception_entry_id) DO UPDATE SET
    jc_number = EXCLUDED.jc_number,
    invoice_number = EXCLUDED.invoice_number,
    invoice_date = EXCLUDED.invoice_date,
    billed_amount = EXCLUDED.billed_amount,
    payment_notes = EXCLUDED.payment_notes,
    updated_at = now();

  PERFORM public.accounts_mechanical_recalc(p_reception_entry_id);
  PERFORM public.accounts_mechanical_assign_eligible_null_vouchers(p_reception_entry_id, NULL);
  RETURN public.accounts_mechanical_case_json(p_reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.upsert_accounts_mechanical_invoice(bigint, text, date, numeric, text, numeric, text) IS
  'ACCOUNTS-001 / DBL-0075: Capture mechanical invoice. After receipts, billed stays locked; NULL invoice_number/date may still be filled. Then assign eligible NULL vouchers. Does not rewrite non-null voucher_no. Omitting p_payment_notes preserves the saved Pending Remark (payment_notes).';

GRANT EXECUTE ON FUNCTION public.upsert_accounts_mechanical_invoice(bigint, text, date, numeric, text, numeric, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
