-- Practical verification for DBL-0074. Restores all mutations before finishing.
-- Creates throwaway reception + invoice + payment lines + one DMS labour row.
-- Does not keep test money. Does not rewrite live voucher_no (including 221/222).
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

CREATE TEMP TABLE _dbl0074_probe (
  step text PRIMARY KEY,
  ok boolean,
  detail jsonb
);

DO $$
DECLARE
  v_jc text := 'JC-MBTPLT-JP2-2627-V07401';
  v_dealer text;
  v_entry bigint;
  v_inv_id bigint;
  v_dms_id bigint;
  v_line_upi public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_cash public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_bank public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_pre public.accounts_mechanical_payment_lines%ROWTYPE;
  v_after_dms public.accounts_mechanical_payment_lines%ROWTYPE;
  v_after_date public.accounts_mechanical_payment_lines%ROWTYPE;
  v_cash_after public.accounts_mechanical_payment_lines%ROWTYPE;
  v_bank_after public.accounts_mechanical_payment_lines%ROWTYPE;
  v_pre_after public.accounts_mechanical_payment_lines%ROWTYPE;
  v_ravi_before text;
  v_ramesh_before text;
  v_ravi_after text;
  v_ramesh_after text;
  v_assigned integer;
  v_assigned_again integer;
BEGIN
  IF char_length(v_jc) < char_length('JC-MBTPLT-JP1-2627-003041') THEN
    RAISE EXCEPTION 'DBL-0074 practical: test JC shorter than reception CHECK';
  END IF;

  SELECT voucher_no INTO v_ravi_before
    FROM public.accounts_mechanical_payment_lines WHERE id = 221;
  SELECT voucher_no INTO v_ramesh_before
    FROM public.accounts_mechanical_payment_lines WHERE id = 222;

  SELECT e.dealer_code INTO v_dealer
    FROM public.service_reception_entries e
   WHERE NULLIF(btrim(e.dealer_code), '') IS NOT NULL
   ORDER BY e.id DESC
   LIMIT 1;

  INSERT INTO public.service_reception_entries (
    dealer_code, reg_number, model, service_type, sa_name, jc_number,
    owner_name, source, created_by, invoice_done_at, invoice_done_by, branch
  ) VALUES (
    v_dealer, 'RJ00ZZ0074', 'Nexon', 'Paid Service', 'VERIFY DBL0074',
    v_jc, 'VERIFY LATE VOUCHER', 'verify-dbl0074', 'verify-script',
    timestamptz '2026-09-16 10:00:00+05:30', 'verify-script', 'Sitapura'
  )
  RETURNING id INTO v_entry;

  INSERT INTO public.accounts_mechanical_invoices (
    reception_entry_id, jc_number, invoice_number, invoice_date, billed_amount,
    payment_status, captured_by
  ) VALUES (
    v_entry, v_jc, NULL, NULL, 9000.00, 'pending', 'verify-script'
  )
  RETURNING id INTO v_inv_id;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    v_entry, v_inv_id, 4000.00, 'upi', 'VERIFY-DBL0074-UPI',
    'verify-script', timestamptz '2026-09-16 11:00:00+05:30', DATE '2026-09-16', NULL
  )
  RETURNING * INTO v_line_upi;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    v_entry, v_inv_id, 3000.00, 'cash', 'VERIFY-DBL0074-CASH',
    'verify-script', timestamptz '2026-09-16 11:01:00+05:30', DATE '2026-09-16', NULL
  )
  RETURNING * INTO v_line_cash;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    v_entry, v_inv_id, 500.00, 'bank', 'VERIFY-DBL0074-BANK',
    'verify-script', timestamptz '2026-09-16 11:02:00+05:30', DATE '2026-09-16', NULL
  )
  RETURNING * INTO v_line_bank;

  INSERT INTO _dbl0074_probe VALUES (
    'posted_before_dms_null',
    v_line_upi.voucher_no IS NULL AND v_line_cash.voucher_no IS NULL AND v_line_bank.voucher_no IS NULL,
    jsonb_build_object('upi', v_line_upi.id, 'cash', v_line_cash.id, 'bank', v_line_bank.id)
  );

  INSERT INTO public.psf_revenue_dms (
    branch, location, portal, invoice_number, invoice_date, invoice_status,
    total_invoice_amount, job_card_number, first_name, last_name,
    vehicle_registration_number
  ) VALUES (
    'Sitapura', 'Sitapura', 'PV', 'VERIFYDBL00740001', DATE '2026-09-16', 'New',
    9000, v_jc, 'VERIFY', 'LATE', 'RJ00ZZ0074'
  )
  RETURNING id INTO v_dms_id;

  SELECT * INTO v_after_dms
    FROM public.accounts_mechanical_payment_lines WHERE id = v_line_upi.id;
  SELECT * INTO v_cash_after
    FROM public.accounts_mechanical_payment_lines WHERE id = v_line_cash.id;
  SELECT * INTO v_bank_after
    FROM public.accounts_mechanical_payment_lines WHERE id = v_line_bank.id;

  INSERT INTO _dbl0074_probe VALUES (
    'dms_assigns_upi_japp',
    v_after_dms.voucher_no ~ '^JApp/26-27/[0-9]{4}$',
    jsonb_build_object('voucher_no', v_after_dms.voucher_no)
  );
  INSERT INTO _dbl0074_probe VALUES (
    'dms_assigns_cash_rapp',
    v_cash_after.voucher_no ~ '^RApp/26-27/[0-9]{4}$',
    jsonb_build_object('voucher_no', v_cash_after.voucher_no)
  );
  INSERT INTO _dbl0074_probe VALUES (
    'split_two_vouchers',
    v_after_dms.voucher_no IS DISTINCT FROM v_cash_after.voucher_no
      AND v_after_dms.voucher_no LIKE 'JApp/%'
      AND v_cash_after.voucher_no LIKE 'RApp/%',
    jsonb_build_object('upi', v_after_dms.voucher_no, 'cash', v_cash_after.voucher_no)
  );
  INSERT INTO _dbl0074_probe VALUES (
    'bank_stays_null',
    v_bank_after.voucher_no IS NULL,
    jsonb_build_object('mode', v_bank_after.payment_mode)
  );

  v_assigned := public.accounts_mechanical_assign_eligible_null_vouchers(v_entry, NULL);
  SELECT voucher_no INTO v_after_dms.voucher_no
    FROM public.accounts_mechanical_payment_lines WHERE id = v_line_upi.id;
  v_assigned_again := public.accounts_mechanical_assign_eligible_null_vouchers(v_entry, NULL);

  INSERT INTO _dbl0074_probe VALUES (
    'rerun_idempotent',
    v_assigned = 0 AND v_assigned_again = 0
      AND (SELECT voucher_no FROM public.accounts_mechanical_payment_lines WHERE id = v_line_upi.id)
        = v_after_dms.voucher_no,
    jsonb_build_object('first', v_assigned, 'second', v_assigned_again, 'voucher', v_after_dms.voucher_no)
  );

  -- Second fixture: Accounts invoice_date later, no DMS
  v_jc := 'JC-MBTPLT-JP2-2627-V07402';
  INSERT INTO public.service_reception_entries (
    dealer_code, reg_number, model, service_type, sa_name, jc_number,
    owner_name, source, created_by, invoice_done_at, invoice_done_by, branch
  ) VALUES (
    v_dealer, 'RJ00ZZ0075', 'Nexon', 'Paid Service', 'VERIFY DBL0074',
    v_jc, 'VERIFY LATE DATE', 'verify-dbl0074', 'verify-script',
    timestamptz '2026-09-16 10:00:00+05:30', 'verify-script', 'Sitapura'
  )
  RETURNING id INTO v_entry;

  INSERT INTO public.accounts_mechanical_invoices (
    reception_entry_id, jc_number, invoice_number, invoice_date, billed_amount,
    payment_status, captured_by
  ) VALUES (
    v_entry, v_jc, NULL, NULL, 2000.00, 'pending', 'verify-script'
  )
  RETURNING id INTO v_inv_id;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    v_entry, v_inv_id, 2000.00, 'upi', 'VERIFY-DBL0074-DATE',
    'verify-script', timestamptz '2026-09-16 12:00:00+05:30', DATE '2026-09-16', NULL
  )
  RETURNING * INTO v_line_upi;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    v_entry, v_inv_id, 100.00, 'cash', 'VERIFY-DBL0074-PRE',
    'verify-script', timestamptz '2026-09-01 12:00:00+05:30', DATE '2026-09-01', NULL
  )
  RETURNING * INTO v_line_pre;

  -- Force the pre-cutoff line onto an invoice date before 2-Sep via a sibling case? Same invoice.
  -- Keep pre-cutoff by setting this header date only after copying pre line to its own invoice.
  -- Simpler: set header date >= cutoff; pre line on this header would become eligible.
  -- Dedicated pre-cutoff header:
  DELETE FROM public.accounts_mechanical_payment_lines WHERE id = v_line_pre.id;

  UPDATE public.accounts_mechanical_invoices
     SET invoice_number = 'VERIFYDBL00740002',
         invoice_date = DATE '2026-09-16',
         updated_at = now()
   WHERE id = v_inv_id;

  PERFORM public.accounts_mechanical_assign_eligible_null_vouchers(v_entry, NULL);

  SELECT * INTO v_after_date
    FROM public.accounts_mechanical_payment_lines WHERE id = v_line_upi.id;

  INSERT INTO _dbl0074_probe VALUES (
    'invoice_date_later_assigns',
    v_after_date.voucher_no ~ '^JApp/26-27/[0-9]{4}$'
      AND v_line_upi.voucher_no IS NULL,
    jsonb_build_object(
      'before', v_line_upi.voucher_no,
      'after', v_after_date.voucher_no
    )
  );

  -- Pre-cutoff: own invoice dated 1-Sep
  INSERT INTO public.service_reception_entries (
    dealer_code, reg_number, model, service_type, sa_name, jc_number,
    owner_name, source, created_by, invoice_done_at, invoice_done_by, branch
  ) VALUES (
    v_dealer, 'RJ00ZZ0076', 'Nexon', 'Paid Service', 'VERIFY DBL0074',
    'JC-MBTPLT-JP2-2627-V07403', 'VERIFY PRE CUTOFF', 'verify-dbl0074', 'verify-script',
    timestamptz '2026-09-16 10:00:00+05:30', 'verify-script', 'Sitapura'
  )
  RETURNING id INTO v_entry;

  INSERT INTO public.accounts_mechanical_invoices (
    reception_entry_id, jc_number, invoice_number, invoice_date, billed_amount,
    payment_status, captured_by
  ) VALUES (
    v_entry, 'JC-MBTPLT-JP2-2627-V07403', 'VERIFYPRE', DATE '2026-09-01', 1000.00,
    'pending', 'verify-script'
  )
  RETURNING id INTO v_inv_id;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    v_entry, v_inv_id, 1000.00, 'cash', 'VERIFY-DBL0074-PRECUT',
    'verify-script', timestamptz '2026-09-01 12:00:00+05:30', DATE '2026-09-01', NULL
  )
  RETURNING * INTO v_line_pre;

  PERFORM public.accounts_mechanical_assign_eligible_null_vouchers(v_entry, NULL);
  SELECT * INTO v_pre_after
    FROM public.accounts_mechanical_payment_lines WHERE id = v_line_pre.id;

  INSERT INTO _dbl0074_probe VALUES (
    'pre_cutoff_not_assigned',
    v_pre_after.voucher_no IS NULL,
    jsonb_build_object('id', v_pre_after.id)
  );

  SELECT voucher_no INTO v_ravi_after
    FROM public.accounts_mechanical_payment_lines WHERE id = 221;
  SELECT voucher_no INTO v_ramesh_after
    FROM public.accounts_mechanical_payment_lines WHERE id = 222;

  INSERT INTO _dbl0074_probe VALUES (
    'live_221_222_unchanged_by_practical',
    v_ravi_before IS NOT DISTINCT FROM v_ravi_after
      AND v_ramesh_before IS NOT DISTINCT FROM v_ramesh_after,
    jsonb_build_object(
      'ravi_before', v_ravi_before, 'ravi_after', v_ravi_after,
      'ramesh_before', v_ramesh_before, 'ramesh_after', v_ramesh_after
    )
  );

  -- Restore throwaway rows
  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE reference LIKE 'VERIFY-DBL0074-%';
  DELETE FROM public.psf_revenue_dms
   WHERE invoice_number LIKE 'VERIFYDBL0074%' OR id = v_dms_id;
  DELETE FROM public.accounts_mechanical_invoices
   WHERE jc_number LIKE 'JC-MBTPLT-JP2-2627-V074%';
  DELETE FROM public.service_reception_entries
   WHERE jc_number LIKE 'JC-MBTPLT-JP2-2627-V074%';
