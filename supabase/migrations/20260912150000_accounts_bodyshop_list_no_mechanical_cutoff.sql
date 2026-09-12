-- ACCOUNTS-001 / DBL-0054
-- Bodyshop Accounts list must NOT use the Mechanical 11-Sep-2026 cutoff.
-- Restores list_accounts_bodyshop_cases() to billed qualification only.
-- Does not change list_accounts_mechanical_cases() (DBL-0053 Mark Done cutoff stays).
-- Does not delete or update settlement / repair / payment rows.
-- Safe to re-run.

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
    ) x;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.list_accounts_bodyshop_cases() IS
  'ACCOUNTS-001 / DBL-0054: Bodyshop billed cases (invoice number + billed amount, not cancelled). No Mechanical 11-Sep cutoff.';

GRANT EXECUTE ON FUNCTION public.list_accounts_bodyshop_cases() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
