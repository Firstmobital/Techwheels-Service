-- ACCOUNTS-001 / DBL-0060
-- Voucher eligibility: Accounts invoice_date, else unique live DMS labour
-- invoice_date for the JC (same unique-Cancelled-skip rule as
-- lookup_accounts_mechanical_dms_invoice). Cutoff remains 2026-09-02.
-- Does NOT clear, restart, or renumber existing RApp/JApp values.
-- Incremental nextval only for voucher_no IS NULL cash/upi/card rows that
-- become eligible. payment_received_date / posted_at / invoice_done_at
-- do not control eligibility.
-- Requires DBL-0058 + DBL-0059. Do not re-run DBL-0059.
-- Authority: public.accounts_mechanical_invoices.invoice_date
--   + public.psf_revenue_dms (JC unique live invoice)
--   + public.accounts_mechanical_next_voucher_no(text, date)

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Unique live DMS labour invoice_date for a JC (read-only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_mechanical_unique_dms_invoice_date(p_jc_number text)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_jc text;
  v_count integer := 0;
  v_date date;
BEGIN
  v_jc := upper(btrim(COALESCE(p_jc_number, '')));
  IF v_jc = '' THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM public.psf_revenue_dms d
   WHERE upper(btrim(d.job_card_number)) = v_jc
     AND COALESCE(d.invoice_status, '') <> 'Cancelled'
     AND NULLIF(btrim(d.invoice_number), '') IS NOT NULL
     AND d.total_invoice_amount IS NOT NULL
     AND d.invoice_date IS NOT NULL;

  IF v_count <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT d.invoice_date
    INTO v_date
    FROM public.psf_revenue_dms d
   WHERE upper(btrim(d.job_card_number)) = v_jc
     AND COALESCE(d.invoice_status, '') <> 'Cancelled'
     AND NULLIF(btrim(d.invoice_number), '') IS NOT NULL
     AND d.total_invoice_amount IS NOT NULL
     AND d.invoice_date IS NOT NULL;

  RETURN v_date;
END;
$$;

COMMENT ON FUNCTION public.accounts_mechanical_unique_dms_invoice_date(text) IS
  'ACCOUNTS-001 / DBL-0060: Unique live psf_revenue_dms invoice_date for a JC. Null when 0 or 2+ live invoices. Same uniqueness as lookup_accounts_mechanical_dms_invoice. Does not write Accounts invoices.';

REVOKE ALL ON FUNCTION public.accounts_mechanical_unique_dms_invoice_date(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_unique_dms_invoice_date(text) TO service_role;

-- ---------------------------------------------------------------------------
-- B. Effective invoice date: Accounts first, else unique DMS labour
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_mechanical_effective_invoice_date(p_reception_entry_id bigint)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_jc text;
BEGIN
  IF p_reception_entry_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_inv
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = p_reception_entry_id;

  IF FOUND AND v_inv.invoice_date IS NOT NULL THEN
    RETURN v_inv.invoice_date;
  END IF;

  v_jc := NULLIF(btrim(COALESCE(v_inv.jc_number, '')), '');
  IF v_jc IS NULL THEN
    SELECT NULLIF(btrim(e.jc_number), '')
      INTO v_jc
      FROM public.service_reception_entries e
     WHERE e.id = p_reception_entry_id;
  END IF;

  RETURN public.accounts_mechanical_unique_dms_invoice_date(v_jc);
END;
$$;

COMMENT ON FUNCTION public.accounts_mechanical_effective_invoice_date(bigint) IS
  'ACCOUNTS-001 / DBL-0060: Voucher eligibility date. Accounts invoice_date when present, else unique DMS labour invoice_date for the JC. Null when unresolved. Does not use payment_received_date, posted_at, or invoice_done_at.';

REVOKE ALL ON FUNCTION public.accounts_mechanical_effective_invoice_date(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_effective_invoice_date(bigint) TO service_role;

-- ---------------------------------------------------------------------------
-- C. Future receipts use effective invoice date
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_accounts_mechanical_payment(
  p_reception_entry_id bigint,
  p_amount numeric,
  p_payment_mode text,
  p_reference text DEFAULT NULL,
  p_payment_received_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_mode text;
  v_amount numeric;
  v_remaining numeric;
  v_actor text;
  v_received_date date;
  v_voucher text;
  v_eff date;
BEGIN
  IF NOT public.accounts_can_access() THEN
    RAISE EXCEPTION 'permission denied: requires accounts view'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = p_reception_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'capture invoice number and billed amount first'
      USING ERRCODE = '23514';
  END IF;
  IF v_inv.billed_amount IS NULL THEN
    RAISE EXCEPTION 'billed amount is required before posting a receipt'
      USING ERRCODE = '23514';
  END IF;

  v_amount := round(COALESCE(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'receipt amount must be greater than 0'
      USING ERRCODE = '23514';
  END IF;

  v_mode := lower(btrim(COALESCE(p_payment_mode, '')));
  IF v_mode NOT IN ('cash', 'upi', 'card', 'cheque', 'bank', 'other') THEN
    RAISE EXCEPTION 'invalid payment_mode'
      USING ERRCODE = '23514';
  END IF;

  v_received_date := p_payment_received_date;
  IF v_received_date IS NULL THEN
    RAISE EXCEPTION 'payment received date is required'
      USING ERRCODE = '23514';
  END IF;

  v_remaining := GREATEST(0, round(v_inv.billed_amount - COALESCE(v_inv.amount_received, 0), 2));
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'nothing remaining to post'
      USING ERRCODE = '23514';
  END IF;
  IF v_amount > v_remaining AND (v_amount - v_remaining) <= 1 THEN
    v_amount := v_remaining;
  END IF;
  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'receipt ₹% exceeds remaining ₹%', v_amount, v_remaining
      USING ERRCODE = '23514';
  END IF;

  v_actor := COALESCE(
    NULLIF(auth.jwt() ->> 'email', ''),
    NULLIF(auth.uid()::text, ''),
    'system'
  );

  v_eff := public.accounts_mechanical_effective_invoice_date(p_reception_entry_id);
  v_voucher := public.accounts_mechanical_next_voucher_no(v_mode, v_eff);

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    p_reception_entry_id,
    v_inv.id,
    v_amount,
    v_mode,
    NULLIF(btrim(p_reference), ''),
    v_actor,
    now(),
    v_received_date,
    v_voucher
  );

  PERFORM public.accounts_mechanical_recalc(p_reception_entry_id);
  RETURN public.accounts_mechanical_case_json(p_reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date) IS
  'ACCOUNTS-001 / DBL-0060: Append a mechanical receipt. Assigns RApp/JApp from effective invoice_date (Accounts, else unique DMS labour) >= 2026-09-02. payment_received_date is stored but does not control voucher eligibility.';

GRANT EXECUTE ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date)
  TO authenticated, service_role;

COMMENT ON COLUMN public.accounts_mechanical_payment_lines.voucher_no IS
  'DBL-0060: Receipt voucher. Cash RApp/26-27/nnnn; UPI+card share JApp/26-27/nnnn. Assigned at insert / incremental backfill from effective invoice_date >= 2026-09-02 (Accounts invoice_date, else unique DMS labour invoice_date). Null when unresolved, pre-cutoff, or cheque/bank/other. Existing numbers are immutable.';

-- ---------------------------------------------------------------------------
-- D. Incremental backfill: NULL vouchers only. Do not restart sequences.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_cash int := 0;
  v_upi int := 0;
  v_card int := 0;
  v_rapp int := 0;
  v_japp int := 0;
  v_unresolved int := 0;
  v_skip_mode int := 0;
  v_skip_pre int := 0;
  v_already int := 0;
  v_assigned text;
BEGIN
  SELECT count(*) INTO v_already
    FROM public.accounts_mechanical_payment_lines
   WHERE voucher_no IS NOT NULL;

  SELECT count(*) INTO v_skip_mode
    FROM public.accounts_mechanical_payment_lines
   WHERE voucher_no IS NULL
     AND payment_mode NOT IN ('cash', 'upi', 'card');

  SELECT count(*) INTO v_unresolved
    FROM public.accounts_mechanical_payment_lines l
   WHERE l.voucher_no IS NULL
     AND l.payment_mode IN ('cash', 'upi', 'card')
     AND public.accounts_mechanical_effective_invoice_date(l.reception_entry_id) IS NULL;

  SELECT count(*) INTO v_skip_pre
    FROM public.accounts_mechanical_payment_lines l
   WHERE l.voucher_no IS NULL
     AND l.payment_mode IN ('cash', 'upi', 'card')
     AND public.accounts_mechanical_effective_invoice_date(l.reception_entry_id) IS NOT NULL
     AND public.accounts_mechanical_effective_invoice_date(l.reception_entry_id) < DATE '2026-09-02';

  FOR r IN
    SELECT
      l.id,
      l.payment_mode,
      public.accounts_mechanical_effective_invoice_date(l.reception_entry_id) AS eff_date
      FROM public.accounts_mechanical_payment_lines l
     WHERE l.voucher_no IS NULL
       AND l.payment_mode IN ('cash', 'upi', 'card')
       AND public.accounts_mechanical_effective_invoice_date(l.reception_entry_id) >= DATE '2026-09-02'
     ORDER BY
       public.accounts_mechanical_effective_invoice_date(l.reception_entry_id) ASC,
       l.payment_received_date ASC,
       l.posted_at ASC,
       l.id ASC
  LOOP
    UPDATE public.accounts_mechanical_payment_lines
       SET voucher_no = public.accounts_mechanical_next_voucher_no(r.payment_mode, r.eff_date)
     WHERE id = r.id
       AND voucher_no IS NULL
    RETURNING voucher_no INTO v_assigned;

    IF v_assigned IS NULL THEN
      CONTINUE;
    END IF;

    IF r.payment_mode = 'cash' THEN
      v_cash := v_cash + 1;
      v_rapp := v_rapp + 1;
    ELSIF r.payment_mode = 'upi' THEN
      v_upi := v_upi + 1;
      v_japp := v_japp + 1;
    ELSIF r.payment_mode = 'card' THEN
      v_card := v_card + 1;
      v_japp := v_japp + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'DBL-0060 incremental: newly_eligible_cash=% newly_eligible_upi=% newly_eligible_card=% rapp_assigned=% japp_assigned=% already_preserved=% unresolved_invoice_date=% skip_pre_2_sep=% skip_cheque_bank_other=%',
    v_cash, v_upi, v_card, v_rapp, v_japp, v_already, v_unresolved, v_skip_pre, v_skip_mode;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