EXCEPTION
  WHEN OTHERS THEN
    DELETE FROM public.accounts_mechanical_payment_lines
     WHERE reference LIKE 'VERIFY-DBL0074-%';
    DELETE FROM public.psf_revenue_dms
     WHERE invoice_number LIKE 'VERIFYDBL0074%';
    DELETE FROM public.accounts_mechanical_invoices
     WHERE jc_number LIKE 'JC-MBTPLT-JP2-2627-V074%';
    DELETE FROM public.service_reception_entries
     WHERE jc_number LIKE 'JC-MBTPLT-JP2-2627-V074%';
    RAISE;
END;
$$;

SELECT jsonb_build_object(
  'probes', (SELECT jsonb_agg(jsonb_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step) FROM _dbl0074_probe),
  'leftover_fail', (SELECT count(*) FILTER (WHERE NOT ok) FROM _dbl0074_probe),
  'ravi_221', (SELECT voucher_no FROM public.accounts_mechanical_payment_lines WHERE id = 221),
  'ramesh_222', (SELECT voucher_no FROM public.accounts_mechanical_payment_lines WHERE id = 222),
  'leftover_verify_lines', (
    SELECT count(*) FROM public.accounts_mechanical_payment_lines WHERE reference LIKE 'VERIFY-DBL0074-%'
  ),
  'leftover_verify_reception', (
    SELECT count(*) FROM public.service_reception_entries WHERE jc_number LIKE 'JC-MBTPLT-JP2-2627-V074%'
  )
) AS practical_ok;
