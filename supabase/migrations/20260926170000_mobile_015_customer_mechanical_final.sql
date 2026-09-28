-- MOBILE-015 — single operator migration (mechanical customer + server visit_kind)
--
-- Run this once if you have NOT already applied:
--   20260926153000_customer_mechanical_case_and_mini_paid.sql
--   20260926163000_customer_visit_kind_and_context.sql
--
-- Safe to re-run: uses CREATE OR REPLACE / IF NOT EXISTS.
-- After apply: re-dump supabase/backups/full_metadata.sql from live DB.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Reception columns used by mechanical gate pass display
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_reception_entries
  ADD COLUMN IF NOT EXISTS gate_pass_issued boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gate_pass_number text;

-- ---------------------------------------------------------------------------
-- 2) Mechanical allowlist (includes Mini Paid Service)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3) Visit classification (must exist before customer_get_active_job)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_resolve_visit_kind(p_job jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_job IS NULL THEN 'other'
    WHEN public.is_floor_incharge_service_type(p_job->>'service_type') THEN 'mechanical'
    WHEN COALESCE(p_job->>'source', '') = 'bodyshop' THEN 'bodyshop'
    WHEN COALESCE(p_job->>'service_type', '') = 'Accident' THEN 'bodyshop'
    WHEN lower(COALESCE(p_job->>'service_type', '')) LIKE '%accident%' THEN 'bodyshop'
    ELSE 'other'
  END;
$$;

COMMENT ON FUNCTION public.customer_resolve_visit_kind(jsonb) IS
  'Customer mobile visit classification from active job row (reception wins over bodyshop card).';

-- ---------------------------------------------------------------------------
-- 4) Mechanical visit read model
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_get_mechanical_case(
  p_session_token text,
  p_reg_number text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
SET row_security TO off
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

-- ---------------------------------------------------------------------------
-- 5) Active job + visit_kind (matches full_metadata customer_get_active_job)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_get_active_job(p_session_token text, p_reg_number text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  v_sess record;
  v_reg text;
  v_regs text[];
  v_job jsonb;
  v_vehicle jsonb;
BEGIN
  SELECT * INTO v_sess FROM public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);

  IF p_reg_number IS NOT NULL AND btrim(p_reg_number) <> '' THEN
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  END IF;

  SELECT jsonb_build_object(
    'id', s.id,
    'source', 'reception',
    'reg_number', s.reg_number,
    'reg_key', public.customer_norm_reg(s.reg_number),
    'model', s.model,
    'owner_name', s.owner_name,
    'owner_phone', s.owner_phone,
    'service_type', s.service_type,
    'sa_name', s.sa_name,
    'sa_display_name', s.sa_display_name,
    'jc_number', s.jc_number,
    'branch', s.branch,
    'created_at', s.created_at,
    'invoice_done_at', s.invoice_done_at,
    'km_reading', s.km_reading,
    'remark', s.remark,
    'estimate_storage_path', s.estimate_storage_path,
    'estimate_drive_url', s.estimate_drive_url,
    'invoice_storage_path', s.invoice_storage_path,
    'invoice_drive_url', s.invoice_drive_url,
    'status', CASE WHEN s.invoice_done_at IS NULL THEN 'in_service' ELSE 'delivered' END
  )
  INTO v_job
  FROM public.service_reception_entries s
  WHERE public.customer_norm_reg(s.reg_number) = ANY (v_regs)
    AND (v_reg IS NULL OR public.customer_norm_reg(s.reg_number) = v_reg)
  ORDER BY (s.invoice_done_at IS NULL) DESC, s.created_at DESC
  LIMIT 1;

  IF v_job IS NULL THEN
    SELECT jsonb_build_object(
      'id', b.id,
      'source', 'bodyshop',
      'reg_number', b.reg_number,
      'reg_key', public.customer_norm_reg(b.reg_number),
      'model', NULL,
      'owner_name', b.customer_name,
      'owner_phone', b.customer_phone,
      'service_type', 'Body & Paint',
      'sa_name', b.sa_name,
      'sa_display_name', b.sa_name,
      'jc_number', b.job_card_no,
      'branch', b.branch,
      'created_at', b.created_at,
      'invoice_done_at', b.delivered_at,
      'km_reading', NULL,
      'remark', b.overall_status,
      'status', CASE
        WHEN COALESCE(b.overall_status, '') IN ('delivered', 'closed') OR b.delivered_at IS NOT NULL
          THEN 'delivered'
        ELSE 'in_service'
      END
    )
    INTO v_job
    FROM public.bodyshop_repair_cards b
    WHERE public.customer_norm_reg(b.reg_number) = ANY (v_regs)
      AND (v_reg IS NULL OR public.customer_norm_reg(b.reg_number) = v_reg)
    ORDER BY b.created_at DESC
    LIMIT 1;
  END IF;

  SELECT v
  INTO v_vehicle
  FROM jsonb_array_elements(public.customer_collect_vehicles(v_sess.phone)) v
  WHERE v_reg IS NULL OR v->>'reg_key' = v_reg
  LIMIT 1;

  RETURN jsonb_build_object(
    'phone', v_sess.phone,
    'vehicle', v_vehicle,
    'job', v_job,
    'visit_kind', public.customer_resolve_visit_kind(v_job)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Bundled visit context for mobile CustomerVisitProvider
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_get_visit_context(p_session_token text, p_reg_number text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  v_base jsonb;
  v_kind text;
BEGIN
  IF p_reg_number IS NULL OR btrim(p_reg_number) = '' THEN
    RAISE EXCEPTION 'reg_number required';
  END IF;

  v_base := public.customer_get_active_job(p_session_token, p_reg_number);
  v_kind := COALESCE(v_base->>'visit_kind', public.customer_resolve_visit_kind(v_base->'job'));

  IF v_kind = 'mechanical' THEN
    RETURN v_base
      || jsonb_build_object(
        'visit_kind', v_kind,
        'mechanical_case', public.customer_get_mechanical_case(p_session_token, p_reg_number),
        'repair_card', NULL
      );
  ELSIF v_kind = 'bodyshop' THEN
    RETURN v_base
      || jsonb_build_object(
        'visit_kind', v_kind,
        'mechanical_case', NULL,
        'repair_card', public.customer_get_repair_card(p_session_token, p_reg_number)
      );
  END IF;

  RETURN v_base
    || jsonb_build_object(
      'visit_kind', v_kind,
      'mechanical_case', NULL,
      'repair_card', NULL
    );
END;
$$;

COMMENT ON FUNCTION public.customer_get_visit_context(text, text) IS
  'Single customer portal payload: active job, visit_kind, and type-specific case (mechanical or bodyshop).';

-- ---------------------------------------------------------------------------
-- 7) Grants (customer mobile uses anon + authenticated)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.customer_get_mechanical_case(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_get_mechanical_case(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_get_mechanical_case(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_get_mechanical_case(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.customer_resolve_visit_kind(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_resolve_visit_kind(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_resolve_visit_kind(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_resolve_visit_kind(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.customer_get_visit_context(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO service_role;

COMMIT;
