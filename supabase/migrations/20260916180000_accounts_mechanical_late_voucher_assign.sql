-- ACCOUNTS-001 / DBL-0074
-- Late RApp/JApp assignment for mechanical receipts that were NULL at insert
-- and later became eligible (Accounts invoice_date fill, or unique DMS labour).
-- Reconcile JApp sequence with persisted max before any nextval.
-- Repair currently eligible NULL cash/upi/card rows (audit: payment line 222).
-- Does NOT clear, rewrite, or renumber existing non-null voucher_no.
-- Pre-cutoff and cheque/bank/other stay NULL.
-- Reuses accounts_mechanical_effective_invoice_date + accounts_mechanical_next_voucher_no.
-- Safe to re-run. Do not re-run DBL-0059.
-- Requires DBL-0060. Timestamp 20260916180000.
-- Authority: accounts_mechanical_payment_lines.voucher_no
--   + accounts_mechanical_next_voucher_no(text, date)
--   + accounts_mechanical_effective_invoice_date(bigint)
--   + upsert_accounts_mechanical_invoice
--   + public.psf_revenue_dms

BEGIN;

-- ---------------------------------------------------------------------------
-- A. JApp sequence: never behind persisted max. Never rewind.
-- nextval after setval(n, true) is n+1, so an existing JApp/26-27/n cannot repeat.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_mechanical_reconcile_japp_sequence()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_max bigint := 0;
  v_seq bigint := 0;
  v_target bigint;
BEGIN
  SELECT COALESCE(max(substring(voucher_no from '([0-9]{4})$')::bigint), 0)
    INTO v_max
    FROM public.accounts_mechanical_payment_lines
   WHERE voucher_no ~ '^JApp/26-27/[0-9]{4}$';

  SELECT last_value INTO v_seq
    FROM public.accounts_mechanical_voucher_japp_2627_seq;

  v_target := GREATEST(v_max, COALESCE(v_seq, 0));
  IF v_target > 0 THEN
    PERFORM setval('public.accounts_mechanical_voucher_japp_2627_seq', v_target, true);
  END IF;

  RETURN v_target;
END;
$$;

COMMENT ON FUNCTION public.accounts_mechanical_reconcile_japp_sequence() IS
  'ACCOUNTS-001 / DBL-0074: Raise JApp sequence to max(persisted JApp nnnn, last_value). Does not rewind. Does not rewrite voucher_no.';

REVOKE ALL ON FUNCTION public.accounts_mechanical_reconcile_japp_sequence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_reconcile_japp_sequence() TO service_role;

