-- ACCOUNTS-001 / DBL-0068
-- Admin-only edit of a posted Mechanical receipt (payment line).
-- Does NOT change Bodyshop settlement functions or ledgers.
-- Safe to re-run. Do not re-run DBL-0046 / 0056 / 0057 / 0060 / 0061 / 0066.
-- Timestamp 20260916130000.
-- Authority: live accounts_mechanical_payment_lines (DBL-0046) + add_accounts_mechanical_payment
--   (DBL-0061) + accounts_mechanical_recalc + public.is_admin() (admin / super_admin).

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Smallest audit columns on the existing payment-line table
-- Original posted_by / posted_at stay the posting identity.
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts_mechanical_payment_lines
  ADD COLUMN IF NOT EXISTS edited_by text;

ALTER TABLE public.accounts_mechanical_payment_lines
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

COMMENT ON COLUMN public.accounts_mechanical_payment_lines.edited_by IS
  'DBL-0068: Actor who last edited this posted receipt via update_accounts_mechanical_payment. Does not overwrite posted_by.';
COMMENT ON COLUMN public.accounts_mechanical_payment_lines.edited_at IS
  'DBL-0068: Timestamp of last trusted receipt edit. Does not overwrite posted_at.';

COMMENT ON TABLE public.accounts_mechanical_payment_lines IS
  'ACCOUNTS-001: Mechanical receipts. Append via add_accounts_mechanical_payment. Posted lines may be edited only by platform Admin/Super Admin through update_accounts_mechanical_payment. Header amount_received / payment_status are derived.';

-- Authenticated still cannot UPDATE the table directly.
REVOKE INSERT, UPDATE, DELETE ON public.accounts_mechanical_payment_lines FROM authenticated, anon;
GRANT SELECT ON public.accounts_mechanical_payment_lines TO authenticated;
GRANT ALL ON public.accounts_mechanical_payment_lines TO service_role;

-- ---------------------------------------------------------------------------
-- B. Voucher CHECK: keep format, stop coupling mode to series after an Admin edit.
-- voucher_no stays immutable (existing protect trigger). Edits must not regenerate it.
-- A Cash line may therefore keep a JApp number (or Other keep RApp) after a mode change.
-- BUSY export then uses the new mode for Account DR and the preserved voucher_no as-is.
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts_mechanical_payment_lines
  DROP CONSTRAINT IF EXISTS accounts_mechanical_payment_lines_voucher_check;

ALTER TABLE public.accounts_mechanical_payment_lines
  ADD CONSTRAINT accounts_mechanical_payment_lines_voucher_check CHECK (
    voucher_no IS NULL
    OR voucher_no ~ '^RApp/26-27/[0-9]{4}$'
    OR voucher_no ~ '^JApp/26-27/[0-9]{4}$'
  );

-- ---------------------------------------------------------------------------
-- C. Trusted Admin update. Client sends payment-line id only.
-- Invoice id, previous amount/mode, and totals are read from persistence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_accounts_mechanical_payment(
  p_payment_line_id bigint,
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
         edited_by = v_actor,
         edited_at = clock_timestamp()
   WHERE id = v_line.id;

  PERFORM public.accounts_mechanical_recalc(v_line.reception_entry_id);
  RETURN public.accounts_mechanical_case_json(v_line.reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.update_accounts_mechanical_payment(bigint, numeric, text, text, date) IS
  'ACCOUNTS-001 / DBL-0068: Admin/Super Admin edit of a posted Mechanical receipt. Authorizes with is_admin() only. Updates amount, payment_mode, reference, payment_received_date. Preserves id, mechanical_invoice_id, reception_entry_id, posted_by, posted_at, voucher_no. Recalc via accounts_mechanical_recalc. Overpayment is stored as-is.';

REVOKE ALL ON FUNCTION public.update_accounts_mechanical_payment(bigint, numeric, text, text, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accounts_mechanical_payment(bigint, numeric, text, text, date)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
