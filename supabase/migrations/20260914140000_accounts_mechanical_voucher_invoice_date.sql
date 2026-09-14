-- ACCOUNTS-001 / DBL-0058
-- Correct voucher eligibility: mechanical invoice_date >= 2026-09-02.
-- DBL-0057 incorrectly used payment_received_date >= 2026-09-11.
-- Requires DBL-0057 (voucher_no column, sequences, allocator, unique index, immutability trigger).
-- Does NOT renumber already-persisted voucher_no. Newly eligible NULL rows take the next nextval.
-- Safe to re-run. Do not re-run DBL-0057.
-- Authority: supabase/migrations/20260914120000_accounts_mechanical_payment_vouchers.sql
--   + public.accounts_mechanical_invoices.invoice_date

-- ---------------------------------------------------------------------------
-- A. Inspect existing series before any assignment (conflict evidence)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rapp int;
  v_japp int;
  v_eligible_null_cash int;
  v_eligible_null_japp int;
  v_min_rapp text;
  v_max_rapp text;
  v_min_japp text;
  v_max_japp text;
BEGIN
  SELECT count(*) FILTER (WHERE voucher_no LIKE 'RApp/26-27/%'),
         count(*) FILTER (WHERE voucher_no LIKE 'JApp/26-27/%'),
         min(voucher_no) FILTER (WHERE voucher_no LIKE 'RApp/26-27/%'),
         max(voucher_no) FILTER (WHERE voucher_no LIKE 'RApp/26-27/%'),
         min(voucher_no) FILTER (WHERE voucher_no LIKE 'JApp/26-27/%'),
         max(voucher_no) FILTER (WHERE voucher_no LIKE 'JApp/26-27/%')
    INTO v_rapp, v_japp, v_min_rapp, v_max_rapp, v_min_japp, v_max_japp
    FROM public.accounts_mechanical_payment_lines;

  SELECT count(*) INTO v_eligible_null_cash
    FROM public.accounts_mechanical_payment_lines l
    JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
   WHERE inv.invoice_date >= DATE '2026-09-02'
     AND l.payment_mode = 'cash'
     AND l.voucher_no IS NULL;

  SELECT count(*) INTO v_eligible_null_japp
    FROM public.accounts_mechanical_payment_lines l
    JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
   WHERE inv.invoice_date >= DATE '2026-09-02'
     AND l.payment_mode IN ('upi', 'card')
     AND l.voucher_no IS NULL;

  RAISE NOTICE 'DBL-0058 pre-backfill: existing_rapp=% (%) existing_japp=% (%) newly_eligible_null_cash=% newly_eligible_null_japp=%',
    v_rapp, COALESCE(v_min_rapp || '..' || v_max_rapp, 'none'),
    v_japp, COALESCE(v_min_japp || '..' || v_max_japp, 'none'),
    v_eligible_null_cash, v_eligible_null_japp;
END;
$$;

-- ---------------------------------------------------------------------------
-- B. Drop DBL-0057 payment_received_date CHECK (it would block 2–10 Sep invoices)
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts_mechanical_payment_lines
  DROP CONSTRAINT IF EXISTS accounts_mechanical_payment_lines_voucher_check;

-- ---------------------------------------------------------------------------
-- C. Allocator uses linked invoice_date, not payment_received_date
-- Parameter rename requires DROP: DBL-0057 used p_payment_received_date.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.accounts_mechanical_next_voucher_no(text, date);

