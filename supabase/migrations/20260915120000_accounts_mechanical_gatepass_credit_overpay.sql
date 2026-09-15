-- ACCOUNTS-001 / DBL-0061
-- Mechanical Gatepass eligibility, Keep on Credit, and exact overpayment receipts.
-- Does NOT change Bodyshop settlement functions or ledgers.
-- Safe to re-run. Do not re-run DBL-0045 / 0046 / 0053 / 0060.
-- Timestamp 20260915120000.
-- Authority: live add_accounts_mechanical_payment (DBL-0060) + list_accounts_mechanical_cases (DBL-0053)
--   + accounts_mechanical_invoices 1:1 header + Admin modules / user_module_permissions.

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Explicit Admin grant (not accounts.can_modify)
-- Generic accounts Modify is unused as a distinct desk capability and is not
-- a credit-override grant. Smallest existing Admin authority extension: a
-- named module row granted in Admin → Permissions.
-- ---------------------------------------------------------------------------
INSERT INTO public.modules (name, label, description, route, sort_order, is_active)
VALUES (
  'accounts_keep_on_credit',
  'Accounts Keep on Credit',
  'Explicit grant to approve Mechanical Keep on Credit Gatepass override. Separate from the Accounts desk. Platform admin and linked active GM also qualify without this grant.',
  NULL,
  31,
  true
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  route = EXCLUDED.route,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

-- ---------------------------------------------------------------------------
-- B. Persist Keep on Credit on the Mechanical invoice header (1:1)
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts_mechanical_invoices
  ADD COLUMN IF NOT EXISTS keep_on_credit boolean NOT NULL DEFAULT false;

ALTER TABLE public.accounts_mechanical_invoices
  ADD COLUMN IF NOT EXISTS keep_on_credit_approved_by text;

ALTER TABLE public.accounts_mechanical_invoices
  ADD COLUMN IF NOT EXISTS keep_on_credit_approved_at timestamptz;

COMMENT ON COLUMN public.accounts_mechanical_invoices.keep_on_credit IS
  'DBL-0061: Authorized Keep on Credit override. Gatepass eligibility only. Does not change remaining or payment_status.';
COMMENT ON COLUMN public.accounts_mechanical_invoices.keep_on_credit_approved_by IS
  'DBL-0061: Actor who last approved or revoked Keep on Credit.';
COMMENT ON COLUMN public.accounts_mechanical_invoices.keep_on_credit_approved_at IS
  'DBL-0061: Timestamp of last Keep on Credit approve or revoke.';

-- ---------------------------------------------------------------------------
-- C. Eligibility / authorization helpers (SECURITY DEFINER, not browser-trusted)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_mechanical_remaining_amount(
  p_billed numeric,
  p_received numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_billed IS NULL THEN NULL
    ELSE GREATEST(0, round(p_billed - COALESCE(p_received, 0), 2))
  END;
$$;

CREATE OR REPLACE FUNCTION public.accounts_mechanical_short_payment_allowance(p_billed numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_billed IS NULL THEN NULL
    ELSE round(p_billed * 0.02, 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.accounts_mechanical_gatepass_reason(
  p_billed numeric,
  p_received numeric,
  p_keep_on_credit boolean
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_remaining numeric;
  v_allowance numeric;
BEGIN
  IF p_billed IS NULL THEN
    RETURN NULL;
  END IF;
  v_remaining := public.accounts_mechanical_remaining_amount(p_billed, p_received);
  IF v_remaining IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_remaining <= 0 THEN
    RETURN 'paid';
  END IF;
  v_allowance := public.accounts_mechanical_short_payment_allowance(p_billed);
  IF v_allowance IS NOT NULL AND v_remaining <= v_allowance THEN
    RETURN 'short_payment';
  END IF;
  IF COALESCE(p_keep_on_credit, false) THEN
    RETURN 'keep_on_credit';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.accounts_mechanical_gatepass_eligible(
  p_billed numeric,
  p_received numeric,
  p_keep_on_credit boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.accounts_mechanical_gatepass_reason(p_billed, p_received, p_keep_on_credit) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.accounts_mechanical_user_is_gm()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel
    JOIN public.employee_master em ON em.employee_code = uel.employee_code
    WHERE uel.user_id = auth.uid()
      AND uel.is_active = true
      AND COALESCE(em.is_active, true) = true
      AND public.employee_has_business_role(em.role, 'GM')
  );
$$;

CREATE OR REPLACE FUNCTION public.accounts_mechanical_can_keep_on_credit()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_admin()
    OR public.accounts_mechanical_user_is_gm()
    OR public.has_module_view('accounts_keep_on_credit')
    OR public.has_module_modify('accounts_keep_on_credit');
$$;

COMMENT ON FUNCTION public.accounts_mechanical_can_keep_on_credit() IS
  'DBL-0061: true for platform admin/super_admin, linked active GM, or Admin grant of module accounts_keep_on_credit. Does not use accounts.can_modify.';

CREATE OR REPLACE FUNCTION public.accounts_mechanical_gatepass_reason_label(p_reason text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_reason
    WHEN 'paid' THEN 'Paid'
    WHEN 'short_payment' THEN 'Short payment allowed'
    WHEN 'keep_on_credit' THEN 'Released on credit'
    ELSE NULL
  END;
$$;

-- ---------------------------------------------------------------------------
-- D. Case JSON + list include Keep on Credit (remaining still billed − received, floored)
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
        inv.keep_on_credit_approved_by,
        inv.keep_on_credit_approved_at,
        public.accounts_mechanical_gatepass_reason(
          inv.billed_amount,
          inv.amount_received,
          COALESCE(inv.keep_on_credit, false)
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
        inv.keep_on_credit_approved_by,
        inv.keep_on_credit_approved_at,
        public.accounts_mechanical_gatepass_reason(
          inv.billed_amount,
          inv.amount_received,
          COALESCE(inv.keep_on_credit, false)
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
  'ACCOUNTS-001 / DBL-0061: Mechanical Mark Done cases from 2026-09-11 00:00 Asia/Kolkata. Includes Keep on Credit and derived gatepass_reason. Remaining is still GREATEST(0, billed − received).';

-- ---------------------------------------------------------------------------
-- E. Post receipts at the entered amount (no remaining cap, no ₹1 clip)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_accounts_mechanical_payment(
  p_reception_entry_id bigint,
  p_amount numeric,
  p_payment_mode text,
  p_reference text DEFAULT NULL,
  p_payment_received_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_inv public.accounts_mechanical_invoices%ROWTYPE;
  v_mode text;
  v_amount numeric;
  v_actor text;
  v_received_date date;
  v_voucher text;
  v_eff date;
BEGIN
  IF NOT public.accounts_can_access() THEN
    RAISE EXCEPTION 'permission denied: requires accounts view'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = p_reception_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'capture invoice number and billed amount first'
      USING ERRCODE = '23514';
  END IF;
  IF v_inv.billed_amount IS NULL THEN
    RAISE EXCEPTION 'billed amount is required before posting a receipt'
      USING ERRCODE = '23514';
  END IF;

  v_amount := round(COALESCE(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'receipt amount must be greater than 0'
      USING ERRCODE = '23514';
  END IF;

  v_mode := lower(btrim(COALESCE(p_payment_mode, '')));
  IF v_mode NOT IN ('cash', 'upi', 'card', 'cheque', 'bank', 'other') THEN
    RAISE EXCEPTION 'invalid payment_mode'
      USING ERRCODE = '23514';
  END IF;

  v_received_date := p_payment_received_date;
  IF v_received_date IS NULL THEN
    RAISE EXCEPTION 'payment received date is required'
      USING ERRCODE = '23514';
  END IF;

  v_actor := COALESCE(
    NULLIF(auth.jwt() ->> 'email', ''),
    NULLIF(auth.uid()::text, ''),
    'system'
  );

  v_eff := public.accounts_mechanical_effective_invoice_date(p_reception_entry_id);
  v_voucher := public.accounts_mechanical_next_voucher_no(v_mode, v_eff);

  INSERT INTO public.accounts_mechanical_payment_lines (
    reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference,
    posted_by, posted_at, payment_received_date, voucher_no
  ) VALUES (
    p_reception_entry_id,
    v_inv.id,
    v_amount,
    v_mode,
    NULLIF(btrim(p_reference), ''),
    v_actor,
    now(),
    v_received_date,
    v_voucher
  );

  PERFORM public.accounts_mechanical_recalc(p_reception_entry_id);
  RETURN public.accounts_mechanical_case_json(p_reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date) IS
  'ACCOUNTS-001 / DBL-0061: Append a mechanical receipt at the entered amount. Overpayment is stored as-is. Remaining display floors at 0. Recalc still derives payment_status from billed vs sum(lines). Voucher from effective invoice_date (DBL-0060).';

-- ---------------------------------------------------------------------------
-- F. Keep on Credit setter — server authorization mandatory
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_accounts_mechanical_keep_on_credit(
  p_reception_entry_id bigint,
  p_keep_on_credit boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_actor text;
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

  v_actor := COALESCE(
    NULLIF(auth.jwt() ->> 'email', ''),
    NULLIF(auth.uid()::text, ''),
    'system'
  );

  UPDATE public.accounts_mechanical_invoices
     SET keep_on_credit = p_keep_on_credit,
         keep_on_credit_approved_by = v_actor,
         keep_on_credit_approved_at = now(),
         updated_at = now()
   WHERE reception_entry_id = p_reception_entry_id;

  RETURN public.accounts_mechanical_case_json(p_reception_entry_id);
END;
$$;

COMMENT ON FUNCTION public.set_accounts_mechanical_keep_on_credit(bigint, boolean) IS
  'DBL-0061: Approve or revoke Mechanical Keep on Credit. Does not rewrite remaining or payment_status. Last actor/time stored on both approve and revoke.';

-- ---------------------------------------------------------------------------
-- G. Trusted Mechanical Gatepass issue
-- Eligibility is computed here. Browser-supplied eligible flags are not accepted.
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

COMMENT ON FUNCTION public.issue_accounts_mechanical_gatepass(bigint) IS
  'DBL-0061: Issue Mechanical Gatepass only when remaining <= 0, remaining <= 2% of billed, or persisted Keep on Credit is true. Computes eligibility server-side. Does not accept a client eligible flag.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.accounts_mechanical_remaining_amount(numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_remaining_amount(numeric, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accounts_mechanical_short_payment_allowance(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_short_payment_allowance(numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accounts_mechanical_gatepass_reason(numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_gatepass_reason(numeric, numeric, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accounts_mechanical_gatepass_eligible(numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_gatepass_eligible(numeric, numeric, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accounts_mechanical_gatepass_reason_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_gatepass_reason_label(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accounts_mechanical_user_is_gm() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_user_is_gm() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accounts_mechanical_can_keep_on_credit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_can_keep_on_credit() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accounts_mechanical_case_json(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounts_mechanical_case_json(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_accounts_mechanical_cases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accounts_mechanical_cases() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_accounts_mechanical_payment(bigint, numeric, text, text, date)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_accounts_mechanical_keep_on_credit(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_accounts_mechanical_keep_on_credit(bigint, boolean)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_accounts_mechanical_gatepass(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_accounts_mechanical_gatepass(bigint)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
