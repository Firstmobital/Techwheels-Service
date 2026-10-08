-- ACCOUNTS-001 / DBL-0076: Admin-only delete of a posted Mechanical payment receipt line.

CREATE OR REPLACE FUNCTION public.delete_accounts_mechanical_payment(p_payment_line_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_line public.accounts_mechanical_payment_lines%ROWTYPE;
  v_actor uuid;
  v_actor_label text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: requires platform admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_payment_line_id IS NULL THEN
    RAISE EXCEPTION 'payment line id is required'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_line
    FROM public.accounts_mechanical_payment_lines
   WHERE id = p_payment_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mechanical payment line % not found', p_payment_line_id
      USING ERRCODE = 'P0002';
  END IF;

  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_actor_label := public.accounts_mechanical_actor_label();

  INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, details)
  VALUES (
    v_actor,
    'accounts_mechanical_payment_deleted',
    'accounts_mechanical_payment_line',
    v_line.id::text,
    jsonb_build_object(
      'reception_entry_id', v_line.reception_entry_id,
      'mechanical_invoice_id', v_line.mechanical_invoice_id,
      'amount', v_line.amount,
      'payment_mode', v_line.payment_mode,
      'reference', v_line.reference,
      'payment_received_date', v_line.payment_received_date,
      'remark', v_line.remark,
      'voucher_no', v_line.voucher_no,
      'posted_by', v_line.posted_by,
      'posted_at', v_line.posted_at,
      'deleted_by_label', v_actor_label,
      'deleted_at', clock_timestamp()
    )
  );

  DELETE FROM public.accounts_mechanical_payment_lines
   WHERE id = v_line.id;

  PERFORM public.accounts_mechanical_recalc(v_line.reception_entry_id);
  RETURN public.accounts_mechanical_case_json(v_line.reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.delete_accounts_mechanical_payment(p_payment_line_id bigint) IS
  'ACCOUNTS-001 / DBL-0076: Admin/Super Admin delete of a posted Mechanical receipt. Authorizes with is_admin() only. Hard-deletes the payment line, writes audit_logs, recalculates header via accounts_mechanical_recalc. Does not alter invoice header, keep-on-credit, or other receipts.';

REVOKE ALL ON FUNCTION public.delete_accounts_mechanical_payment(bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_accounts_mechanical_payment(bigint) TO authenticated;
GRANT ALL ON FUNCTION public.delete_accounts_mechanical_payment(bigint) TO service_role;
