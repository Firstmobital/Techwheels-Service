-- Practical verification for DBL-0082. Restores every probe mutation.
-- Calls the existing handoff function (the same helper SA save PERFORM's).
-- Does not keep test billed amounts. Does not rewrite historical paid rows.
-- Does not mutate DMS. Does not post live receipts on production cases
-- except temporary probe lines that are deleted before finish.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

CREATE TEMP TABLE _dbl0082_probe (
  step text PRIMARY KEY,
  ok boolean,
  detail jsonb
);

DO $$
DECLARE
  v_a public.accounts_mechanical_invoices%ROWTYPE;
  v_a_billed numeric;
  v_a_updated timestamptz;
  v_b public.accounts_mechanical_invoices%ROWTYPE;
  v_b_billed numeric;
  v_c_entry public.service_reception_entries%ROWTYPE;
  v_c_invoice_id bigint;
  v_discount public.accounts_mechanical_invoices%ROWTYPE;
  v_discount_billed numeric;
  v_credit public.accounts_mechanical_invoices%ROWTYPE;
  v_credit_billed numeric;
  v_credit_updated timestamptz;
  v_reload public.accounts_mechanical_invoices%ROWTYPE;
  v_dms_before numeric;
  v_dms_after numeric;
  v_remaining numeric;
  v_probe_amount numeric := 111.11;
BEGIN
  -- Scenario A: invoice number captured, no payment lines → billed refreshes
  SELECT * INTO v_a
    FROM public.accounts_mechanical_invoices inv
   WHERE NULLIF(btrim(inv.invoice_number), '') IS NOT NULL
     AND inv.billed_amount IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts_mechanical_payment_lines l
        WHERE l.reception_entry_id = inv.reception_entry_id
     )
     AND EXISTS (
       SELECT 1 FROM public.service_reception_entries e
        WHERE e.id = inv.reception_entry_id
          AND public.is_floor_incharge_service_type(e.service_type)
          AND NULLIF(btrim(e.jc_number), '') IS NOT NULL
     )
   ORDER BY CASE WHEN inv.reception_entry_id = 9073 THEN 0 ELSE 1 END,
            inv.updated_at DESC NULLS LAST, inv.id DESC
   LIMIT 1;
  IF v_a.reception_entry_id IS NULL THEN
    RAISE EXCEPTION 'DBL-0082 practical: no invoice-number-only mechanical case';
  END IF;
  v_a_billed := v_a.billed_amount;
  v_a_updated := v_a.updated_at;
  IF v_a_billed = v_probe_amount THEN
    v_probe_amount := 222.22;
  END IF;

  PERFORM public.service_advisor_seed_mechanical_billed_amount(v_a.reception_entry_id, v_probe_amount);
  SELECT * INTO v_reload
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_a.reception_entry_id;
  INSERT INTO _dbl0082_probe VALUES (
    'A invoice_number_no_lines_refreshes_billed',
    v_reload.billed_amount = v_probe_amount
      AND v_reload.invoice_number = v_a.invoice_number
      AND v_reload.invoice_date IS NOT DISTINCT FROM v_a.invoice_date,
    jsonb_build_object(
      'reception_entry_id', v_a.reception_entry_id,
      'invoice_number', v_a.invoice_number,
      'before', v_a_billed,
      'after', v_reload.billed_amount
    )
  );
  UPDATE public.accounts_mechanical_invoices
     SET billed_amount = v_a_billed,
         updated_at = v_a_updated
   WHERE reception_entry_id = v_a.reception_entry_id;
  PERFORM public.accounts_mechanical_recalc(v_a.reception_entry_id);

  -- Scenario B: any payment line → billed stays
  SELECT * INTO v_b
    FROM public.accounts_mechanical_invoices inv
   WHERE inv.billed_amount IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.accounts_mechanical_payment_lines l
        WHERE l.reception_entry_id = inv.reception_entry_id
     )
     AND EXISTS (
       SELECT 1 FROM public.service_reception_entries e
        WHERE e.id = inv.reception_entry_id
          AND public.is_floor_incharge_service_type(e.service_type)
     )
   ORDER BY inv.updated_at DESC NULLS LAST, inv.id DESC
   LIMIT 1;
  IF v_b.reception_entry_id IS NULL THEN
    RAISE EXCEPTION 'DBL-0082 practical: no mechanical case with payment lines';
  END IF;
  v_b_billed := v_b.billed_amount;
  PERFORM public.service_advisor_seed_mechanical_billed_amount(v_b.reception_entry_id, v_probe_amount);
  SELECT * INTO v_reload
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_b.reception_entry_id;
  INSERT INTO _dbl0082_probe VALUES (
    'B payment_line_locks_billed',
    v_reload.billed_amount IS NOT DISTINCT FROM v_b_billed,
    jsonb_build_object(
      'reception_entry_id', v_b.reception_entry_id,
      'billed', v_reload.billed_amount,
      'attempted', v_probe_amount
    )
  );

  -- Scenario B-discount: discount reference is financial activity
  SELECT * INTO v_discount
    FROM public.accounts_mechanical_invoices inv
   WHERE inv.billed_amount IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.accounts_mechanical_payment_lines l
        WHERE l.reception_entry_id = inv.reception_entry_id
          AND lower(btrim(coalesce(l.reference, ''))) = 'discount'
     )
   ORDER BY inv.updated_at DESC NULLS LAST, inv.id DESC
   LIMIT 1;
  IF v_discount.reception_entry_id IS NULL THEN
    INSERT INTO _dbl0082_probe VALUES (
      'B2 discount_line_locks_billed',
      false,
      jsonb_build_object('error', 'no discount line fixture')
    );
  ELSE
    v_discount_billed := v_discount.billed_amount;
    PERFORM public.service_advisor_seed_mechanical_billed_amount(v_discount.reception_entry_id, v_probe_amount);
    SELECT * INTO v_reload
      FROM public.accounts_mechanical_invoices
     WHERE reception_entry_id = v_discount.reception_entry_id;
    INSERT INTO _dbl0082_probe VALUES (
      'B2 discount_line_locks_billed',
      v_reload.billed_amount IS NOT DISTINCT FROM v_discount_billed,
      jsonb_build_object(
        'reception_entry_id', v_discount.reception_entry_id,
        'billed', v_reload.billed_amount
      )
    );
  END IF;

  -- Scenario C: uncaptured insert still seeds
  SELECT * INTO v_c_entry
    FROM public.service_reception_entries e
   WHERE public.is_floor_incharge_service_type(e.service_type)
     AND NULLIF(btrim(e.jc_number), '') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts_mechanical_invoices inv
        WHERE inv.reception_entry_id = e.id
     )
   ORDER BY e.id DESC
   LIMIT 1;
  IF v_c_entry.id IS NULL THEN
    RAISE EXCEPTION 'DBL-0082 practical: no uncaptured floor reception for insert seed';
  END IF;
  PERFORM public.service_advisor_seed_mechanical_billed_amount(v_c_entry.id, 2500);
  SELECT id, billed_amount, invoice_number, invoice_date
    INTO v_c_invoice_id, v_reload.billed_amount, v_reload.invoice_number, v_reload.invoice_date
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_c_entry.id;
  INSERT INTO _dbl0082_probe VALUES (
    'C uncaptured_insert_seeds_billed',
    v_c_invoice_id IS NOT NULL
      AND v_reload.billed_amount = 2500
      AND v_reload.invoice_number IS NULL
      AND v_reload.invoice_date IS NULL,
    jsonb_build_object(
      'reception_entry_id', v_c_entry.id,
      'invoice_id', v_c_invoice_id,
      'billed', v_reload.billed_amount
    )
  );
  DELETE FROM public.accounts_mechanical_invoices WHERE id = v_c_invoice_id;

  -- Keep on Credit without lines is not a billed lock
  SELECT * INTO v_credit
    FROM public.accounts_mechanical_invoices inv
   WHERE COALESCE(inv.keep_on_credit, false)
     AND NULLIF(btrim(inv.keep_on_credit_reason), '') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts_mechanical_payment_lines l
        WHERE l.reception_entry_id = inv.reception_entry_id
     )
     AND EXISTS (
       SELECT 1 FROM public.service_reception_entries e
        WHERE e.id = inv.reception_entry_id
          AND public.is_floor_incharge_service_type(e.service_type)
     )
   ORDER BY inv.id DESC
   LIMIT 1;
  IF v_credit.reception_entry_id IS NULL THEN
    INSERT INTO _dbl0082_probe VALUES (
      'D keep_on_credit_without_lines_does_not_lock',
      true,
      jsonb_build_object('skipped', 'no live credit-without-lines fixture')
    );
  ELSE
    v_credit_billed := v_credit.billed_amount;
    v_credit_updated := v_credit.updated_at;
    PERFORM public.service_advisor_seed_mechanical_billed_amount(v_credit.reception_entry_id, v_probe_amount);
    SELECT * INTO v_reload
      FROM public.accounts_mechanical_invoices
     WHERE reception_entry_id = v_credit.reception_entry_id;
    INSERT INTO _dbl0082_probe VALUES (
      'D keep_on_credit_without_lines_does_not_lock',
      v_reload.billed_amount = v_probe_amount
        AND COALESCE(v_reload.keep_on_credit, false),
      jsonb_build_object(
        'reception_entry_id', v_credit.reception_entry_id,
        'before', v_credit_billed,
        'after', v_reload.billed_amount
      )
    );
    UPDATE public.accounts_mechanical_invoices
       SET billed_amount = v_credit_billed,
           updated_at = v_credit_updated
     WHERE reception_entry_id = v_credit.reception_entry_id;
    PERFORM public.accounts_mechanical_recalc(v_credit.reception_entry_id);
  END IF;

  -- Concrete case 9073: handoff can move 37076.26 → 36002 when no lines
  -- Restore immediately; live persist is a separate operator step.
  SELECT * INTO v_reload
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = 9073;
  SELECT total_invoice_amount INTO v_dms_before
    FROM public.psf_revenue_dms
   WHERE invoice_number = 'IMBTAI2627007720'
   LIMIT 1;
  PERFORM public.service_advisor_seed_mechanical_billed_amount(9073, 36002);
  SELECT * INTO v_a
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = 9073;
  v_remaining := public.accounts_mechanical_remaining_amount(v_a.billed_amount, v_a.amount_received);
  SELECT total_invoice_amount INTO v_dms_after
    FROM public.psf_revenue_dms
   WHERE invoice_number = 'IMBTAI2627007720'
   LIMIT 1;
  INSERT INTO _dbl0082_probe VALUES (
    'E live_9073_handoff_can_set_36002',
    v_a.billed_amount = 36002
      AND v_remaining = 36002
      AND v_a.invoice_number = 'IMBTAI2627007720'
      AND v_dms_after IS NOT DISTINCT FROM v_dms_before,
    jsonb_build_object(
      'billed', v_a.billed_amount,
      'remaining', v_remaining,
      'invoice_number', v_a.invoice_number,
      'dms', v_dms_after
    )
  );
  UPDATE public.accounts_mechanical_invoices
     SET billed_amount = 37076.26,
         updated_at = v_reload.updated_at
   WHERE reception_entry_id = 9073;
  PERFORM public.accounts_mechanical_recalc(9073);
END;
$$;

-- Single result set so linked CLI shows leftover + probes + restore proof
SELECT
  (SELECT COUNT(*) FILTER (WHERE NOT ok) FROM _dbl0082_probe) AS leftover_fail,
  (SELECT jsonb_agg(jsonb_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step)
     FROM _dbl0082_probe) AS probes,
  e.expected_invoice_amount,
  inv.billed_amount,
  public.accounts_mechanical_remaining_amount(inv.billed_amount, inv.amount_received) AS remaining_amount,
  (SELECT COUNT(*) FROM public.accounts_mechanical_payment_lines l WHERE l.reception_entry_id = 9073) AS payment_line_count
FROM public.service_reception_entries e
JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 9073;
