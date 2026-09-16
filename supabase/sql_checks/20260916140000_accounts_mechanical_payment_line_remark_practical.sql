-- Practical verification for DBL-0073. Restores all mutations before finishing.
-- Inserts VERIFY-DBL0069-* payment lines on a live Mechanical invoice, posts/edits
-- remarks through the trusted RPCs, then deletes those lines and recalcs.
-- Does not keep test money. Does not mutate Bodyshop settlement lines.

CREATE TEMP TABLE _dbl0069_probe (
  step text PRIMARY KEY,
  ok boolean,
  detail jsonb
);

DO $$
DECLARE
  v_admin uuid := 'ded27442-7419-4dee-bbf2-6fdb5a5404e4';
  v_entry bigint;
  v_inv_id bigint;
  v_before_received numeric;
  v_before_status text;
  v_bs_lines_before bigint;
  v_line_a public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_b public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_blank public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_a_after public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_b_after public.accounts_mechanical_payment_lines%ROWTYPE;
  v_posted public.accounts_mechanical_payment_lines%ROWTYPE;
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_json jsonb;
  v_list jsonb;
  v_posted_a timestamptz;
  v_posted_by_a text;
  v_voucher text;
BEGIN
  SELECT inv.reception_entry_id, inv.id, inv.amount_received, inv.payment_status
    INTO v_entry, v_inv_id, v_before_received, v_before_status
    FROM public.accounts_mechanical_invoices inv
   WHERE inv.billed_amount IS NOT NULL
     AND inv.billed_amount > 0
   ORDER BY inv.updated_at DESC NULLS LAST, inv.id DESC
   LIMIT 1;
  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'DBL-0073 practical: no mechanical invoice with billed_amount';
  END IF;

  SELECT count(*) INTO v_bs_lines_before FROM public.bodyshop_settlement_lines;

  v_voucher := 'JApp/26-27/9897';
  WHILE EXISTS (
    SELECT 1 FROM public.accounts_mechanical_payment_lines WHERE voucher_no = v_voucher
  ) LOOP
    v_voucher := 'JApp/26-27/' || lpad((right(v_voucher, 4)::int - 1)::text, 4, '0');
  END LOOP;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no, remark
  ) VALUES (
    v_entry, v_inv_id, 1.11, 'upi', 'VERIFY-DBL0069-A',
    'verify-script', timestamptz '2026-09-16 11:00:00+05:30', DATE '2026-09-16', v_voucher,
    '  first receipt remark  '
  )
  RETURNING * INTO v_line_a;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no, remark
  ) VALUES (
    v_entry, v_inv_id, 2.22, 'cash', 'VERIFY-DBL0069-B',
    'verify-script', timestamptz '2026-09-16 11:01:00+05:30', DATE '2026-09-16', NULL,
    'second receipt remark'
  )
  RETURNING * INTO v_line_b;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no, remark
  ) VALUES (
    v_entry, v_inv_id, 0.33, 'other', 'VERIFY-DBL0069-BLANK',
    'verify-script', timestamptz '2026-09-16 11:02:00+05:30', DATE '2026-09-16', NULL,
    NULL
  )
  RETURNING * INTO v_line_blank;

  PERFORM public.accounts_mechanical_recalc(v_entry);
  v_posted_a := v_line_a.posted_at;
  v_posted_by_a := v_line_a.posted_by;

  INSERT INTO _dbl0069_probe VALUES (
    'insert_independent_remarks',
    v_line_a.remark = '  first receipt remark  '
      AND v_line_b.remark = 'second receipt remark'
      AND v_line_blank.remark IS NULL,
    jsonb_build_object(
      'a', v_line_a.remark,
      'b', v_line_b.remark,
      'blank', v_line_blank.remark
    )
  );

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'email', 'mail@techwheels.in', 'role', 'authenticated')::text,
    true
  );

  -- Admin trims remark on A; sibling B and blank historical stay associated
  v_json := public.update_accounts_mechanical_payment(
    v_line_a.id, 1.11, 'upi', 'VERIFY-DBL0069-A', DATE '2026-09-16', '  first receipt remark  '
  );
  SELECT * INTO v_line_a_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_a.id;
  SELECT * INTO v_line_b_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_b.id;
  SELECT * INTO v_line_blank FROM public.accounts_mechanical_payment_lines WHERE id = v_line_blank.id;

  INSERT INTO _dbl0069_probe VALUES (
    'update_trims_remark_keeps_sibling',
    v_line_a_after.remark = 'first receipt remark'
      AND v_line_b_after.remark = 'second receipt remark'
      AND v_line_blank.remark IS NULL
      AND v_line_a_after.posted_at = v_posted_a
      AND v_line_a_after.posted_by = v_posted_by_a
      AND v_line_a_after.voucher_no IS NOT DISTINCT FROM v_voucher,
    jsonb_build_object(
      'a_remark', v_line_a_after.remark,
      'b_remark', v_line_b_after.remark,
      'blank', v_line_blank.remark,
      'voucher', v_line_a_after.voucher_no
    )
  );

  -- Blank remark allowed (clears to NULL)
  v_json := public.update_accounts_mechanical_payment(
    v_line_a.id, 1.11, 'upi', 'VERIFY-DBL0069-A', DATE '2026-09-16', '   '
  );
  SELECT * INTO v_line_a_after FROM public.accounts_mechanical_payment_lines WHERE id = v_line_a.id;
  INSERT INTO _dbl0069_probe VALUES (
    'blank_remark_stores_null',
    v_line_a_after.remark IS NULL,
    jsonb_build_object('a_remark', v_line_a_after.remark)
  );

  BEGIN
    v_json := public.add_accounts_mechanical_payment(
      v_entry, 0.01, 'cash', 'VERIFY-DBL0069-POST', DATE '2026-09-16', ' posted via rpc '
    );
    SELECT * INTO v_posted
      FROM public.accounts_mechanical_payment_lines
     WHERE reception_entry_id = v_entry
       AND reference = 'VERIFY-DBL0069-POST'
     ORDER BY id DESC
     LIMIT 1;

    INSERT INTO _dbl0069_probe VALUES (
      'add_rpc_persists_trimmed_remark',
      v_posted.id IS NOT NULL
        AND v_posted.remark = 'posted via rpc'
        AND v_posted.amount = 0.01
        AND v_posted.payment_mode = 'cash',
      jsonb_build_object(
        'id', v_posted.id,
        'remark', v_posted.remark,
        'amount', v_posted.amount
      )
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _dbl0069_probe VALUES (
      'add_rpc_persists_trimmed_remark',
      false,
      jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
    );
  END;

  BEGIN
    v_list := public.list_accounts_mechanical_payments(v_entry);
    INSERT INTO _dbl0069_probe VALUES (
      'list_includes_remark',
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_list) e
        WHERE e->>'reference' = 'VERIFY-DBL0069-B'
          AND e->>'remark' = 'second receipt remark'
      )
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_list) e
        WHERE e->>'reference' = 'VERIFY-DBL0069-BLANK'
          AND (e->>'remark' IS NULL OR e->>'remark' = '')
      ),
      jsonb_build_object('listed', (
        SELECT jsonb_agg(jsonb_build_object('reference', e->>'reference', 'remark', e->>'remark'))
        FROM jsonb_array_elements(v_list) e
        WHERE e->>'reference' LIKE 'VERIFY-DBL0069%'
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _dbl0069_probe VALUES (
      'list_includes_remark',
      false,
      jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
    );
  END;

  -- Restore
  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE reception_entry_id = v_entry
     AND (
       reference LIKE 'VERIFY-DBL0069%'
       OR id IN (v_line_a.id, v_line_b.id, v_line_blank.id, COALESCE(v_posted.id, -1))
     );
  PERFORM public.accounts_mechanical_recalc(v_entry);
  SELECT * INTO v_inv FROM public.accounts_mechanical_invoices WHERE reception_entry_id = v_entry;

  INSERT INTO _dbl0069_probe VALUES (
    'restored',
    v_inv.amount_received IS NOT DISTINCT FROM v_before_received
      AND v_inv.payment_status IS NOT DISTINCT FROM v_before_status
      AND NOT EXISTS (
        SELECT 1 FROM public.accounts_mechanical_payment_lines
        WHERE reference LIKE 'VERIFY-DBL0069%'
      )
      AND (SELECT count(*) FROM public.bodyshop_settlement_lines) = v_bs_lines_before,
    jsonb_build_object(
      'received_before', v_before_received,
      'received_after', v_inv.amount_received,
      'status_before', v_before_status,
      'status_after', v_inv.payment_status
    )
  );
END;
$$;

SELECT step, ok, detail
FROM _dbl0069_probe
ORDER BY step;

SELECT count(*) FILTER (WHERE NOT ok) AS failed_steps
FROM _dbl0069_probe;
