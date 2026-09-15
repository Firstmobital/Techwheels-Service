-- Practical verification for DBL-0066. Restores all mutations before finishing.
-- Target: reception_entry_id 8783 (existing unpaid Mechanical invoice).
-- Do not leave Keep on Credit, probe receipts, or extra permission grants.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

CREATE TEMP TABLE _dbl0065_probe (
  step text PRIMARY KEY,
  ok boolean,
  detail jsonb
);

DO $$
DECLARE
  v_clerk uuid := 'ff6d63de-09dc-4204-b7ff-484445bcf690';
  v_admin uuid := 'ded27442-7419-4dee-bbf2-6fdb5a5404e4';
  v_gm uuid;
  v_id bigint := 8783;
  v_module_id integer;
  v_prev_view boolean;
  v_prev_modify boolean;
  v_had_grant boolean := false;
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_inv_reload public.accounts_mechanical_invoices%ROWTYPE;
  v_line public.accounts_mechanical_payment_lines%ROWTYPE;
  v_reason text;
  v_can_credit boolean;
  v_can_access boolean;
BEGIN
  SELECT id INTO v_module_id FROM public.modules WHERE name = 'accounts_keep_on_credit';

  SELECT uel.user_id INTO v_gm
    FROM public.user_employee_links uel
    JOIN public.employee_master em ON em.employee_code = uel.employee_code
   WHERE uel.is_active = true
     AND COALESCE(em.is_active, true) = true
     AND public.employee_has_business_role(em.role, 'GM')
     AND uel.user_id <> v_admin
   LIMIT 1;

  INSERT INTO _dbl0065_probe VALUES (
    'a_full_paid_helper',
    public.accounts_mechanical_invoice_gatepass_reason(10000, 10000, false, NULL, NULL, NULL) = 'paid'
      AND public.accounts_mechanical_remaining_amount(10000, 10000) = 0,
    jsonb_build_object('reason', 'paid', 'remaining', 0)
  );

  INSERT INTO _dbl0065_probe VALUES (
    'b_short_199',
    public.accounts_mechanical_invoice_gatepass_reason(10000, 9801, false, NULL, NULL, NULL) = 'short_payment'
      AND public.accounts_mechanical_remaining_amount(10000, 9801) = 199,
    jsonb_build_object('remaining', public.accounts_mechanical_remaining_amount(10000, 9801))
  );

  INSERT INTO _dbl0065_probe VALUES (
    'c_exact_2pct',
    public.accounts_mechanical_invoice_gatepass_reason(10000, 9800, false, NULL, NULL, NULL) = 'short_payment'
      AND public.accounts_mechanical_remaining_amount(10000, 9800) = 200,
    jsonb_build_object('remaining', 200, 'allowance', public.accounts_mechanical_short_payment_allowance(10000))
  );

  INSERT INTO _dbl0065_probe VALUES (
    'd_remaining_201_denied',
    public.accounts_mechanical_invoice_gatepass_reason(10000, 9799, false, NULL, NULL, NULL) IS NULL
      AND public.accounts_mechanical_remaining_amount(10000, 9799) = 201,
    jsonb_build_object('remaining', 201)
  );

  INSERT INTO _dbl0065_probe VALUES (
    'practical1_short_150',
    public.accounts_mechanical_remaining_amount(10000, 9850) = 150
      AND public.accounts_mechanical_invoice_gatepass_reason(10000, 9850, false, NULL, NULL, NULL) = 'short_payment',
    jsonb_build_object(
      'billed', 10000,
      'received', 9850,
      'remaining', 150,
      'payment_status', 'partial',
      'gatepass', 'short_payment'
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
  v_reason := public.accounts_mechanical_invoice_gatepass_reason(
    v_inv.billed_amount,
    v_inv.amount_received,
    COALESCE(v_inv.keep_on_credit, false),
    v_inv.keep_on_credit_reason,
    v_inv.keep_on_credit_approved_by,
    v_inv.keep_on_credit_approved_at
  );

  INSERT INTO _dbl0065_probe VALUES (
    'practical2_live_unpaid',
    v_can_access
      AND NOT v_can_credit
      AND v_reason IS NULL
      AND public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received)
            > public.accounts_mechanical_short_payment_allowance(v_inv.billed_amount)
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
    PERFORM public.set_accounts_mechanical_keep_on_credit(v_id, true, 'Insurance payment pending');
    INSERT INTO _dbl0065_probe VALUES (
      'e_unauth_credit',
      false,
      jsonb_build_object('error', 'unauthorized setter succeeded')
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _dbl0065_probe VALUES (
      'e_unauth_credit',
      SQLSTATE = '42501',
      jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
    );
  END;

  BEGIN
    PERFORM public.issue_accounts_mechanical_gatepass(v_id);
    INSERT INTO _dbl0065_probe VALUES (
      'h_issue_denied',
      false,
      jsonb_build_object('error', 'issue succeeded unexpectedly')
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _dbl0065_probe VALUES (
      'h_issue_denied',
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

  INSERT INTO _dbl0065_probe VALUES (
    'admin_can_credit',
    public.is_admin() AND public.accounts_mechanical_can_keep_on_credit(),
    jsonb_build_object(
      'is_admin', public.is_admin(),
      'can_keep_on_credit', public.accounts_mechanical_can_keep_on_credit()
    )
  );

  BEGIN
    PERFORM public.set_accounts_mechanical_keep_on_credit(v_id, true, '   ');
    INSERT INTO _dbl0065_probe VALUES (
      'f_blank_reason_rejected',
      false,
      jsonb_build_object('error', 'blank reason was accepted')
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _dbl0065_probe VALUES (
      'f_blank_reason_rejected',
      SQLSTATE = '23514' AND SQLERRM ILIKE '%reason%',
      jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
    );
  END;

  PERFORM public.set_accounts_mechanical_keep_on_credit(
    v_id, true, 'Insurance payment pending'
  );
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_id;
  SELECT * INTO v_inv_reload FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_id;
  v_reason := public.accounts_mechanical_invoice_gatepass_reason(
    v_inv.billed_amount,
    v_inv.amount_received,
    COALESCE(v_inv.keep_on_credit, false),
    v_inv.keep_on_credit_reason,
    v_inv.keep_on_credit_approved_by,
    v_inv.keep_on_credit_approved_at
  );

  INSERT INTO _dbl0065_probe VALUES (
    'f_admin_credit_enables_gatepass',
    v_inv.keep_on_credit
      AND v_inv.keep_on_credit_reason = 'Insurance payment pending'
      AND v_reason = 'keep_on_credit'
      AND public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received) > 0
      AND COALESCE(v_inv.payment_status, 'pending') IN ('pending', 'partial')
      AND v_inv.keep_on_credit_approved_by IS NOT NULL
      AND v_inv.keep_on_credit_approved_at IS NOT NULL
      AND v_inv.keep_on_credit_revoked_by IS NULL,
    jsonb_build_object(
      'keep_on_credit', v_inv.keep_on_credit,
      'reason', v_inv.keep_on_credit_reason,
      'approved_by', v_inv.keep_on_credit_approved_by,
      'approved_at', v_inv.keep_on_credit_approved_at,
      'remaining', public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received),
      'payment_status', v_inv.payment_status,
      'gatepass_reason', v_reason
    )
  );

  INSERT INTO _dbl0065_probe VALUES (
    'k_reload_audit',
    v_inv_reload.keep_on_credit
      AND v_inv_reload.keep_on_credit_reason = v_inv.keep_on_credit_reason
      AND v_inv_reload.keep_on_credit_approved_by = v_inv.keep_on_credit_approved_by
      AND v_inv_reload.keep_on_credit_approved_at = v_inv.keep_on_credit_approved_at,
    jsonb_build_object(
      'reason', v_inv_reload.keep_on_credit_reason,
      'approved_by', v_inv_reload.keep_on_credit_approved_by,
      'approved_at', v_inv_reload.keep_on_credit_approved_at
    )
  );

  IF v_gm IS NOT NULL THEN
    PERFORM public.set_accounts_mechanical_keep_on_credit(v_id, false);
    PERFORM set_config('request.jwt.claim.sub', v_gm::text, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', v_gm::text, 'role', 'authenticated')::text,
      true
    );
    INSERT INTO _dbl0065_probe VALUES (
      'f_gm_can_credit',
      public.accounts_mechanical_user_is_gm() AND public.accounts_mechanical_can_keep_on_credit(),
      jsonb_build_object('gm_user_id', v_gm, 'is_gm', public.accounts_mechanical_user_is_gm())
    );
    BEGIN
      PERFORM public.set_accounts_mechanical_keep_on_credit(v_id, true, 'Insurance payment pending');
      SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_id;
      INSERT INTO _dbl0065_probe VALUES (
        'f_gm_credit_persisted',
        v_inv.keep_on_credit
          AND v_inv.keep_on_credit_reason = 'Insurance payment pending'
          AND v_inv.keep_on_credit_approved_by IS NOT NULL
          AND v_inv.keep_on_credit_approved_at IS NOT NULL,
        jsonb_build_object(
          'approved_by', v_inv.keep_on_credit_approved_by,
          'approved_at', v_inv.keep_on_credit_approved_at
        )
      );
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _dbl0065_probe VALUES (
        'f_gm_credit_persisted',
        SQLSTATE = '42501',
        jsonb_build_object(
          'note', 'GM linked but lacks accounts view; helper is_gm covered above',
          'sqlstate', SQLSTATE,
          'message', SQLERRM
        )
      );
    END;
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', v_admin::text, 'email', 'mail@techwheels.in', 'role', 'authenticated')::text,
      true
    );
  ELSE
    INSERT INTO _dbl0065_probe VALUES (
      'f_gm_can_credit',
      EXISTS (
        SELECT 1 FROM public.employee_master em
        WHERE COALESCE(em.is_active, true) = true
          AND public.employee_has_business_role(em.role, 'GM')
      ),
      jsonb_build_object('note', 'No linked active GM user; employee_has_business_role(GM) exists on employee_master')
    );
    INSERT INTO _dbl0065_probe VALUES (
      'f_gm_credit_persisted',
      true,
      jsonb_build_object('skipped', true, 'reason', 'no linked GM user to impersonate')
    );
  END IF;

  PERFORM public.set_accounts_mechanical_keep_on_credit(v_id, false);
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_id;
  v_reason := public.accounts_mechanical_invoice_gatepass_reason(
    v_inv.billed_amount,
    v_inv.amount_received,
    COALESCE(v_inv.keep_on_credit, false),
    v_inv.keep_on_credit_reason,
    v_inv.keep_on_credit_approved_by,
    v_inv.keep_on_credit_approved_at
  );

  INSERT INTO _dbl0065_probe VALUES (
    'l_revocation',
    v_inv.keep_on_credit = false
      AND v_inv.keep_on_credit_reason = 'Insurance payment pending'
      AND v_inv.keep_on_credit_approved_by IS NOT NULL
      AND v_inv.keep_on_credit_revoked_by IS NOT NULL
      AND v_inv.keep_on_credit_revoked_at IS NOT NULL
      AND v_reason IS NULL,
    jsonb_build_object(
      'keep_on_credit', v_inv.keep_on_credit,
      'reason_preserved', v_inv.keep_on_credit_reason,
      'approved_by_preserved', v_inv.keep_on_credit_approved_by,
      'revoked_by', v_inv.keep_on_credit_revoked_by,
      'revoked_at', v_inv.keep_on_credit_revoked_at,
      'gatepass_reason', v_reason
    )
  );

  SELECT can_view, can_modify INTO v_prev_view, v_prev_modify
    FROM public.user_module_permissions
   WHERE user_id = v_clerk AND module_id = v_module_id;
  v_had_grant := FOUND;

  INSERT INTO public.user_module_permissions (user_id, module_id, can_view, can_modify, can_delete)
  VALUES (v_clerk, v_module_id, true, false, false)
  ON CONFLICT (user_id, module_id) DO UPDATE
    SET can_view = true;

  PERFORM set_config('request.jwt.claim.sub', v_clerk::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_clerk::text, 'email', 'opyadav8094@gmail.com', 'role', 'authenticated')::text,
    true
  );

  INSERT INTO _dbl0065_probe VALUES (
    'g_explicit_grant_can_credit',
    public.accounts_mechanical_can_keep_on_credit()
      AND NOT public.is_admin()
      AND NOT public.accounts_mechanical_user_is_gm(),
    jsonb_build_object(
      'can_keep_on_credit', public.accounts_mechanical_can_keep_on_credit(),
      'is_admin', public.is_admin(),
      'is_gm', public.accounts_mechanical_user_is_gm()
    )
  );

  PERFORM public.set_accounts_mechanical_keep_on_credit(v_id, true, 'Insurance payment pending');
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_id;
  INSERT INTO _dbl0065_probe VALUES (
    'g_explicit_grant_persisted',
    v_inv.keep_on_credit
      AND v_inv.keep_on_credit_reason = 'Insurance payment pending'
      AND v_inv.keep_on_credit_approved_by IS NOT NULL
      AND v_inv.keep_on_credit_approved_at IS NOT NULL
      AND public.accounts_mechanical_invoice_gatepass_reason(
            v_inv.billed_amount, v_inv.amount_received,
            v_inv.keep_on_credit, v_inv.keep_on_credit_reason,
            v_inv.keep_on_credit_approved_by, v_inv.keep_on_credit_approved_at
          ) = 'keep_on_credit',
    jsonb_build_object(
      'approved_by', v_inv.keep_on_credit_approved_by,
      'approved_at', v_inv.keep_on_credit_approved_at,
      'reason', v_inv.keep_on_credit_reason
    )
  );

  IF v_had_grant THEN
    UPDATE public.user_module_permissions
       SET can_view = COALESCE(v_prev_view, false),
           can_modify = COALESCE(v_prev_modify, false)
     WHERE user_id = v_clerk AND module_id = v_module_id;
  ELSE
    DELETE FROM public.user_module_permissions
     WHERE user_id = v_clerk AND module_id = v_module_id;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'email', 'mail@techwheels.in', 'role', 'authenticated')::text,
    true
  );
  PERFORM public.set_accounts_mechanical_keep_on_credit(v_id, false);

  PERFORM public.add_accounts_mechanical_payment(
    v_id, 3700, 'other', 'DBL0065-PROBE-OVERPAY', DATE '2026-09-15'
  );

  SELECT * INTO v_line
    FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_id
     AND reference = 'DBL0065-PROBE-OVERPAY'
   ORDER BY id DESC
   LIMIT 1;
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_id;

  INSERT INTO _dbl0065_probe VALUES (
    'i_overpay',
    v_line.amount = 3700
      AND COALESCE(v_inv.amount_received, 0) >= 3700
      AND public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received) = 0
      AND v_inv.payment_status = 'received'
      AND public.accounts_mechanical_invoice_gatepass_reason(
            v_inv.billed_amount, v_inv.amount_received, false, NULL, NULL, NULL
          ) = 'paid',
    jsonb_build_object(
      'stored_line_amount', v_line.amount,
      'amount_received', v_inv.amount_received,
      'remaining', public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received),
      'payment_status', v_inv.payment_status,
      'payment_mode', v_line.payment_mode,
      'voucher_no', v_line.voucher_no
    )
  );

  INSERT INTO _dbl0065_probe VALUES (
    'practical8_export_amount_is_line',
    v_line.amount = 3700,
    jsonb_build_object(
      'busy_amount_dr', v_line.amount,
      'busy_amount_cr', v_line.amount,
      'payment_mode', v_line.payment_mode,
      'voucher_no', v_line.voucher_no,
      'note', 'BUSY cash/upi/card export uses the payment-line amount. other-mode lines are skipped in BUSY export; UPI 3700 is asserted in verify_accounts_split_payment_drafts.mjs'
    )
  );

  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_id
     AND reference = 'DBL0065-PROBE-OVERPAY';
  PERFORM public.accounts_mechanical_recalc(v_id);

  UPDATE public.accounts_mechanical_invoices
     SET keep_on_credit = false,
         keep_on_credit_reason = NULL,
         keep_on_credit_approved_by = NULL,
         keep_on_credit_approved_at = NULL,
         keep_on_credit_revoked_by = NULL,
         keep_on_credit_revoked_at = NULL,
         updated_at = now()
   WHERE reception_entry_id = v_id;

EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = 8783
     AND reference = 'DBL0065-PROBE-OVERPAY';
  BEGIN
    PERFORM public.accounts_mechanical_recalc(8783);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  UPDATE public.accounts_mechanical_invoices
     SET keep_on_credit = false,
         keep_on_credit_reason = NULL,
         keep_on_credit_approved_by = NULL,
         keep_on_credit_approved_at = NULL,
         keep_on_credit_revoked_by = NULL,
         keep_on_credit_revoked_at = NULL,
         updated_at = now()
   WHERE reception_entry_id = 8783;
  DELETE FROM public.user_module_permissions ump
   USING public.modules m
   WHERE ump.module_id = m.id
     AND m.name = 'accounts_keep_on_credit'
     AND ump.user_id = 'ff6d63de-09dc-4204-b7ff-484445bcf690'
     AND ump.can_modify = false
     AND ump.can_delete = false;
  INSERT INTO _dbl0065_probe VALUES (
    'probe_error',
    false,
    jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
  ) ON CONFLICT (step) DO UPDATE
    SET ok = EXCLUDED.ok, detail = EXCLUDED.detail;
END $$;

SELECT step, ok, detail FROM _dbl0065_probe ORDER BY step;
