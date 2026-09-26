-- MOBILE-015: Mini Paid Service as floor type + customer_get_mechanical_case

ALTER TABLE public.service_reception_entries
  ADD COLUMN IF NOT EXISTS gate_pass_issued boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gate_pass_number text;

CREATE OR REPLACE FUNCTION public.is_floor_incharge_service_type(p_service_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_service_type, '') IN (
    'Running Repairs',
    'First Free Service',
    'Second Free Service',
    'Third Free Service',
    'Paid Service',
    'Mini Paid Service',
    'Updation',
    'E Breakdown',
    'Campaign'
  );
$$;

CREATE OR REPLACE FUNCTION public.customer_get_mechanical_case(
  p_session_token text,
  p_reg_number text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET row_security TO 'off'
AS $$
DECLARE
  v_sess record;
  v_reg text;
  v_regs text[];
  v_entry public.service_reception_entries%ROWTYPE;
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_has_inv boolean := false;
  v_gate jsonb;
  v_has_gate boolean := false;
  v_floor jsonb := 'null'::jsonb;
  v_payments jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_sess FROM public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);

  IF p_reg_number IS NOT NULL AND btrim(p_reg_number) <> '' THEN
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  END IF;

  SELECT s.*
  INTO v_entry
  FROM public.service_reception_entries s
  WHERE public.customer_norm_reg(s.reg_number) = ANY (v_regs)
    AND (v_reg IS NULL OR public.customer_norm_reg(s.reg_number) = v_reg)
  ORDER BY (s.invoice_done_at IS NULL) DESC, s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_floor_incharge_service_type(v_entry.service_type) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'technician_name', ta.technician_name,
    'technician_code', ta.technician_code,
    'bay_no', ta.bay_no,
    'work_status', ta.work_status,
    'assigned_at', ta.assigned_at,
    'out_ts', ta.out_ts
  )
  INTO v_floor
  FROM public.technician_assignments ta
  WHERE NULLIF(btrim(v_entry.jc_number), '') IS NOT NULL
    AND upper(btrim(ta.job_card_number)) = upper(btrim(v_entry.jc_number))
  ORDER BY ta.id DESC
  LIMIT 1;

  SELECT * INTO v_inv
  FROM public.accounts_mechanical_invoices inv
  WHERE inv.reception_entry_id = v_entry.id;

  v_has_inv := FOUND;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'amount', p.amount,
        'payment_mode', p.payment_mode,
        'reference', p.reference,
        'payment_received_date', p.payment_received_date,
        'posted_at', p.posted_at
      )
      ORDER BY p.posted_at DESC NULLS LAST, p.id DESC
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM public.accounts_mechanical_payment_lines p
  WHERE p.reception_entry_id = v_entry.id;

  v_gate := public.customer_get_gate_pass(p_session_token, v_entry.reg_number);
  v_has_gate := v_gate IS NOT NULL
    AND nullif(btrim(coalesce(v_gate->>'gate_pass_no', '')), '') IS NOT NULL;

  RETURN jsonb_build_object(
    'reception_entry_id', v_entry.id,
    'reg_number', v_entry.reg_number,
    'model', v_entry.model,
    'service_type', v_entry.service_type,
    'jc_number', v_entry.jc_number,
    'km_reading', v_entry.km_reading,
    'sa_name', v_entry.sa_name,
    'sa_display_name', v_entry.sa_display_name,
    'branch', v_entry.branch,
    'created_at', v_entry.created_at,
    'invoice_done_at', v_entry.invoice_done_at,
    'expected_invoice_amount', v_entry.expected_invoice_amount,
    'estimate_storage_path', v_entry.estimate_storage_path,
    'estimate_drive_url', v_entry.estimate_drive_url,
    'invoice_storage_path', v_entry.invoice_storage_path,
    'invoice_drive_url', v_entry.invoice_drive_url,
    'gate_pass_issued', coalesce(v_entry.gate_pass_issued, false) OR v_has_gate,
    'gate_pass_number', coalesce(v_entry.gate_pass_number, v_gate->>'gate_pass_no'),
    'floor', coalesce(v_floor, 'null'::jsonb),
    'invoice', CASE
      WHEN v_has_inv THEN jsonb_build_object(
        'invoice_number', v_inv.invoice_number,
        'invoice_date', v_inv.invoice_date,
        'billed_amount', v_inv.billed_amount,
        'amount_received', coalesce(v_inv.amount_received, 0),
        'remaining_amount', public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received),
        'payment_status', v_inv.payment_status
      )
      ELSE NULL
    END,
    'payments', coalesce(v_payments, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.customer_get_mechanical_case(text, text) IS
  'MOBILE-015: Customer read model for Floor Incharge visits (mechanical desk). Null when active reception row is not a floor service type.';

REVOKE ALL ON FUNCTION public.customer_get_mechanical_case(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_get_mechanical_case(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_get_mechanical_case(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_get_mechanical_case(text, text) TO service_role;
