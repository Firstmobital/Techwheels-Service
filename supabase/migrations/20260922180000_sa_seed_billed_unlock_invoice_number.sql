-- DBL-0082
-- Extend DBL-0051 SA → Accounts billed handoff.
--
-- Latest qualifying SA invoice amount may refresh
-- accounts_mechanical_invoices.billed_amount until financial activity starts.
--
-- Financial activity (existing authority, aligned with
-- upsert_accounts_mechanical_invoice):
--   any row in accounts_mechanical_payment_lines for the reception
--   (cash/UPI/card/cheque/bank/other AND discount reference).
--
-- Not a billed lock:
--   invoice_number / invoice_date capture
--   amount_received / payment_status (derived from lines; billed=0 is
--     status received with no lines)
--   keep_on_credit (DBL-0061/0066: does not rewrite remaining/status)
--   issued gatepass payload (not stored on the invoice header)
--
-- Do not add a second billed column. Do not change list/UI to read
-- expected_invoice_amount. Do not rewrite historical paid rows.
-- Do not change SA qualification, invoice_done_at once, DMS fetch,
-- payment posting, Busy export, or payment-mode cards.

CREATE OR REPLACE FUNCTION public.service_advisor_seed_mechanical_billed_amount(
  p_reception_entry_id bigint,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_entry public.service_reception_entries%ROWTYPE;
  v_existing public.accounts_mechanical_invoices%ROWTYPE;
  v_has_lines boolean := false;
  v_actor text;
  v_billed numeric;
  v_jc text;
BEGIN
  SELECT * INTO v_entry
    FROM public.service_reception_entries
   WHERE id = p_reception_entry_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_jc := NULLIF(btrim(v_entry.jc_number), '');
  IF v_jc IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.is_floor_incharge_service_type(v_entry.service_type) THEN
    RETURN;
  END IF;

  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'expected_invoice_amount cannot be negative'
      USING ERRCODE = '23514';
  END IF;

  v_billed := CASE WHEN p_amount IS NULL THEN NULL ELSE round(p_amount, 2) END;

  SELECT * INTO v_existing
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = p_reception_entry_id;

  IF FOUND THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.accounts_mechanical_payment_lines l
      WHERE l.reception_entry_id = p_reception_entry_id
    ) INTO v_has_lines;

    -- DBL-0082: lock only after financial activity (any payment line).
    -- invoice_number alone is Accounts capture, not a billed freeze.
    IF v_has_lines THEN
      RETURN;
    END IF;

    UPDATE public.accounts_mechanical_invoices
       SET jc_number = v_jc,
           billed_amount = v_billed,
           updated_at = now()
     WHERE reception_entry_id = p_reception_entry_id;
  ELSE
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
      v_jc,
      NULL,
      NULL,
      v_billed,
      'pending',
      NULL,
      NULL,
      v_actor,
      now(),
      now()
    );
  END IF;

  IF to_regprocedure('public.accounts_mechanical_recalc(bigint)') IS NOT NULL THEN
    PERFORM public.accounts_mechanical_recalc(p_reception_entry_id);
  END IF;
END;
$$;

COMMENT ON COLUMN public.service_reception_entries.expected_invoice_amount IS
  'DBL-0051/0082: Service Advisor expected/final invoice amount. Seeds accounts_mechanical_invoices.billed_amount when JC exists and no payment lines exist. Invoice number/date alone do not lock billed. Not the Accounts billed authority after financial activity.';

COMMENT ON FUNCTION public.service_advisor_seed_mechanical_billed_amount(bigint, numeric)
IS 'DBL-0051/0082 internal: seed accounts_mechanical_invoices.billed_amount from SA expected amount. No-op without JC, non-floor types, or after financial activity (any accounts_mechanical_payment_lines row, including discount). Invoice number/date alone do not lock billed. Keep on Credit and issued gatepass are not billed locks.';

COMMENT ON FUNCTION public.service_advisor_save_reception_entry(
  bigint, text, text, integer, text, numeric, boolean
)
IS 'SECURITY DEFINER RPC: updates service_type, jc_number, km_reading, remark, and optionally expected_invoice_amount. '
   'DBL-0069: expected_invoice_amount and invoice_done_at require Floor Incharge work_status=completed on the JC. '
   'Accident/Rusting never auto-complete. Blank amount does not complete. Later amount edits do not rewrite the original timestamp. '
   'DBL-0082: seeds accounts_mechanical_invoices.billed_amount when JC exists and no payment lines exist.';

REVOKE ALL ON FUNCTION public.service_advisor_seed_mechanical_billed_amount(bigint, numeric)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
