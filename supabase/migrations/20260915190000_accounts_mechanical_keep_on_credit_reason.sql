-- ACCOUNTS-001 / DBL-0066
-- Mechanical Keep on Credit: dedicated reason + validity + revocation metadata.
-- Extends DBL-0061. Does NOT change Bodyshop settlement functions or ledgers.
-- Safe to re-run. Do not re-run DBL-0045 / 0046 / 0053 / 0060 / 0061.
-- Timestamp 20260915190000.
-- Authority: accounts_mechanical_invoices 1:1 header (DBL-0045) + Admin module
--   accounts_keep_on_credit (DBL-0061) + user_module_permissions.

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Dedicated auditable Keep-on-Credit columns on the Mechanical invoice header
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts_mechanical_invoices
  ADD COLUMN IF NOT EXISTS keep_on_credit_reason text;

ALTER TABLE public.accounts_mechanical_invoices
  ADD COLUMN IF NOT EXISTS keep_on_credit_revoked_by text;

ALTER TABLE public.accounts_mechanical_invoices
  ADD COLUMN IF NOT EXISTS keep_on_credit_revoked_at timestamptz;

COMMENT ON COLUMN public.accounts_mechanical_invoices.keep_on_credit_reason IS
  'DBL-0065: Dedicated Keep on Credit reason. Not payment_notes. Required for a valid override.';
COMMENT ON COLUMN public.accounts_mechanical_invoices.keep_on_credit_revoked_by IS
  'DBL-0065: Actor who last revoked Keep on Credit. Original approved_by is preserved.';
COMMENT ON COLUMN public.accounts_mechanical_invoices.keep_on_credit_revoked_at IS
  'DBL-0065: Timestamp of last Keep on Credit revocation.';

-- ---------------------------------------------------------------------------
-- B. Validity + case-aware Gatepass reason (trusted; not a client flag)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_mechanical_keep_on_credit_valid(
  p_keep_on_credit boolean,
  p_reason text,
  p_approved_by text,
  p_approved_at timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_keep_on_credit, false)
    AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NOT NULL
    AND NULLIF(btrim(COALESCE(p_approved_by, '')), '') IS NOT NULL
    AND p_approved_at IS NOT NULL;
$$;

COMMENT ON FUNCTION public.accounts_mechanical_keep_on_credit_valid(boolean, text, text, timestamptz) IS
  'DBL-0065: Valid Keep on Credit = flag true AND non-blank reason AND approved_by AND approved_at. A checkbox or keep_on_credit=true alone is not enough.';

