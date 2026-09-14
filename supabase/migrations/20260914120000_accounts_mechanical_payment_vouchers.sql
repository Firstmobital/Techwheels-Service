-- ACCOUNTS-001 / DBL-0057
-- Persist RApp/JApp voucher numbers on existing mechanical receipt lines.
-- Assignment is database-owned (sequences + nextval), not Excel-row ranking.
-- Cutoff: payment_received_date >= 2026-09-11. Cash = RApp. UPI+card = JApp.
-- cheque/bank/other and pre-cutoff rows stay voucher_no NULL.
-- Safe to re-run. Do not re-run DBL-0046 / 0056.
-- Authority: supabase/migrations/20260912170000_accounts_mechanical_payment_received_date.sql
--   + supabase/migrations/20260911140000_accounts_mechanical_payment_lines.sql

-- ---------------------------------------------------------------------------
-- A. Column + sequences
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts_mechanical_payment_lines
  ADD COLUMN IF NOT EXISTS voucher_no text;

COMMENT ON COLUMN public.accounts_mechanical_payment_lines.voucher_no IS
  'DBL-0057: Stable receipt voucher. Cash RApp/26-27/nnnn; UPI+card share JApp/26-27/nnnn. Assigned at insert from payment_received_date >= 2026-09-11. Null for pre-cutoff and cheque/bank/other.';

CREATE SEQUENCE IF NOT EXISTS public.accounts_mechanical_voucher_rapp_2627_seq
  START WITH 1 INCREMENT BY 1;

CREATE SEQUENCE IF NOT EXISTS public.accounts_mechanical_voucher_japp_2627_seq
  START WITH 1 INCREMENT BY 1;

COMMENT ON SEQUENCE public.accounts_mechanical_voucher_rapp_2627_seq IS
  'DBL-0057: Concurrent-safe Cash (RApp/26-27) voucher allocator.';

COMMENT ON SEQUENCE public.accounts_mechanical_voucher_japp_2627_seq IS
  'DBL-0057: Concurrent-safe UPI+Card (JApp/26-27) voucher allocator.';

GRANT USAGE, SELECT ON SEQUENCE public.accounts_mechanical_voucher_rapp_2627_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.accounts_mechanical_voucher_japp_2627_seq TO service_role;

-- ---------------------------------------------------------------------------
-- B. Allocator (nextval, never max()+1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_mechanical_next_voucher_no(
  p_payment_mode text,
  p_payment_received_date date
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
  IF p_payment_received_date IS NULL OR p_payment_received_date < DATE '2026-09-11' THEN
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
  'ACCOUNTS-001 / DBL-0057: nextval RApp (cash) or JApp (upi/card) when payment_received_date >= 2026-09-11. Null otherwise. Not granted to authenticated.';

REVOKE ALL ON FUNCTION public.accounts_mechanical_next_voucher_no(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_next_voucher_no(text, date) TO service_role;

-- ---------------------------------------------------------------------------
-- C. Deterministic one-time backfill (does not overwrite assigned vouchers)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_cash int := 0;
  v_japp int := 0;
  v_skip_pre int := 0;
  v_skip_mode int := 0;
  v_already int := 0;
BEGIN
  SELECT count(*) INTO v_skip_pre
    FROM public.accounts_mechanical_payment_lines
   WHERE payment_received_date < DATE '2026-09-11';

  SELECT count(*) INTO v_skip_mode
    FROM public.accounts_mechanical_payment_lines
   WHERE payment_received_date >= DATE '2026-09-11'
     AND payment_mode NOT IN ('cash', 'upi', 'card');

  SELECT count(*) INTO v_already
    FROM public.accounts_mechanical_payment_lines
   WHERE voucher_no IS NOT NULL;

  FOR r IN
    SELECT id, payment_mode, payment_received_date
      FROM public.accounts_mechanical_payment_lines
     WHERE payment_received_date >= DATE '2026-09-11'
       AND payment_mode = 'cash'
       AND voucher_no IS NULL
     ORDER BY payment_received_date ASC, posted_at ASC, id ASC
  LOOP
    UPDATE public.accounts_mechanical_payment_lines
       SET voucher_no = public.accounts_mechanical_next_voucher_no(r.payment_mode, r.payment_received_date)
     WHERE id = r.id
       AND voucher_no IS NULL;
    v_cash := v_cash + 1;
  END LOOP;

  FOR r IN
    SELECT id, payment_mode, payment_received_date
      FROM public.accounts_mechanical_payment_lines
     WHERE payment_received_date >= DATE '2026-09-11'
       AND payment_mode IN ('upi', 'card')
       AND voucher_no IS NULL
     ORDER BY payment_received_date ASC, posted_at ASC, id ASC
  LOOP
    UPDATE public.accounts_mechanical_payment_lines
       SET voucher_no = public.accounts_mechanical_next_voucher_no(r.payment_mode, r.payment_received_date)
     WHERE id = r.id
       AND voucher_no IS NULL;
    v_japp := v_japp + 1;
  END LOOP;

  RAISE NOTICE 'DBL-0057 backfill: rapp_assigned=% japp_assigned=% already_had_voucher=% skip_pre_cutoff=% skip_cheque_bank_other=%',
    v_cash, v_japp, v_already, v_skip_pre, v_skip_mode;
END;
$$;

-- ---------------------------------------------------------------------------
-- D. Integrity: uniqueness + series shape + immutability
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS accounts_mechanical_payment_lines_voucher_uid
  ON public.accounts_mechanical_payment_lines (voucher_no)
  WHERE voucher_no IS NOT NULL;

ALTER TABLE public.accounts_mechanical_payment_lines
  DROP CONSTRAINT IF EXISTS accounts_mechanical_payment_lines_voucher_check;

ALTER TABLE public.accounts_mechanical_payment_lines
  ADD CONSTRAINT accounts_mechanical_payment_lines_voucher_check CHECK (
    (
      payment_received_date < DATE '2026-09-11'
      AND voucher_no IS NULL
    )
    OR (
      payment_mode NOT IN ('cash', 'upi', 'card')
      AND voucher_no IS NULL
    )
    OR (
      payment_mode = 'cash'
      AND payment_received_date >= DATE '2026-09-11'
      AND voucher_no ~ '^RApp/26-27/[0-9]{4}$'
    )
    OR (
      payment_mode IN ('upi', 'card')
      AND payment_received_date >= DATE '2026-09-11'
      AND voucher_no ~ '^JApp/26-27/[0-9]{4}$'
    )
  );

CREATE OR REPLACE FUNCTION public.accounts_mechanical_payment_lines_protect_voucher()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.voucher_no IS NOT NULL AND NEW.voucher_no IS DISTINCT FROM OLD.voucher_no THEN
    RAISE EXCEPTION 'voucher_no is immutable once assigned'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_mechanical_payment_lines_protect_voucher
  ON public.accounts_mechanical_payment_lines;

CREATE TRIGGER trg_accounts_mechanical_payment_lines_protect_voucher
  BEFORE UPDATE ON public.accounts_mechanical_payment_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.accounts_mechanical_payment_lines_protect_voucher();

-- ---------------------------------------------------------------------------
-- E. Assign at receipt insert (authoritative lifecycle point)
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

  v_voucher := public.accounts_mechanical_next_voucher_no(v_mode, v_received_date);

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
  'ACCOUNTS-001 / DBL-0057: Append a mechanical receipt. Assigns RApp/JApp voucher_no at insert from payment_received_date and payment_mode. posted_at is the system timestamp.';

GRANT EXECUTE ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