-- ---------------------------------------------------------------------------
-- B. Incremental assign: NULL cash/upi/card lines that are now eligible.
-- UPDATE ... AND voucher_no IS NULL is concurrency-safe; nextval is not
-- evaluated when the row no longer matches. Non-null vouchers are never SET.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_mechanical_assign_eligible_null_vouchers(
  p_reception_entry_id bigint DEFAULT NULL,
  p_jc_number text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  r record;
  v_assigned text;
  v_count integer := 0;
  v_jc text;
BEGIN
  v_jc := NULLIF(upper(btrim(COALESCE(p_jc_number, ''))), '');

  FOR r IN
    SELECT
      l.id,
      l.payment_mode,
      public.accounts_mechanical_effective_invoice_date(l.reception_entry_id) AS eff_date
      FROM public.accounts_mechanical_payment_lines l
      JOIN public.accounts_mechanical_invoices inv ON inv.id = l.mechanical_invoice_id
      JOIN public.service_reception_entries e ON e.id = l.reception_entry_id
     WHERE l.voucher_no IS NULL
       AND l.payment_mode IN ('cash', 'upi', 'card')
       AND (p_reception_entry_id IS NULL OR l.reception_entry_id = p_reception_entry_id)
       AND (
         v_jc IS NULL
         OR upper(btrim(COALESCE(NULLIF(btrim(inv.jc_number), ''), e.jc_number))) = v_jc
       )
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

    IF v_assigned IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.accounts_mechanical_assign_eligible_null_vouchers(bigint, text) IS
  'ACCOUNTS-001 / DBL-0074: Assign RApp/JApp to voucher_no IS NULL cash/upi/card lines now eligible via accounts_mechanical_effective_invoice_date >= 2026-09-02. Optional reception or JC scope. Never updates a non-null voucher_no.';

REVOKE ALL ON FUNCTION public.accounts_mechanical_assign_eligible_null_vouchers(bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_assign_eligible_null_vouchers(bigint, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- C. Accounts invoice: allow filling a still-NULL date/number after receipts,
-- then assign. Do not overwrite a non-null invoice_date, invoice_number, or billed.
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
    CASE
      WHEN v_has_lines THEN v_existing.payment_notes
      ELSE NULLIF(btrim(p_payment_notes), '')
    END,
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
  'ACCOUNTS-001 / DBL-0074: Capture mechanical invoice. After receipts, billed stays locked; NULL invoice_number/date may still be filled. Then assign eligible NULL vouchers. Does not rewrite non-null voucher_no.';

GRANT EXECUTE ON FUNCTION public.upsert_accounts_mechanical_invoice(bigint, text, date, numeric, text, numeric, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- D. DMS labour: after a JC invoice becomes unique/dated, assign that JC only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_mechanical_assign_vouchers_on_dms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.job_card_number, '')), '') IS NOT NULL THEN
    PERFORM public.accounts_mechanical_assign_eligible_null_vouchers(NULL, NEW.job_card_number);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.accounts_mechanical_assign_vouchers_on_dms() IS
  'ACCOUNTS-001 / DBL-0074: AFTER INSERT/UPDATE on psf_revenue_dms, assign eligible NULL mechanical vouchers for that JC. Does not rewrite non-null voucher_no.';

REVOKE ALL ON FUNCTION public.accounts_mechanical_assign_vouchers_on_dms() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_psf_revenue_dms_assign_mechanical_vouchers
  ON public.psf_revenue_dms;

CREATE TRIGGER trg_psf_revenue_dms_assign_mechanical_vouchers
AFTER INSERT OR UPDATE OF invoice_date, invoice_status, invoice_number, job_card_number, total_invoice_amount
ON public.psf_revenue_dms
FOR EACH ROW
EXECUTE FUNCTION public.accounts_mechanical_assign_vouchers_on_dms();

-- ---------------------------------------------------------------------------
-- E. Reconcile then repair currently eligible NULLs. Existing numbers stay.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_seq_before bigint;
  v_seq_after bigint;
  v_max_before text;
  v_japp0140_id bigint;
  v_assigned integer;
BEGIN
  SELECT last_value INTO v_seq_before
    FROM public.accounts_mechanical_voucher_japp_2627_seq;

  SELECT max(voucher_no) INTO v_max_before
    FROM public.accounts_mechanical_payment_lines
   WHERE voucher_no LIKE 'JApp/26-27/%';

  SELECT id INTO v_japp0140_id
    FROM public.accounts_mechanical_payment_lines
   WHERE voucher_no = 'JApp/26-27/0140';

  v_seq_after := public.accounts_mechanical_reconcile_japp_sequence();
  v_assigned := public.accounts_mechanical_assign_eligible_null_vouchers(NULL, NULL);

  RAISE NOTICE 'DBL-0074: japp_seq_before=% japp_seq_after=% persisted_max_before=% assigned=% japp0140_line=%',
    v_seq_before, v_seq_after, v_max_before, v_assigned, v_japp0140_id;
END;
$$;

COMMENT ON COLUMN public.accounts_mechanical_payment_lines.voucher_no IS
  'DBL-0074: Receipt voucher per payment line. Cash RApp/26-27/nnnn; UPI+card share JApp/26-27/nnnn. Assigned at insert or later when effective invoice_date >= 2026-09-02. Null when unresolved, pre-cutoff, or cheque/bank/other. Non-null values are immutable.';

NOTIFY pgrst, 'reload schema';

COMMIT;
