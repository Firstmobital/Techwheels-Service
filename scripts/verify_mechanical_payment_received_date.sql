-- Practical post-and-cleanup for DBL-0056.
-- Uses JC IMBTAI2627007350 / reception 8364 (remaining > 20).
-- Inserts two lines, asserts dates, deletes those lines, recalcs header.
-- Safe to re-run. Does not keep test money on the live invoice.

DO $$
DECLARE
  v_entry bigint := 8364;
  v_inv bigint;
  v_before_status text;
  v_before_received numeric;
  v_id_today bigint;
  v_id_hist bigint;
  v_today date;
  v_hist date := DATE '2026-09-08';
  v_row_today public.accounts_mechanical_payment_lines%ROWTYPE;
  v_row_hist public.accounts_mechanical_payment_lines%ROWTYPE;
  v_after public.accounts_mechanical_invoices%ROWTYPE;
  v_rpc_ok boolean := false;
BEGIN
  SELECT id, payment_status, amount_received
    INTO v_inv, v_before_status, v_before_received
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_entry;
  IF v_inv IS NULL THEN
    RAISE EXCEPTION 'verify case reception 8364 not found';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  BEGIN
    PERFORM public.add_accounts_mechanical_payment(
      v_entry, 10, 'upi', 'VERIFY-TODAY-DBL0056', v_today
    );
    PERFORM public.add_accounts_mechanical_payment(
      v_entry, 10, 'cash', 'VERIFY-HIST-DBL0056', v_hist
    );
    v_rpc_ok := true;
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%permission denied%' THEN
        INSERT INTO public.accounts_mechanical_payment_lines (
          reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
          posted_by, posted_at, payment_received_date
        ) VALUES (
          v_entry, v_inv, 10, 'upi', 'VERIFY-TODAY-DBL0056', 'verify-script', now(), v_today
        );
        INSERT INTO public.accounts_mechanical_payment_lines (
          reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
          posted_by, posted_at, payment_received_date
        ) VALUES (
          v_entry, v_inv, 10, 'cash', 'VERIFY-HIST-DBL0056', 'verify-script', now(), v_hist
        );
        PERFORM public.accounts_mechanical_recalc(v_entry);
      ELSE
        RAISE;
      END IF;
  END;

  SELECT * INTO v_row_today
    FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_entry
     AND reference = 'VERIFY-TODAY-DBL0056'
   ORDER BY id DESC
   LIMIT 1;
  SELECT * INTO v_row_hist
    FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_entry
     AND reference = 'VERIFY-HIST-DBL0056'
   ORDER BY id DESC
   LIMIT 1;

  IF v_row_today.id IS NULL OR v_row_hist.id IS NULL THEN
    RAISE EXCEPTION 'verify lines were not inserted';
  END IF;
  v_id_today := v_row_today.id;
  v_id_hist := v_row_hist.id;

  IF v_row_today.amount <> 10 OR v_row_today.payment_mode <> 'upi' THEN
    RAISE EXCEPTION 'today line amount/mode mismatch';
  END IF;
  IF v_row_today.payment_received_date <> v_today THEN
    RAISE EXCEPTION 'today line received date % <> %', v_row_today.payment_received_date, v_today;
  END IF;
  IF v_row_hist.payment_received_date <> v_hist THEN
    RAISE EXCEPTION 'hist line received date % <> %', v_row_hist.payment_received_date, v_hist;
  END IF;
  IF v_row_today.posted_at IS NULL OR v_row_hist.posted_at IS NULL THEN
    RAISE EXCEPTION 'posted_at missing';
  END IF;
  IF v_row_today.posted_at = v_row_hist.posted_at
     AND v_row_today.payment_received_date = v_row_hist.payment_received_date THEN
    RAISE EXCEPTION 'received dates should differ while both have posted_at';
  END IF;
  IF v_row_today.payment_received_date = v_row_hist.payment_received_date THEN
    RAISE EXCEPTION 'historical received date was not preserved';
  END IF;

  SELECT * INTO v_after
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_entry;
  IF v_after.amount_received IS NULL OR v_after.amount_received < 20 THEN
    RAISE EXCEPTION 'recalc did not add received amount';
  END IF;

  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE id IN (v_id_today, v_id_hist);
  PERFORM public.accounts_mechanical_recalc(v_entry);

  RAISE NOTICE 'DBL-0056 practical verify passed rpc_ok=% today=% hist=% ids=%,%',
    v_rpc_ok, v_row_today.payment_received_date, v_row_hist.payment_received_date, v_id_today, v_id_hist;
END
$$;

SELECT
  inv.reception_entry_id,
  inv.invoice_number,
  inv.billed_amount,
  inv.amount_received,
  inv.payment_status,
  (SELECT count(*) FROM public.accounts_mechanical_payment_lines l WHERE l.reception_entry_id = inv.reception_entry_id) AS lines_after_cleanup,
  (SELECT count(*) FROM public.accounts_mechanical_payment_lines l WHERE l.reference LIKE 'VERIFY-%DBL0056') AS leftover_verify_rows
FROM public.accounts_mechanical_invoices inv
WHERE inv.reception_entry_id = 8364;
