-- Practical verification for DBL-0061. Restores all mutations before finishing.
-- Target: reception_entry_id 8783 (billed 1468, unpaid). Do not leave Keep on Credit or probe receipts.

CREATE TEMP TABLE _dbl0061_probe (
  step text PRIMARY KEY,
  ok boolean,
  detail jsonb
);

DO $$
DECLARE
  v_clerk uuid := 'ff6d63de-09dc-4204-b7ff-484445bcf690';
  v_admin uuid := 'ded27442-7419-4dee-bbf2-6fdb5a5404e4';
  v_id bigint := 8783;
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_inv_reload public.accounts_mechanical_invoices%ROWTYPE;
  v_line public.accounts_mechanical_payment_lines%ROWTYPE;
  v_reason text;
  v_can_credit boolean;
  v_can_access boolean;
BEGIN
  INSERT INTO _dbl0061_probe VALUES (
    'case1_helper',
    public.accounts_mechanical_remaining_amount(10000, 9850) = 150
      AND public.accounts_mechanical_gatepass_reason(10000, 9850, false) = 'short_payment',
    jsonb_build_object(
      'billed', 10000,
      'received', 9850,
      'remaining', public.accounts_mechanical_remaining_amount(10000, 9850),
      'reason', public.accounts_mechanical_gatepass_reason(10000, 9850, false),
      'financial_status', 'partial'
    )
  );

  PERFORM set_config('request.jwt.claim.sub', v_clerk::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_clerk::text, 'email', 'opyadav8094@gmail.com', 'role', 'authenticated')::text,
    true
  );

  v_can_access := public.accounts_can_access();
  v_can_credit := public.accounts_mechanical_can_keep_on_credit();
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_id;
  v_reason := public.accounts_mechanical_gatepass_reason(
    v_inv.billed_amount, v_inv.amount_received, COALESCE(v_inv.keep_on_credit, false)
  );

  INSERT INTO _dbl0061_probe VALUES (
    'case2_live_unpaid',
    v_can_access
      AND NOT v_can_credit
      AND v_reason IS NULL
      AND public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received) > public.accounts_mechanical_short_payment_allowance(v_inv.billed_amount)
      AND COALESCE(v_inv.payment_status, 'pending') IN ('pending', 'partial'),
    jsonb_build_object(
      'reception_entry_id', v_id,
      'billed', v_inv.billed_amount,
      'received', v_inv.amount_received,
      'remaining', public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received),
      'payment_status', v_inv.payment_status,
      'gatepass_reason', v_reason,
      'accounts_can_access', v_can_access,
      'can_keep_on_credit', v_can_credit
    )
  );

  BEGIN
    PERFORM public.set_accounts_mechanical_keep_on_credit(v_id, true);
    INSERT INTO _dbl0061_probe VALUES (
      'case_f_unauth_credit',
      false,
      jsonb_build_object('error', 'unauthorized setter succeeded')
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _dbl0061_probe VALUES (
      'case_f_unauth_credit',
      SQLSTATE = '42501',
      jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
    );
  END;

  BEGIN
    PERFORM public.issue_accounts_mechanical_gatepass(v_id);
    INSERT INTO _dbl0061_probe VALUES (
      'case5_issue_denied',
      false,
      jsonb_build_object('error', 'issue succeeded unexpectedly')
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _dbl0061_probe VALUES (
      'case5_issue_denied',
      SQLERRM ILIKE '%gatepass not eligible%',
      jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
    );
  END;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'email', 'mail@techwheels.in', 'role', 'authenticated')::text,
    true
  );

  INSERT INTO _dbl0061_probe VALUES (
    'admin_can_credit',
    public.is_admin() AND public.accounts_mechanical_can_keep_on_credit(),
    jsonb_build_object(
      'is_admin', public.is_admin(),
      'can_keep_on_credit', public.accounts_mechanical_can_keep_on_credit()
    )
  );

  PERFORM public.set_accounts_mechanical_keep_on_credit(v_id, true);
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_id;
  SELECT * INTO v_inv_reload FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_id;
  v_reason := public.accounts_mechanical_gatepass_reason(
    v_inv.billed_amount, v_inv.amount_received, COALESCE(v_inv.keep_on_credit, false)
  );

  INSERT INTO _dbl0061_probe VALUES (
    'case3_credit_enables_gatepass',
    v_inv.keep_on_credit
      AND v_reason = 'keep_on_credit'
      AND public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received) > 0
      AND COALESCE(v_inv.payment_status, 'pending') IN ('pending', 'partial')
      AND v_inv.keep_on_credit_approved_by IS NOT NULL
      AND v_inv.keep_on_credit_approved_at IS NOT NULL,
    jsonb_build_object(
      'keep_on_credit', v_inv.keep_on_credit,
      'approved_by', v_inv.keep_on_credit_approved_by,
      'approved_at', v_inv.keep_on_credit_approved_at,
      'remaining', public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received),
      'payment_status', v_inv.payment_status,
      'gatepass_reason', v_reason
    )
  );

  INSERT INTO _dbl0061_probe VALUES (
    'case6_reload_audit',
    v_inv_reload.keep_on_credit
      AND v_inv_reload.keep_on_credit_approved_by = v_inv.keep_on_credit_approved_by
      AND v_inv_reload.keep_on_credit_approved_at = v_inv.keep_on_credit_approved_at,
    jsonb_build_object(
      'approved_by', v_inv_reload.keep_on_credit_approved_by,
      'approved_at', v_inv_reload.keep_on_credit_approved_at
    )
  );

  PERFORM public.set_accounts_mechanical_keep_on_credit(v_id, false);

  PERFORM public.add_accounts_mechanical_payment(
    v_id, 3700, 'other', 'DBL0061-PROBE-OVERPAY', DATE '2026-09-15'
  );

  SELECT * INTO v_line
    FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_id
     AND reference = 'DBL0061-PROBE-OVERPAY'
   ORDER BY id DESC
   LIMIT 1;
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_id;

  INSERT INTO _dbl0061_probe VALUES (
    'case4_overpay',
    v_line.amount = 3700
      AND COALESCE(v_inv.amount_received, 0) >= 3700
      AND public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received) = 0
      AND v_inv.payment_status = 'received'
      AND public.accounts_mechanical_gatepass_reason(v_inv.billed_amount, v_inv.amount_received, false) = 'paid',
    jsonb_build_object(
      'stored_line_amount', v_line.amount,
      'amount_received', v_inv.amount_received,
      'remaining', public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received),
      'payment_status', v_inv.payment_status,
      'payment_mode', v_line.payment_mode,
      'voucher_no', v_line.voucher_no
    )
  );

  INSERT INTO _dbl0061_probe VALUES (
    'case7_export_amount_is_line',
    v_line.amount = 3700,
    jsonb_build_object(
      'busy_amount_dr', v_line.amount,
      'busy_amount_cr', v_line.amount,
      'note', 'BUSY export Amount DR/CR is the payment line amount; other-mode lines are skipped in BUSY cash/upi/card export, so the 3700 fixture is also asserted in verify_accounts_split_payment_drafts.mjs as UPI 3700'
    )
  );

  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_id
     AND reference = 'DBL0061-PROBE-OVERPAY';
  PERFORM public.accounts_mechanical_recalc(v_id);

  UPDATE public.accounts_mechanical_invoices
     SET keep_on_credit = false,
         keep_on_credit_approved_by = NULL,
         keep_on_credit_approved_at = NULL,
         updated_at = now()
   WHERE reception_entry_id = v_id;

EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = 8783
     AND reference = 'DBL0061-PROBE-OVERPAY';
  BEGIN
    PERFORM public.accounts_mechanical_recalc(8783);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  UPDATE public.accounts_mechanical_invoices
     SET keep_on_credit = false,
         keep_on_credit_approved_by = NULL,
         keep_on_credit_approved_at = NULL,
         updated_at = now()
   WHERE reception_entry_id = 8783;
  INSERT INTO _dbl0061_probe VALUES (
    'probe_error',
    false,
    jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
  ) ON CONFLICT (step) DO UPDATE
    SET ok = EXCLUDED.ok, detail = EXCLUDED.detail;
END $$;

SELECT step, ok, detail FROM _dbl0061_probe ORDER BY step;
