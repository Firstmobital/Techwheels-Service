-- Practical verification for DBL-0068. Restores all mutations before finishing.
-- Inserts VERIFY-DBL0068-* payment lines on a live Mechanical invoice, edits through
-- update_accounts_mechanical_payment, then deletes those lines and recalcs.
-- Does not keep test money. Does not mutate Bodyshop settlement lines.

CREATE TEMP TABLE _dbl0068_probe (
  step text PRIMARY KEY,
  ok boolean,
  detail jsonb
);

DO $$
DECLARE
  v_clerk uuid := 'ff6d63de-09dc-4204-b7ff-484445bcf690';
  v_admin uuid := 'ded27442-7419-4dee-bbf2-6fdb5a5404e4';
  v_entry bigint;
  v_inv_id bigint;
  v_billed numeric;
  v_before_received numeric;
  v_before_status text;
  v_bs_lines_before bigint;
  v_line_a public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_b public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_a_after public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_b_after public.accounts_mechanical_payment_lines%ROWTYPE;
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_json jsonb;
  v_posted_a timestamptz;
  v_posted_by_a text;
  v_posted_b timestamptz;
  v_posted_by_b text;
  v_voucher text;
  v_sibling_unchanged boolean;
  v_reason text;
  v_remaining numeric;
  v_other_sum numeric;
  v_cut numeric;
