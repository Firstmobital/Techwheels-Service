-- Migration: Add missing gatepass columns to service_reception_entries
-- Fixes: column "gate_pass_issued" of relation "service_reception_entries" does not exist

ALTER TABLE public.service_reception_entries
  ADD COLUMN IF NOT EXISTS gate_pass_issued boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gate_pass_number text;

-- Recreate or update issue_accounts_mechanical_gatepass to be resilient
CREATE OR REPLACE FUNCTION public.issue_accounts_mechanical_gatepass(
  p_reception_entry_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_entry public.service_reception_entries%ROWTYPE;
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_received numeric;
  v_remaining numeric;
  v_reason text;
  v_label text;
  v_norm text;
  v_gp_no text;
  v_actor text;
  v_issued_at text;
  v_payload jsonb;
  v_bot_id bigint;
BEGIN
  IF NOT public.accounts_can_access() THEN
    RAISE EXCEPTION 'permission denied: requires accounts view'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_entry
    FROM public.service_reception_entries
   WHERE id = p_reception_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_inv
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = p_reception_entry_id;
  IF NOT FOUND OR v_inv.billed_amount IS NULL THEN
    RAISE EXCEPTION 'capture invoice number and billed amount first'
      USING ERRCODE = '23514';
  END IF;

  v_received := COALESCE(v_inv.amount_received, 0);
  v_remaining := public.accounts_mechanical_remaining_amount(v_inv.billed_amount, v_inv.amount_received);
  v_reason := public.accounts_mechanical_gatepass_reason(
    v_inv.billed_amount,
    v_inv.amount_received,
    COALESCE(v_inv.keep_on_credit, false)
  );
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'gatepass not eligible: remaining ₹% exceeds 2%% of billed ₹% and Keep on Credit is not approved',
      v_remaining, v_inv.billed_amount
      USING ERRCODE = '23514';
  END IF;

  v_label := public.accounts_mechanical_gatepass_reason_label(v_reason);
  v_norm := upper(btrim(COALESCE(v_entry.reg_number, 'VEHICLE')));
  v_gp_no := 'GP-' || CASE
    WHEN NULLIF(btrim(COALESCE(v_entry.jc_number, '')), '') IS NULL THEN right(extract(epoch FROM now())::bigint::text, 5)
    ELSE right(regexp_replace(v_entry.jc_number, '[^0-9]', '', 'g'), 5)
  END;
  v_actor := COALESCE(
    NULLIF(auth.jwt() ->> 'email', ''),
    NULLIF(auth.uid()::text, ''),
    'Accounts Desk'
  );
  v_issued_at := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH:MI AM');

  v_payload := jsonb_build_object(
    'gate_pass_no', v_gp_no,
    'reg_number', v_norm,
    'customer_name', COALESCE(NULLIF(btrim(v_entry.owner_name), ''), 'Customer'),
    'customer_phone', v_entry.owner_phone,
    'job_card_no', v_entry.jc_number,
    'invoice_no', COALESCE(v_inv.invoice_number, 'INV-' || replace(v_gp_no, 'GP-', '')),
    'invoice_date', v_inv.invoice_date,
    'billed_amount', v_inv.billed_amount,
    'amount_received', v_received,
    'remaining_amount', v_remaining,
    'payment_status', v_label,
    'settlement_reason', v_reason,
    'keep_on_credit', COALESCE(v_inv.keep_on_credit, false),
    'issued_at', v_issued_at,
    'issued_by', v_actor,
    'branch', COALESCE(v_entry.branch, 'Sitapura Workshop'),
    'qr_token', 'GP_AUTH_' || v_gp_no || '_' || v_norm || '_SECURE'
  );

  SELECT id INTO v_bot_id
    FROM public.post_feedback_bot_data
   WHERE vehicle_registration_number = v_norm
     AND mode = 'customer_gatepass_payload'
   ORDER BY complaint_date_time DESC NULLS LAST
   LIMIT 1;

  IF v_bot_id IS NOT NULL THEN
    UPDATE public.post_feedback_bot_data
       SET customer_name = v_payload ->> 'customer_name',
           mobile_number = v_entry.owner_phone,
           rating = 5,
           feedback_text = v_payload::text,
           service_type = 'Gate Pass #' || v_gp_no,
           primary_complaint_area = 'Gate Pass Issued',
           complaint_date_time = now()
     WHERE id = v_bot_id;
  ELSE
    INSERT INTO public.post_feedback_bot_data (
      vehicle_registration_number, customer_name, mobile_number, rating,
      feedback_text, service_type, mode, primary_complaint_area, complaint_date_time
    ) VALUES (
      v_norm,
      v_payload ->> 'customer_name',
      v_entry.owner_phone,
      5,
      v_payload::text,
      'Gate Pass #' || v_gp_no,
      'customer_gatepass_payload',
      'Gate Pass Issued',
      now()
    );
  END IF;

  UPDATE public.service_reception_entries
     SET gate_pass_issued = true,
         gate_pass_number = v_gp_no
   WHERE id = p_reception_entry_id;

  RETURN v_payload;
END;
$$;