CREATE FUNCTION public.accounts_mechanical_next_voucher_no(
  p_payment_mode text,
  p_invoice_date date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_mode text;
  v_n bigint;
BEGIN
  IF p_invoice_date IS NULL OR p_invoice_date < DATE '2026-09-02' THEN
    RETURN NULL;
  END IF;

  v_mode := lower(btrim(COALESCE(p_payment_mode, '')));

  IF v_mode = 'cash' THEN
    v_n := nextval('public.accounts_mechanical_voucher_rapp_2627_seq');
    RETURN 'RApp/26-27/' || lpad(v_n::text, 4, '0');
  END IF;

  IF v_mode IN ('upi', 'card') THEN
    v_n := nextval('public.accounts_mechanical_voucher_japp_2627_seq');
    RETURN 'JApp/26-27/' || lpad(v_n::text, 4, '0');
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.accounts_mechanical_next_voucher_no(text, date) IS
  'ACCOUNTS-001 / DBL-0058: nextval RApp (cash) or JApp (upi/card) when mechanical invoice_date >= 2026-09-02. Null otherwise. payment_received_date / posted_at / invoice_done_at do not control eligibility.';

REVOKE ALL ON FUNCTION public.accounts_mechanical_next_voucher_no(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_next_voucher_no(text, date) TO service_role;

COMMENT ON COLUMN public.accounts_mechanical_payment_lines.voucher_no IS
  'DBL-0058: Stable receipt voucher. Cash RApp/26-27/nnnn; UPI+card share JApp/26-27/nnnn. Assigned at insert when linked accounts_mechanical_invoices.invoice_date >= 2026-09-02. Null for earlier invoices and cheque/bank/other. Existing DBL-0057 numbers are not rewritten.';

-- ---------------------------------------------------------------------------
-- D. Assign at insert from invoice.invoice_date
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

  v_voucher := public.accounts_mechanical_next_voucher_no(v_mode, v_inv.invoice_date);

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
  'ACCOUNTS-001 / DBL-0058: Append a mechanical receipt. Assigns RApp/JApp from linked invoice_date >= 2026-09-02 and payment_mode. payment_received_date is stored but does not control voucher eligibility.';

GRANT EXECUTE ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- E. Backfill remaining eligible NULL vouchers. Do not overwrite assigned numbers.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_cash int := 0;
  v_japp int := 0;
  v_skip_pre int := 0;
  v_skip_mode int := 0;
  v_skip_no_date int := 0;
  v_already int := 0;
BEGIN
  SELECT count(*) INTO v_already
    FROM public.accounts_mechanical_payment_lines
   WHERE voucher_no IS NOT NULL;

  SELECT count(*) INTO v_skip_pre
    FROM public.accounts_mechanical_payment_lines l
    JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
   WHERE inv.invoice_date IS NOT NULL
     AND inv.invoice_date < DATE '2026-09-02';

  SELECT count(*) INTO v_skip_no_date
    FROM public.accounts_mechanical_payment_lines l
    JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
   WHERE inv.invoice_date IS NULL;

  SELECT count(*) INTO v_skip_mode
    FROM public.accounts_mechanical_payment_lines l
    JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
   WHERE inv.invoice_date >= DATE '2026-09-02'
     AND l.payment_mode NOT IN ('cash', 'upi', 'card');

  FOR r IN
    SELECT l.id, l.payment_mode, inv.invoice_date
      FROM public.accounts_mechanical_payment_lines l
      JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
     WHERE inv.invoice_date >= DATE '2026-09-02'
       AND l.payment_mode = 'cash'
       AND l.voucher_no IS NULL
     ORDER BY inv.invoice_date ASC, l.payment_received_date ASC, l.posted_at ASC, l.id ASC
  LOOP
    UPDATE public.accounts_mechanical_payment_lines
       SET voucher_no = public.accounts_mechanical_next_voucher_no(r.payment_mode, r.invoice_date)
     WHERE id = r.id
       AND voucher_no IS NULL;
    v_cash := v_cash + 1;
  END LOOP;

  FOR r IN
    SELECT l.id, l.payment_mode, inv.invoice_date
      FROM public.accounts_mechanical_payment_lines l
      JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
     WHERE inv.invoice_date >= DATE '2026-09-02'
       AND l.payment_mode IN ('upi', 'card')
       AND l.voucher_no IS NULL
     ORDER BY inv.invoice_date ASC, l.payment_received_date ASC, l.posted_at ASC, l.id ASC
  LOOP
    UPDATE public.accounts_mechanical_payment_lines
       SET voucher_no = public.accounts_mechanical_next_voucher_no(r.payment_mode, r.invoice_date)
     WHERE id = r.id
       AND voucher_no IS NULL;
    v_japp := v_japp + 1;
  END LOOP;

  RAISE NOTICE 'DBL-0058 backfill: rapp_newly_assigned=% japp_newly_assigned=% already_preserved=% skip_pre_2_sep=% skip_null_invoice_date=% skip_cheque_bank_other=%',
    v_cash, v_japp, v_already, v_skip_pre, v_skip_no_date, v_skip_mode;
END;
$$;

-- ---------------------------------------------------------------------------
-- F. Mode/format CHECK only (invoice_date lives on the invoice header, not the line)
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts_mechanical_payment_lines
  ADD CONSTRAINT accounts_mechanical_payment_lines_voucher_check CHECK (
    (
      payment_mode NOT IN ('cash', 'upi', 'card')
      AND voucher_no IS NULL
    )
    OR (
      payment_mode = 'cash'
      AND (voucher_no IS NULL OR voucher_no ~ '^RApp/26-27/[0-9]{4}$')
    )
    OR (
      payment_mode IN ('upi', 'card')
      AND (voucher_no IS NULL OR voucher_no ~ '^JApp/26-27/[0-9]{4}$')
    )
  );

NOTIFY pgrst, 'reload schema';