CREATE OR REPLACE FUNCTION public.accounts_mechanical_invoice_gatepass_reason(
  p_billed numeric,
  p_received numeric,
  p_keep_on_credit boolean,
  p_reason text,
  p_approved_by text,
  p_approved_at timestamptz
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.accounts_mechanical_gatepass_reason(
    p_billed,
    p_received,
    public.accounts_mechanical_keep_on_credit_valid(
      p_keep_on_credit, p_reason, p_approved_by, p_approved_at
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.accounts_mechanical_actor_label()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT COALESCE(
    (
      SELECT NULLIF(btrim(em.employee_name), '')
      FROM public.user_employee_links uel
      JOIN public.employee_master em ON em.employee_code = uel.employee_code
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
      ORDER BY COALESCE(em.is_active, true) DESC, em.employee_code
      LIMIT 1
    ),
    (
      SELECT NULLIF(btrim(u.full_name), '')
      FROM public.users u
      WHERE u.id = auth.uid()
    ),
    NULLIF(auth.jwt() ->> 'email', ''),
    NULLIF(auth.uid()::text, ''),
    'system'
  );
$$;

-- ---------------------------------------------------------------------------
-- C. Case JSON + list include reason / revocation; Gatepass reason uses validity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_mechanical_case_json(p_reception_entry_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_row jsonb;
BEGIN
  SELECT to_jsonb(x) INTO v_row
    FROM (
      SELECT
        e.id AS reception_entry_id,
        e.jc_number,
        e.reg_number,
        e.model,
        e.service_type,
        e.sa_name,
        e.sa_display_name,
        e.sa_employee_code,
        e.branch,
        e.owner_name,
        e.owner_phone,
        e.invoice_done_at,
        e.invoice_done_by,
        e.created_at,
        e.invoice_storage_path,
        e.invoice_file_name,
        e.invoice_drive_url,
        e.expected_invoice_amount,
        inv.invoice_number,
        inv.invoice_date,
        inv.billed_amount,
        inv.payment_status,
        inv.amount_received,
        public.accounts_mechanical_remaining_amount(inv.billed_amount, inv.amount_received) AS remaining_amount,
        inv.payment_notes,
        inv.captured_by,
        inv.captured_at,
        inv.updated_at AS invoice_updated_at,
        COALESCE(inv.keep_on_credit, false) AS keep_on_credit,
        inv.keep_on_credit_reason,
        inv.keep_on_credit_approved_by,
        inv.keep_on_credit_approved_at,
        inv.keep_on_credit_revoked_by,
        inv.keep_on_credit_revoked_at,
        public.accounts_mechanical_invoice_gatepass_reason(
          inv.billed_amount,
          inv.amount_received,
          COALESCE(inv.keep_on_credit, false),
          inv.keep_on_credit_reason,
          inv.keep_on_credit_approved_by,
          inv.keep_on_credit_approved_at
        ) AS gatepass_reason
      FROM public.service_reception_entries e
      LEFT JOIN public.accounts_mechanical_invoices inv
        ON inv.reception_entry_id = e.id
      WHERE e.id = p_reception_entry_id
    ) x;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_accounts_mechanical_cases()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.accounts_can_access() THEN
    RAISE EXCEPTION 'permission denied: requires accounts view'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.invoice_done_at DESC NULLS LAST, x.reception_entry_id DESC),
    '[]'::jsonb
  )
    INTO v_rows
    FROM (
      SELECT
        e.id AS reception_entry_id,
        e.jc_number,
        e.reg_number,
        e.model,
        e.service_type,
        e.sa_name,
        e.sa_display_name,
        e.sa_employee_code,
        e.branch,
        e.owner_name,
        e.owner_phone,
        e.invoice_done_at,
        e.invoice_done_by,
        e.created_at,
        e.invoice_storage_path,
        e.invoice_file_name,
        e.invoice_drive_url,
        e.expected_invoice_amount,
        inv.invoice_number,
        inv.invoice_date,
        inv.billed_amount,
        inv.payment_status,
        inv.amount_received,
        public.accounts_mechanical_remaining_amount(inv.billed_amount, inv.amount_received) AS remaining_amount,
        inv.payment_notes,
        inv.captured_by,
        inv.captured_at,
        inv.updated_at AS invoice_updated_at,
        COALESCE(inv.keep_on_credit, false) AS keep_on_credit,
        inv.keep_on_credit_reason,
        inv.keep_on_credit_approved_by,
        inv.keep_on_credit_approved_at,
        inv.keep_on_credit_revoked_by,
        inv.keep_on_credit_revoked_at,
        public.accounts_mechanical_invoice_gatepass_reason(
          inv.billed_amount,
          inv.amount_received,
          COALESCE(inv.keep_on_credit, false),
          inv.keep_on_credit_reason,
          inv.keep_on_credit_approved_by,
          inv.keep_on_credit_approved_at
        ) AS gatepass_reason
      FROM public.service_reception_entries e
      LEFT JOIN public.accounts_mechanical_invoices inv
        ON inv.reception_entry_id = e.id
      WHERE e.invoice_done_at IS NOT NULL
        AND e.invoice_done_at >= TIMESTAMPTZ '2026-09-11 00:00:00+05:30'
        AND NULLIF(btrim(e.jc_number), '') IS NOT NULL
        AND public.is_floor_incharge_service_type(e.service_type)
    ) x;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.list_accounts_mechanical_cases() IS
  'ACCOUNTS-001 / DBL-0065: Mechanical Mark Done cases from 2026-09-11 00:00 Asia/Kolkata. Gatepass reason requires valid Keep on Credit (flag+reason+approver+time), not the flag alone. Remaining is still GREATEST(0, billed − received).';

-- ---------------------------------------------------------------------------
-- D. Keep on Credit setter — reason required on approve; current-state revocation
-- Drop the DBL-0061 2-arg overload so approve cannot bypass the reason.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_accounts_mechanical_keep_on_credit(bigint, boolean);

CREATE OR REPLACE FUNCTION public.set_accounts_mechanical_keep_on_credit(
  p_reception_entry_id bigint,
  p_keep_on_credit boolean,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_actor text;
  v_reason text;
BEGIN
  IF NOT public.accounts_can_access() THEN
    RAISE EXCEPTION 'permission denied: requires accounts view'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.accounts_mechanical_can_keep_on_credit() THEN
    RAISE EXCEPTION 'permission denied: Keep on Credit requires Admin, GM, or Accounts Keep on Credit grant'
      USING ERRCODE = '42501';
  END IF;
  IF p_keep_on_credit IS NULL THEN
    RAISE EXCEPTION 'keep_on_credit is required'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accounts_mechanical_invoices
     WHERE reception_entry_id = p_reception_entry_id
  ) THEN
    RAISE EXCEPTION 'capture invoice number and billed amount first'
      USING ERRCODE = '23514';
  END IF;

  v_actor := public.accounts_mechanical_actor_label();

  IF p_keep_on_credit THEN
    v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'reason for keeping on credit is required'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.accounts_mechanical_invoices
       SET keep_on_credit = true,
           keep_on_credit_reason = v_reason,
           keep_on_credit_approved_by = v_actor,
           keep_on_credit_approved_at = clock_timestamp(),
           keep_on_credit_revoked_by = NULL,
           keep_on_credit_revoked_at = NULL,
           updated_at = now()
     WHERE reception_entry_id = p_reception_entry_id;
  ELSE
    UPDATE public.accounts_mechanical_invoices
       SET keep_on_credit = false,
           keep_on_credit_revoked_by = v_actor,
           keep_on_credit_revoked_at = clock_timestamp(),
           updated_at = now()
     WHERE reception_entry_id = p_reception_entry_id;
  END IF;

  RETURN public.accounts_mechanical_case_json(p_reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.set_accounts_mechanical_keep_on_credit(bigint, boolean, text) IS
  'DBL-0065: Approve or revoke Mechanical Keep on Credit. Approve requires a non-empty trimmed reason and stores authenticated actor + server timestamp. Revoke keeps original reason/approved_by/approved_at and records revoked_by/revoked_at. Does not rewrite remaining or payment_status. Client cannot supply approved_by or approved_at.';

-- ---------------------------------------------------------------------------
-- E. Trusted Mechanical Gatepass issue uses persisted validity, not a client flag
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_accounts_mechanical_gatepass(p_reception_entry_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_entry public.service_reception_entries%ROWTYPE;
  v_remaining numeric;
  v_reason text;
  v_label text;
  v_gp_no text;
  v_norm text;
  v_actor text;
  v_issued_at text;
  v_payload jsonb;
  v_bot_id bigint;
  v_received numeric;
  v_credit_valid boolean;
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
  v_credit_valid := public.accounts_mechanical_keep_on_credit_valid(
    v_inv.keep_on_credit,
    v_inv.keep_on_credit_reason,
    v_inv.keep_on_credit_approved_by,
    v_inv.keep_on_credit_approved_at
  );
  v_reason := public.accounts_mechanical_gatepass_reason(
    v_inv.billed_amount,
    v_inv.amount_received,
    v_credit_valid
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
  v_actor := public.accounts_mechanical_actor_label();
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
    'keep_on_credit', v_credit_valid,
    'keep_on_credit_reason', CASE WHEN v_reason = 'keep_on_credit' THEN v_inv.keep_on_credit_reason ELSE NULL END,
    'keep_on_credit_approved_by', CASE WHEN v_reason = 'keep_on_credit' THEN v_inv.keep_on_credit_approved_by ELSE NULL END,
    'keep_on_credit_approved_at', CASE WHEN v_reason = 'keep_on_credit' THEN v_inv.keep_on_credit_approved_at ELSE NULL END,
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

COMMENT ON FUNCTION public.issue_accounts_mechanical_gatepass(bigint) IS
  'DBL-0065: Issue Mechanical Gatepass only when remaining <= 0, remaining <= 2% of billed, or valid persisted Keep on Credit (flag+reason+approver+time). Computes eligibility server-side from authoritative invoice columns. Does not accept a client eligible flag. payment_status on the payload is the Gatepass clearance label, not financial payment_status.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.accounts_mechanical_keep_on_credit_valid(boolean, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_keep_on_credit_valid(boolean, text, text, timestamptz)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accounts_mechanical_invoice_gatepass_reason(numeric, numeric, boolean, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_invoice_gatepass_reason(numeric, numeric, boolean, text, text, timestamptz)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accounts_mechanical_actor_label() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_actor_label() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accounts_mechanical_case_json(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_case_json(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_accounts_mechanical_cases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accounts_mechanical_cases() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_accounts_mechanical_keep_on_credit(bigint, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_accounts_mechanical_keep_on_credit(bigint, boolean, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_accounts_mechanical_gatepass(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_accounts_mechanical_gatepass(bigint)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