BEGIN
  SELECT inv.reception_entry_id, inv.id, inv.billed_amount, inv.amount_received, inv.payment_status
    INTO v_entry, v_inv_id, v_billed, v_before_received, v_before_status
    FROM public.accounts_mechanical_invoices inv
   WHERE inv.billed_amount IS NOT NULL
     AND inv.billed_amount > 0
   ORDER BY inv.updated_at DESC NULLS LAST, inv.id DESC
   LIMIT 1;
  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'DBL-0068 practical: no mechanical invoice with billed_amount';
  END IF;

  SELECT count(*) INTO v_bs_lines_before FROM public.bodyshop_settlement_lines;

  v_voucher := 'JApp/26-27/9898';
  WHILE EXISTS (
    SELECT 1 FROM public.accounts_mechanical_payment_lines WHERE voucher_no = v_voucher
  ) LOOP
    v_voucher := 'JApp/26-27/' || lpad((right(v_voucher, 4)::int - 1)::text, 4, '0');
  END LOOP;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    v_entry, v_inv_id, 2271.00, 'upi', 'VERIFY-DBL0068-A',
    'verify-script', timestamptz '2026-09-16 10:00:00+05:30', DATE '2026-09-16', v_voucher
  )
  RETURNING * INTO v_line_a;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    v_entry, v_inv_id, 0.40, 'other', 'VERIFY-DBL0068-B',
    'verify-script', timestamptz '2026-09-16 10:01:00+05:30', DATE '2026-09-16', NULL
  )
  RETURNING * INTO v_line_b;

  PERFORM public.accounts_mechanical_recalc(v_entry);
  v_posted_a := v_line_a.posted_at;
  v_posted_by_a := v_line_a.posted_by;
  v_posted_b := v_line_b.posted_at;
  v_posted_by_b := v_line_b.posted_by;

  -- E. Non-admin direct RPC fails
  PERFORM set_config('request.jwt.claim.sub', v_clerk::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_clerk::text, 'email', 'opyadav8094@gmail.com', 'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM public.update_accounts_mechanical_payment(
      v_line_b.id, 0.50, 'other', 'VERIFY-DBL0068-B', DATE '2026-09-16'
    );
    INSERT INTO _dbl0068_probe VALUES (
      'e_non_admin_rpc',
      false,
      jsonb_build_object('error', 'non-admin update succeeded')
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _dbl0068_probe VALUES (
      'e_non_admin_rpc',
      SQLSTATE = '42501',
      jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM, 'is_admin', public.is_admin())
    );
  END;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'email', 'mail@techwheels.in', 'role', 'authenticated')::text,
    true
  );

  INSERT INTO _dbl0068_probe VALUES (
    'admin_gate',
    public.is_admin(),
    jsonb_build_object('is_admin', public.is_admin())
  );

  -- F. amount <= 0 fails
  BEGIN
    PERFORM public.update_accounts_mechanical_payment(
      v_line_b.id, 0, 'other', 'VERIFY-DBL0068-B', DATE '2026-09-16'
    );
    INSERT INTO _dbl0068_probe VALUES (
      'f_zero_amount',
      false,
      jsonb_build_object('error', 'zero amount was accepted')
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _dbl0068_probe VALUES (
      'f_zero_amount',
      SQLSTATE = '23514' AND SQLERRM ILIKE '%greater than 0%',
      jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
    );
  END;

  -- A. Admin edits amount 0.40 → 0.50 (Practical Test 1)
  v_json := public.update_accounts_mechanical_payment(
    v_line_b.id, 0.50, 'other', 'VERIFY-DBL0068-B', DATE '2026-09-16'
  );
  SELECT * INTO v_line_b_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_b.id;
  SELECT * INTO v_line_a_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_a.id;
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_entry;
  v_sibling_unchanged :=
    v_line_a_after.amount = 2271.00
    AND v_line_a_after.payment_mode = 'upi'
    AND v_line_a_after.reference = 'VERIFY-DBL0068-A'
    AND v_line_a_after.payment_received_date = DATE '2026-09-16'
    AND v_line_a_after.posted_at = v_posted_a
    AND v_line_a_after.posted_by = v_posted_by_a
    AND v_line_a_after.voucher_no IS NOT DISTINCT FROM v_voucher;

  INSERT INTO _dbl0068_probe VALUES (
    'a_edit_amount',
    v_line_b_after.amount = 0.50
      AND v_line_b_after.payment_mode = 'other'
      AND v_inv.amount_received = round(COALESCE(v_before_received, 0) + 2271.00 + 0.50, 2)
      AND v_sibling_unchanged,
    jsonb_build_object(
      'line_b_amount', v_line_b_after.amount,
      'amount_received', v_inv.amount_received,
      'before_received', v_before_received,
      'sibling_unchanged', v_sibling_unchanged,
      'case_received', v_json ->> 'amount_received'
    )
  );

  -- B/C. Mode Other → Cash and reference DISCOUNT → CASH ADJUSTMENT (Practical Test 2)
  v_json := public.update_accounts_mechanical_payment(
    v_line_b.id, 0.50, 'cash', 'CASH ADJUSTMENT', DATE '2026-09-16'
  );
  SELECT * INTO v_line_b_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_b.id;
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_entry;

  INSERT INTO _dbl0068_probe VALUES (
    'bc_edit_mode_reference',
    v_line_b_after.payment_mode = 'cash'
      AND v_line_b_after.reference = 'CASH ADJUSTMENT'
      AND v_line_b_after.amount = 0.50
      AND v_inv.amount_received = round(COALESCE(v_before_received, 0) + 2271.00 + 0.50, 2),
    jsonb_build_object(
      'payment_mode', v_line_b_after.payment_mode,
      'reference', v_line_b_after.reference,
      'amount', v_line_b_after.amount,
      'amount_received', v_inv.amount_received
    )
  );

  -- D. Edit received date (Practical Test 3)
  v_json := public.update_accounts_mechanical_payment(
    v_line_b.id, 0.50, 'cash', 'CASH ADJUSTMENT', DATE '2026-09-12'
  );
  SELECT * INTO v_line_b_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_b.id;

  INSERT INTO _dbl0068_probe VALUES (
    'd_edit_received_date',
    v_line_b_after.payment_received_date = DATE '2026-09-12'
      AND v_line_b_after.posted_at = v_posted_b,
    jsonb_build_object(
      'payment_received_date', v_line_b_after.payment_received_date,
      'posted_at', v_line_b_after.posted_at
    )
  );

  -- J/K. voucher_no on line A preserved; original posted_* on both lines preserved
  SELECT * INTO v_line_a_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_a.id;
  INSERT INTO _dbl0068_probe VALUES (
    'jk_voucher_and_posted',
    v_line_a_after.voucher_no IS NOT DISTINCT FROM v_voucher
      AND v_line_a_after.posted_by = v_posted_by_a
      AND v_line_a_after.posted_at = v_posted_a
      AND v_line_b_after.posted_by = v_posted_by_b
      AND v_line_b_after.posted_at = v_posted_b
      AND v_line_b_after.edited_by IS NOT NULL
      AND v_line_b_after.edited_at IS NOT NULL
      AND v_line_b_after.voucher_no IS NULL
      AND v_line_b_after.mechanical_invoice_id = v_inv_id
      AND v_line_b_after.reception_entry_id = v_entry
      AND v_line_b_after.id = v_line_b.id,
    jsonb_build_object(
      'voucher_no', v_line_a_after.voucher_no,
      'expected_voucher', v_voucher,
      'line_b_voucher', v_line_b_after.voucher_no,
      'posted_by_a', v_line_a_after.posted_by,
      'posted_at_b', v_line_b_after.posted_at,
      'edited_by', v_line_b_after.edited_by,
      'edited_at', v_line_b_after.edited_at
    )
  );

  -- Mode change on a vouchered UPI line must keep JApp (no regenerate)
  v_json := public.update_accounts_mechanical_payment(
    v_line_a.id, 2271.00, 'cash', 'VERIFY-DBL0068-A', DATE '2026-09-16'
  );
  SELECT * INTO v_line_a_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_a.id;
  INSERT INTO _dbl0068_probe VALUES (
    'j_mode_keeps_voucher',
    v_line_a_after.payment_mode = 'cash'
      AND v_line_a_after.voucher_no IS NOT DISTINCT FROM v_voucher
      AND v_line_a_after.posted_at = v_posted_a
      AND v_line_a_after.amount = 2271.00,
    jsonb_build_object(
      'payment_mode', v_line_a_after.payment_mode,
      'voucher_no', v_line_a_after.voucher_no
    )
  );
  PERFORM public.update_accounts_mechanical_payment(
    v_line_a.id, 2271.00, 'upi', 'VERIFY-DBL0068-A', DATE '2026-09-16'
  );

  -- G. Overpayment edit succeeds (Practical Test 6) — 0.50 → 10.00
  v_json := public.update_accounts_mechanical_payment(
    v_line_b.id, 10.00, 'cash', 'CASH ADJUSTMENT', DATE '2026-09-12'
  );
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_entry;
  SELECT * INTO v_line_b_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_b.id;
  v_remaining := public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received);
  v_reason := public.accounts_mechanical_invoice_gatepass_reason(
    v_inv.billed_amount,
    v_inv.amount_received,
    COALESCE(v_inv.keep_on_credit, false),
    v_inv.keep_on_credit_reason,
    v_inv.keep_on_credit_approved_by,
    v_inv.keep_on_credit_approved_at
  );

  INSERT INTO _dbl0068_probe VALUES (
    'g_overpay_edit',
    v_line_b_after.amount = 10.00
      AND v_inv.amount_received = round(COALESCE(v_before_received, 0) + 2271.00 + 10.00, 2)
      AND (v_inv.amount_received >= v_inv.billed_amount AND v_inv.payment_status = 'received' AND v_remaining = 0
           OR v_inv.amount_received < v_inv.billed_amount),
    jsonb_build_object(
      'amount', v_line_b_after.amount,
      'amount_received', v_inv.amount_received,
      'billed', v_inv.billed_amount,
      'remaining', v_remaining,
      'payment_status', v_inv.payment_status,
      'gatepass_reason', v_reason
    )
  );

  -- H. Recalc happened (header received = sum of lines)
  INSERT INTO _dbl0068_probe VALUES (
    'h_recalc',
    v_inv.amount_received = (
      SELECT round(COALESCE(sum(l.amount), 0), 2)
        FROM public.accounts_mechanical_payment_lines l
       WHERE l.reception_entry_id = v_entry
    ),
    jsonb_build_object(
      'header_received', v_inv.amount_received,
      'sum_lines', (
        SELECT round(COALESCE(sum(l.amount), 0), 2)
          FROM public.accounts_mechanical_payment_lines l
         WHERE l.reception_entry_id = v_entry
      ),
      'payment_status', v_inv.payment_status
    )
  );

  -- I / Practical Test 5: reduce verify line A so remaining > 2% unless valid Keep on Credit
  SELECT COALESCE(sum(l.amount), 0) INTO v_other_sum
    FROM public.accounts_mechanical_payment_lines l
   WHERE l.reception_entry_id = v_entry
     AND l.id <> v_line_a.id;
  v_cut := round(v_billed - public.accounts_mechanical_short_payment_allowance(v_billed) - 1 - v_other_sum, 2);
  IF v_cut > 0 THEN
    v_json := public.update_accounts_mechanical_payment(
      v_line_a.id, v_cut, 'upi', 'VERIFY-DBL0068-A', DATE '2026-09-16'
    );
    SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_entry;
    v_remaining := public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received);
    v_reason := public.accounts_mechanical_invoice_gatepass_reason(
      v_inv.billed_amount,
      v_inv.amount_received,
      COALESCE(v_inv.keep_on_credit, false),
      v_inv.keep_on_credit_reason,
      v_inv.keep_on_credit_approved_by,
      v_inv.keep_on_credit_approved_at
    );
    INSERT INTO _dbl0068_probe VALUES (
      'i_gatepass_after_partial',
      v_inv.payment_status = 'partial'
        AND v_remaining > public.accounts_mechanical_short_payment_allowance(v_inv.billed_amount)
        AND (
          public.accounts_mechanical_keep_on_credit_valid(
            v_inv.keep_on_credit,
            v_inv.keep_on_credit_reason,
            v_inv.keep_on_credit_approved_by,
            v_inv.keep_on_credit_approved_at
          ) AND v_reason = 'keep_on_credit'
          OR NOT public.accounts_mechanical_keep_on_credit_valid(
            v_inv.keep_on_credit,
            v_inv.keep_on_credit_reason,
            v_inv.keep_on_credit_approved_by,
            v_inv.keep_on_credit_approved_at
          ) AND v_reason IS NULL
        ),
      jsonb_build_object(
        'cut_amount', v_cut,
        'remaining', v_remaining,
        'payment_status', v_inv.payment_status,
        'gatepass_reason', v_reason,
        'keep_on_credit', v_inv.keep_on_credit
      )
    );
  ELSE
    -- Helper-level proof when this live header cannot be driven above 2% with line A alone.
    INSERT INTO _dbl0068_probe VALUES (
      'i_gatepass_after_partial',
      public.accounts_mechanical_gatepass_reason(10000, 9500, false) IS NULL
        AND public.accounts_mechanical_remaining_amount(10000, 9500) = 500,
      jsonb_build_object(
        'note', 'live billed already covered by other lines; helper 10000/9500 remaining 500 denied',
        'other_sum', v_other_sum,
        'billed', v_billed,
        'cut', v_cut
      )
    );
  END IF;

  -- L. Other verify line identity unchanged through later edits of A
  SELECT * INTO v_line_b_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_b.id;
  INSERT INTO _dbl0068_probe VALUES (
    'l_other_line_unchanged',
    v_line_b_after.amount = 10.00
      AND v_line_b_after.payment_mode = 'cash'
      AND v_line_b_after.reference = 'CASH ADJUSTMENT'
      AND v_line_b_after.payment_received_date = DATE '2026-09-12'
      AND v_line_b_after.voucher_no IS NULL
      AND v_line_b_after.posted_at = v_posted_b,
    jsonb_build_object(
      'amount', v_line_b_after.amount,
      'mode', v_line_b_after.payment_mode,
      'reference', v_line_b_after.reference,
      'voucher_no', v_line_b_after.voucher_no
    )
  );

  -- N. Bodyshop unchanged
  INSERT INTO _dbl0068_probe VALUES (
    'n_bodyshop_unchanged',
    (SELECT count(*) FROM public.bodyshop_settlement_lines) = v_bs_lines_before,
    jsonb_build_object(
      'bodyshop_lines_before', v_bs_lines_before,
      'bodyshop_lines_after', (SELECT count(*) FROM public.bodyshop_settlement_lines)
    )
  );

  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE id IN (v_line_a.id, v_line_b.id)
      OR reference LIKE 'VERIFY-DBL0068%';
  PERFORM public.accounts_mechanical_recalc(v_entry);

  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_entry;
  INSERT INTO _dbl0068_probe VALUES (
    'cleanup_restored',
    COALESCE(v_inv.amount_received, 0) = COALESCE(v_before_received, 0)
      AND COALESCE(v_inv.payment_status, 'pending') = COALESCE(v_before_status, 'pending')
      AND NOT EXISTS (
        SELECT 1 FROM public.accounts_mechanical_payment_lines
         WHERE reference LIKE 'VERIFY-DBL0068%'
      ),
    jsonb_build_object(
      'received_before', v_before_received,
      'received_after', v_inv.amount_received,
      'status_before', v_before_status,
      'status_after', v_inv.payment_status,
      'leftover', (
        SELECT count(*) FROM public.accounts_mechanical_payment_lines
         WHERE reference LIKE 'VERIFY-DBL0068%'
      )
    )
  );
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE reference LIKE 'VERIFY-DBL0068%'
      OR id = v_line_a.id
      OR id = v_line_b.id;
  IF v_entry IS NOT NULL THEN
    PERFORM public.accounts_mechanical_recalc(v_entry);
  END IF;
  INSERT INTO _dbl0068_probe VALUES (
    'exception',
    false,
    jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
  );
END
$$;

SELECT step, ok, detail
FROM _dbl0068_probe
ORDER BY step;

SELECT bool_and(ok) AS all_practical_ok, count(*) AS steps, count(*) FILTER (WHERE NOT ok) AS failed
FROM _dbl0068_probe;
