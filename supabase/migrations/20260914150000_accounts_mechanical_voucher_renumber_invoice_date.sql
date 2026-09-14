-- ACCOUNTS-001 / DBL-0059
-- Explicit full recalculation of mechanical receipt vouchers.
-- Clears every persisted voucher_no, restarts RApp/JApp sequences, and
-- reassigns from linked invoice_date >= 2026-09-02.
-- Cash: RApp/26-27/0001 onward. UPI+card share: JApp/26-27/0001 onward.
-- cheque/bank/other and invoice_date < 2026-09-02 stay NULL.
-- Requires DBL-0057 + DBL-0058. Do not re-run DBL-0057 / 0058.
-- Authority: supabase/migrations/20260914140000_accounts_mechanical_voucher_invoice_date.sql

BEGIN;

DO $$
DECLARE
  r record;
  v_cleared int := 0;
  v_cash int := 0;
  v_japp int := 0;
  v_skip_pre int := 0;
  v_skip_mode int := 0;
  v_skip_no_date int := 0;
BEGIN
  EXECUTE 'ALTER TABLE public.accounts_mechanical_payment_lines DISABLE TRIGGER trg_accounts_mechanical_payment_lines_protect_voucher';

  UPDATE public.accounts_mechanical_payment_lines
     SET voucher_no = NULL
   WHERE voucher_no IS NOT NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  PERFORM setval('public.accounts_mechanical_voucher_rapp_2627_seq', 1, false);
  PERFORM setval('public.accounts_mechanical_voucher_japp_2627_seq', 1, false);

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

  EXECUTE 'ALTER TABLE public.accounts_mechanical_payment_lines ENABLE TRIGGER trg_accounts_mechanical_payment_lines_protect_voucher';

  RAISE NOTICE 'DBL-0059 recalculation: cleared=% rapp_assigned=% japp_assigned=% skip_pre_2_sep=% skip_null_invoice_date=% skip_cheque_bank_other=%',
    v_cleared, v_cash, v_japp, v_skip_pre, v_skip_no_date, v_skip_mode;
END;
$$;

COMMENT ON COLUMN public.accounts_mechanical_payment_lines.voucher_no IS
  'DBL-0059: Recalculated receipt voucher from invoice_date >= 2026-09-02. Cash RApp/26-27/nnnn; UPI+card share JApp/26-27/nnnn. Null for earlier invoices and cheque/bank/other.';

COMMIT;
