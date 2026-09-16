-- ACCOUNTS-001 / DBL-0073
-- Per-receipt remark on existing accounts_mechanical_payment_lines.
-- Does NOT change billed/received/remaining, payment_status, vouchers,
-- Keep on Credit, Gatepass, or Bodyshop settlement.
-- Safe to re-run. Do not re-run DBL-0046 / 0056 / 0061 / 0068.
-- Timestamp 20260916140000.
-- Authority: live accounts_mechanical_payment_lines (DBL-0046) +
--   add_accounts_mechanical_payment (DBL-0061) +
--   update_accounts_mechanical_payment (DBL-0068).

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Nullable remark on the existing payment-line table
-- Historical rows stay NULL. No backfill.
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts_mechanical_payment_lines
  ADD COLUMN IF NOT EXISTS remark text;

COMMENT ON COLUMN public.accounts_mechanical_payment_lines.remark IS
  'DBL-0073: Optional per-receipt remark. Distinct from reference (UTR/cheque) and invoice payment_notes. Null for historical lines.';

-- Authenticated still cannot INSERT/UPDATE/DELETE the table directly.
REVOKE INSERT, UPDATE, DELETE ON public.accounts_mechanical_payment_lines FROM authenticated, anon;
GRANT SELECT ON public.accounts_mechanical_payment_lines TO authenticated;
GRANT ALL ON public.accounts_mechanical_payment_lines TO service_role;

-- ---------------------------------------------------------------------------
-- B. Post: keep DBL-0061 overpay / voucher behaviour; persist trimmed remark
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.add_accounts_mechanical_payment(bigint, numeric, text, text, date);

CREATE OR REPLACE FUNCTION public.add_accounts_mechanical_payment(
  p_reception_entry_id bigint,
  p_amount numeric,
  p_payment_mode text,
  p_reference text DEFAULT NULL,
  p_payment_received_date date DEFAULT NULL,
  p_remark text DEFAULT NULL
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

  v_actor := COALESCE(
    NULLIF(auth.jwt() ->> 'email', ''),
    NULLIF(auth.uid()::text, ''),
    'system'
  );

  v_eff := public.accounts_mechanical_effective_invoice_date(p_reception_entry_id);
  v_voucher := public.accounts_mechanical_next_voucher_no(v_mode, v_eff);

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no, remark
  ) VALUES (
    p_reception_entry_id,
    v_inv.id,
    v_amount,
    v_mode,
    NULLIF(btrim(p_reference), ''),
    v_actor,
    now(),
    v_received_date,
    v_voucher,
    NULLIF(btrim(p_remark), '')
  );

  PERFORM public.accounts_mechanical_recalc(p_reception_entry_id);
  RETURN public.accounts_mechanical_case_json(p_reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date, text) IS
  'ACCOUNTS-001 / DBL-0073: Append a mechanical receipt at the entered amount. Optional p_remark is trimmed; blank stores NULL. Overpayment is stored as-is. Remaining display floors at 0. Recalc still derives payment_status from billed vs sum(lines). Voucher from effective invoice_date (DBL-0060).';

REVOKE ALL ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C. Admin edit: keep DBL-0068 gates; persist trimmed remark
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_accounts_mechanical_payment(bigint, numeric, text, text, date);

CREATE OR REPLACE FUNCTION public.update_accounts_mechanical_payment(
  p_payment_line_id bigint,
  p_amount numeric,
  p_payment_mode text,
  p_reference text DEFAULT NULL,
  p_payment_received_date date DEFAULT NULL,
  p_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_line public.accounts_mechanical_payment_lines%ROWTYPE;
  v_mode text;
  v_amount numeric;
  v_actor text;
  v_received_date date;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: requires platform admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_payment_line_id IS NULL THEN
    RAISE EXCEPTION 'payment line id is required'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_line
    FROM public.accounts_mechanical_payment_lines
   WHERE id = p_payment_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mechanical payment line % not found', p_payment_line_id
      USING ERRCODE = 'P0002';
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

  v_actor := public.accounts_mechanical_actor_label();

  UPDATE public.accounts_mechanical_payment_lines
     SET amount = v_amount,
         payment_mode = v_mode,
         reference = NULLIF(btrim(p_reference), ''),
         payment_received_date = v_received_date,
         remark = NULLIF(btrim(p_remark), ''),
         edited_by = v_actor,
         edited_at = clock_timestamp()
   WHERE id = v_line.id;

  PERFORM public.accounts_mechanical_recalc(v_line.reception_entry_id);
  RETURN public.accounts_mechanical_case_json(v_line.reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.update_accounts_mechanical_payment(bigint, numeric, text, text, date, text) IS
  'ACCOUNTS-001 / DBL-0073: Admin/Super Admin edit of a posted Mechanical receipt. Authorizes with is_admin() only. Updates amount, payment_mode, reference, payment_received_date, remark. Preserves id, mechanical_invoice_id, reception_entry_id, posted_by, posted_at, voucher_no. Recalc via accounts_mechanical_recalc. Overpayment is stored as-is.';

REVOKE ALL ON FUNCTION public.update_accounts_mechanical_payment(bigint, numeric, text, text, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accounts_mechanical_payment(bigint, numeric, text, text, date, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
