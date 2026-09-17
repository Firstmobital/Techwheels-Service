-- Practical verification for DBL-0075. Restores all mutations before finishing.
-- Writes Pending Remark through set_accounts_mechanical_pending_remark onto
-- existing Mechanical invoices, then restores original payment_notes.
-- Does not keep test remarks. Does not mutate payment lines, vouchers, or Bodyshop.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

CREATE TEMP TABLE _dbl0075_probe (
  step text PRIMARY KEY,
  ok boolean,
  detail jsonb
);

DO $$
DECLARE
  v_admin uuid := 'ded27442-7419-4dee-bbf2-6fdb5a5404e4';
  v_pending public.accounts_mechanical_invoices%ROWTYPE;
  v_other public.accounts_mechanical_invoices%ROWTYPE;
  v_received public.accounts_mechanical_invoices%ROWTYPE;
  v_pending_orig text;
  v_other_orig text;
  v_received_orig text;
  v_pending_billed numeric;
  v_pending_received numeric;
  v_pending_status text;
  v_json jsonb;
  v_reload public.accounts_mechanical_invoices%ROWTYPE;
  v_other_reload public.accounts_mechanical_invoices%ROWTYPE;
  v_received_reload public.accounts_mechanical_invoices%ROWTYPE;
  v_line_count_before bigint;
  v_line_count_after bigint;
  v_voucher_sample text;
  v_voucher_after text;
  v_bs_lines_before bigint;
  v_bs_lines_after bigint;
