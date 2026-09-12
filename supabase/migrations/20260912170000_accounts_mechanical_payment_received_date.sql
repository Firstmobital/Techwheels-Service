-- ACCOUNTS-001 / DBL-0056
-- Mechanical payment received date (business date) on existing
-- accounts_mechanical_payment_lines. posted_at stays the system insert timestamp.
-- Backfill existing lines to the Asia/Kolkata calendar date of posted_at.
-- Safe to re-run. Do not re-run DBL-0046 / 0047.
-- Authority: supabase/migrations/20260911140000_accounts_mechanical_payment_lines.sql
--   + supabase/migrations/20260911141000_accounts_mechanical_payment_post_fix.sql

ALTER TABLE public.accounts_mechanical_payment_lines
  ADD COLUMN IF NOT EXISTS payment_received_date date;

UPDATE public.accounts_mechanical_payment_lines
   SET payment_received_date = (posted_at AT TIME ZONE 'Asia/Kolkata')::date
 WHERE payment_received_date IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.accounts_mechanical_payment_lines
    WHERE payment_received_date IS NULL
  ) THEN
    RAISE EXCEPTION 'DBL-0056: payment_received_date backfill left null rows';
  END IF;
END
$$;

ALTER TABLE public.accounts_mechanical_payment_lines
  ALTER COLUMN payment_received_date SET NOT NULL;

COMMENT ON COLUMN public.accounts_mechanical_payment_lines.payment_received_date IS
  'DBL-0056: Asia/Kolkata calendar date the business received the money. Distinct from posted_at (system insert timestamp).';

DROP FUNCTION IF EXISTS public.add_accounts_mechanical_payment(bigint, numeric, text, text);

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

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date
  ) VALUES (
    p_reception_entry_id,
    v_inv.id,
    v_amount,
    v_mode,
    NULLIF(btrim(p_reference), ''),
    v_actor,
    now(),
    v_received_date
  );

  PERFORM public.accounts_mechanical_recalc(p_reception_entry_id);
  RETURN public.accounts_mechanical_case_json(p_reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date) IS
  'ACCOUNTS-001 / DBL-0056: Append a mechanical receipt. payment_received_date is the business date; posted_at is the system timestamp.';

GRANT EXECUTE ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
