-- ACCOUNTS-001 / DBL-0053
-- Accounts Desk visibility cutoff: 11-Sep-2026 Asia/Kolkata.
-- Listing eligibility only. Does not delete or update source rows.
-- Mechanical: invoice_done_at >= 2026-09-11 00:00:00+05:30
-- Bodyshop: invoice_date >= DATE '2026-09-11'
-- Explicit timestamptz offset — do not depend on session TimeZone.
-- Safe to re-run. Do not re-run DBL-0045 / 0046 / 0051.
-- Authority: live list RPCs (DBL-0051 mechanical shape) + DBL-0045 bodyshop shape.

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
        CASE
          WHEN inv.billed_amount IS NULL THEN NULL
          ELSE GREATEST(0, round(inv.billed_amount - COALESCE(inv.amount_received, 0), 2))
        END AS remaining_amount,
        inv.payment_notes,
        inv.captured_by,
        inv.captured_at,
        inv.updated_at AS invoice_updated_at
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
  'ACCOUNTS-001 / DBL-0053: Mechanical Mark Done cases from 2026-09-11 00:00 Asia/Kolkata onward. Does not mutate source rows.';

CREATE OR REPLACE FUNCTION public.list_accounts_bodyshop_cases()
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
    jsonb_agg(to_jsonb(x) ORDER BY x.invoice_date DESC NULLS LAST, x.repair_card_id DESC),
    '[]'::jsonb
  )
    INTO v_rows
    FROM (
      SELECT
        s.repair_card_id,
        s.job_card_no,
        c.reg_number,
        c.customer_name,
        c.branch,
        c.sa_name,
        c.insurance_company,
        c.insurance_policy_no,
        c.overall_status,
        c.current_stage,
        s.invoice_number,
        s.invoice_date,
        s.invoice_amount,
        c.billed_amount,
        s.invoice_account,
        s.customer_diff_amount,
        s.customer_settlement_kind,
        s.customer_posted_amount,
        s.customer_remaining_amount,
        s.customer_payment_status,
        s.do_amount,
        s.insurance_due_amount,
        s.do_payment_status
      FROM public.bodyshop_settlements s
      JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
      WHERE NULLIF(btrim(s.invoice_number), '') IS NOT NULL
        AND COALESCE(s.invoice_amount, c.billed_amount) IS NOT NULL
        AND COALESCE(c.overall_status, 'active') <> 'cancelled'
        AND s.invoice_date >= DATE '2026-09-11'
    ) x;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.list_accounts_bodyshop_cases() IS
  'ACCOUNTS-001 / DBL-0053: Bodyshop billed cases with invoice_date on or after 2026-09-11. Does not mutate source rows.';

GRANT EXECUTE ON FUNCTION public.list_accounts_mechanical_cases() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_accounts_bodyshop_cases() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