BEGIN
  SELECT * INTO v_pending
    FROM public.accounts_mechanical_invoices inv
   WHERE inv.billed_amount IS NOT NULL
     AND inv.billed_amount > 0
     AND public.accounts_mechanical_remaining_amount(inv.billed_amount, inv.amount_received) > 0
   ORDER BY inv.updated_at DESC NULLS LAST, inv.id DESC
   LIMIT 1;
  IF v_pending.reception_entry_id IS NULL THEN
    RAISE EXCEPTION 'DBL-0075 practical: no pending Mechanical invoice with remaining > 0';
  END IF;

  SELECT * INTO v_other
    FROM public.accounts_mechanical_invoices inv
   WHERE inv.reception_entry_id <> v_pending.reception_entry_id
     AND inv.billed_amount IS NOT NULL
   ORDER BY inv.updated_at DESC NULLS LAST, inv.id DESC
   LIMIT 1;
  IF v_other.reception_entry_id IS NULL THEN
    RAISE EXCEPTION 'DBL-0075 practical: need a second Mechanical invoice for isolation';
  END IF;

  SELECT * INTO v_received
    FROM public.accounts_mechanical_invoices inv
   WHERE inv.reception_entry_id <> v_pending.reception_entry_id
     AND inv.reception_entry_id <> v_other.reception_entry_id
     AND inv.payment_status = 'received'
   ORDER BY inv.updated_at DESC NULLS LAST, inv.id DESC
   LIMIT 1;
  IF v_received.reception_entry_id IS NULL THEN
    SELECT * INTO v_received
      FROM public.accounts_mechanical_invoices inv
     WHERE inv.reception_entry_id <> v_pending.reception_entry_id
       AND inv.reception_entry_id <> v_other.reception_entry_id
       AND public.accounts_mechanical_remaining_amount(inv.billed_amount, inv.amount_received) = 0
     ORDER BY inv.updated_at DESC NULLS LAST, inv.id DESC
     LIMIT 1;
  END IF;
  IF v_received.reception_entry_id IS NULL THEN
    RAISE EXCEPTION 'DBL-0075 practical: no received/settled Mechanical invoice';
  END IF;

  v_pending_orig := v_pending.payment_notes;
  v_other_orig := v_other.payment_notes;
  v_received_orig := v_received.payment_notes;
  v_pending_billed := v_pending.billed_amount;
  v_pending_received := v_pending.amount_received;
  v_pending_status := v_pending.payment_status;

  SELECT count(*) INTO v_line_count_before FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_pending.reception_entry_id;
  SELECT voucher_no INTO v_voucher_sample
    FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_pending.reception_entry_id
     AND voucher_no IS NOT NULL
   ORDER BY id
   LIMIT 1;
  SELECT count(*) INTO v_bs_lines_before FROM public.bodyshop_settlement_lines;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'email', 'mail@techwheels.in', 'role', 'authenticated')::text,
    true
  );

  v_json := public.set_accounts_mechanical_pending_remark(
    v_pending.reception_entry_id,
    '  Customer will pay tomorrow  '
  );
  SELECT * INTO v_reload
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_pending.reception_entry_id;
  INSERT INTO _dbl0075_probe VALUES (
    'a_pending_save',
    v_reload.payment_notes = 'Customer will pay tomorrow'
      AND v_json ->> 'payment_notes' = 'Customer will pay tomorrow'
      AND v_reload.billed_amount IS NOT DISTINCT FROM v_pending_billed
      AND v_reload.amount_received IS NOT DISTINCT FROM v_pending_received
      AND v_reload.payment_status IS NOT DISTINCT FROM v_pending_status,
    jsonb_build_object(
      'reception_entry_id', v_pending.reception_entry_id,
      'payment_notes', v_reload.payment_notes,
      'billed', v_reload.billed_amount,
      'received', v_reload.amount_received,
      'status', v_reload.payment_status
    )
  );

  v_json := public.set_accounts_mechanical_pending_remark(
    v_pending.reception_entry_id,
    'UPI confirmation awaited'
  );
  SELECT * INTO v_reload
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_pending.reception_entry_id;
  INSERT INTO _dbl0075_probe VALUES (
    'b_pending_edit',
    v_reload.payment_notes = 'UPI confirmation awaited'
      AND v_json ->> 'payment_notes' = 'UPI confirmation awaited',
    jsonb_build_object(
      'reception_entry_id', v_pending.reception_entry_id,
      'payment_notes', v_reload.payment_notes
    )
  );

  PERFORM public.set_accounts_mechanical_pending_remark(
    v_other.reception_entry_id,
    'Cheque not received'
  );
  SELECT * INTO v_reload
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_pending.reception_entry_id;
  SELECT * INTO v_other_reload
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_other.reception_entry_id;
  INSERT INTO _dbl0075_probe VALUES (
    'c_isolation',
    v_reload.payment_notes = 'UPI confirmation awaited'
      AND v_other_reload.payment_notes = 'Cheque not received',
    jsonb_build_object(
      'pending_id', v_pending.reception_entry_id,
      'pending_notes', v_reload.payment_notes,
      'other_id', v_other.reception_entry_id,
      'other_notes', v_other_reload.payment_notes
    )
  );

  PERFORM public.accounts_mechanical_recalc(v_pending.reception_entry_id);
  SELECT * INTO v_reload
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_pending.reception_entry_id;
  INSERT INTO _dbl0075_probe VALUES (
    'a_survives_recalc',
    v_reload.payment_notes = 'UPI confirmation awaited'
      AND v_reload.billed_amount IS NOT DISTINCT FROM v_pending_billed
      AND v_reload.payment_status IS NOT DISTINCT FROM v_pending_status
      AND v_reload.amount_received IS NOT DISTINCT FROM v_pending_received,
    jsonb_build_object(
      'payment_notes', v_reload.payment_notes,
      'billed', v_reload.billed_amount,
      'received', v_reload.amount_received,
      'status', v_reload.payment_status
    )
  );

  PERFORM public.set_accounts_mechanical_pending_remark(
    v_received.reception_entry_id,
    COALESCE(NULLIF(btrim(COALESCE(v_received_orig, '')), ''), 'Insurance balance pending')
  );
  PERFORM public.accounts_mechanical_recalc(v_received.reception_entry_id);
  SELECT * INTO v_received_reload
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_received.reception_entry_id;
  INSERT INTO _dbl0075_probe VALUES (
    'd_received_not_cleared',
    v_received_reload.payment_notes IS NOT NULL
      AND btrim(v_received_reload.payment_notes) <> ''
      AND v_received_reload.payment_status = v_received.payment_status
      AND v_received_reload.amount_received IS NOT DISTINCT FROM v_received.amount_received,
    jsonb_build_object(
      'reception_entry_id', v_received.reception_entry_id,
      'payment_notes', v_received_reload.payment_notes,
      'status', v_received_reload.payment_status
    )
  );

  PERFORM public.set_accounts_mechanical_pending_remark(v_pending.reception_entry_id, '   ');
  SELECT * INTO v_reload
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_pending.reception_entry_id;
  INSERT INTO _dbl0075_probe VALUES (
    'blank_stores_null',
    v_reload.payment_notes IS NULL,
    jsonb_build_object('payment_notes', v_reload.payment_notes)
  );

  SELECT count(*) INTO v_line_count_after FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_pending.reception_entry_id;
  SELECT voucher_no INTO v_voucher_after
    FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_pending.reception_entry_id
     AND voucher_no IS NOT NULL
   ORDER BY id
   LIMIT 1;
  SELECT count(*) INTO v_bs_lines_after FROM public.bodyshop_settlement_lines;
  INSERT INTO _dbl0075_probe VALUES (
    'money_vouchers_bodyshop_untouched',
    v_line_count_after = v_line_count_before
      AND v_voucher_after IS NOT DISTINCT FROM v_voucher_sample
      AND v_bs_lines_after = v_bs_lines_before,
    jsonb_build_object(
      'lines_before', v_line_count_before,
      'lines_after', v_line_count_after,
      'voucher_before', v_voucher_sample,
      'voucher_after', v_voucher_after,
      'bs_before', v_bs_lines_before,
      'bs_after', v_bs_lines_after
    )
  );

  UPDATE public.accounts_mechanical_invoices
     SET payment_notes = v_pending_orig
   WHERE reception_entry_id = v_pending.reception_entry_id;
  UPDATE public.accounts_mechanical_invoices
     SET payment_notes = v_other_orig
   WHERE reception_entry_id = v_other.reception_entry_id;
  UPDATE public.accounts_mechanical_invoices
     SET payment_notes = v_received_orig
   WHERE reception_entry_id = v_received.reception_entry_id;
END;
$$;

SELECT
  count(*) FILTER (WHERE NOT ok) AS leftover_fail,
  jsonb_agg(jsonb_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step) AS steps
FROM _dbl0075_probe;
