-- Practical verification for DBL-0076. Restores all mutations before finishing.
-- Inserts VERIFY-DBL0076-* payment lines, deletes one via delete_accounts_mechanical_payment, then cleans up.

CREATE TEMP TABLE _dbl0076_probe (
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
  v_line_a public.accounts_mechanical_payment_lines%ROWTYPE;
  v_line_b public.accounts_mechanical_payment_lines%ROWTYPE;
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_json jsonb;
  v_audit bigint;
BEGIN
  SELECT inv.reception_entry_id, inv.id, inv.billed_amount
    INTO v_entry, v_inv_id, v_billed
    FROM public.accounts_mechanical_invoices inv
   WHERE inv.billed_amount IS NOT NULL
     AND inv.billed_amount > 1000
   ORDER BY inv.updated_at DESC NULLS LAST, inv.id DESC
   LIMIT 1;
  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'DBL-0076 practical: no mechanical invoice with billed_amount';
  END IF;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    v_entry, v_inv_id, 20000.00, 'upi', 'VERIFY-DBL0076-A',
    'verify-script', timestamptz '2026-10-06 10:00:00+05:30', DATE '2026-10-06', NULL
  )
  RETURNING * INTO v_line_a;

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    v_entry, v_inv_id, 500.00, 'cash', 'VERIFY-DBL0076-B',
    'verify-script', timestamptz '2026-10-06 11:00:00+05:30', DATE '2026-10-06', NULL
  )
  RETURNING * INTO v_line_b;

  PERFORM public.accounts_mechanical_recalc(v_entry);

  PERFORM set_config('request.jwt.claim.sub', v_clerk::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_clerk::text, 'email', 'opyadav8094@gmail.com', 'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM public.delete_accounts_mechanical_payment(v_line_a.id);
    INSERT INTO _dbl0076_probe VALUES (
      'non_admin_rpc',
      false,
      jsonb_build_object('error', 'non-admin delete succeeded')
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _dbl0076_probe VALUES (
      'non_admin_rpc',
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

  INSERT INTO _dbl0076_probe VALUES (
    'admin_gate',
    public.is_admin(),
    jsonb_build_object('is_admin', public.is_admin())
  );

  v_json := public.delete_accounts_mechanical_payment(v_line_a.id);

  SELECT * INTO v_inv
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = v_entry;

  INSERT INTO _dbl0076_probe VALUES (
    'delete_line_a',
    NOT EXISTS (SELECT 1 FROM public.accounts_mechanical_payment_lines WHERE id = v_line_a.id),
    jsonb_build_object(
      'amount_received', v_inv.amount_received,
      'payment_status', v_inv.payment_status,
      'sibling_b_exists', EXISTS (SELECT 1 FROM public.accounts_mechanical_payment_lines WHERE id = v_line_b.id)
    )
  );

  SELECT id INTO v_audit
    FROM public.audit_logs
   WHERE action = 'accounts_mechanical_payment_deleted'
     AND resource_id = v_line_a.id::text
   ORDER BY id DESC
   LIMIT 1;

  INSERT INTO _dbl0076_probe VALUES (
    'audit_row',
    v_audit IS NOT NULL,
    jsonb_build_object('audit_id', v_audit)
  );

  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE id IN (v_line_a.id, v_line_b.id);

  PERFORM public.accounts_mechanical_recalc(v_entry);
END;
$$;

SELECT step, ok, detail FROM _dbl0076_probe ORDER BY step;
