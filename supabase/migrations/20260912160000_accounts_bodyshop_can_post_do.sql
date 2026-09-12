-- ACCOUNTS-001 / DBL-0055
-- Accounts users may post insurer/DO settlement lines on the existing ledger.
-- Extends bodyshop_settlement_can_post_do (same helper add_bodyshop_settlement_line already uses).
-- Recovery and Repair modify paths stay. No new ledger / payment table.
-- list_accounts_bodyshop_cases also returns overall outstanding + derived status.
-- Does not change list_bodyshop_do_recovery (insurance-due book).
-- Does not change Mechanical accounts_mechanical_payment_lines.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.bodyshop_settlement_can_post_do(p_repair_card_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN true;
  END IF;
  IF public.has_module_view('accounts')
     OR public.has_module_modify('accounts') THEN
    RETURN true;
  END IF;
  IF public.has_module_view('bodyshop_recovery')
     OR public.has_module_modify('bodyshop_recovery') THEN
    RETURN true;
  END IF;
  RETURN public.bodyshop_settlement_can_modify(p_repair_card_id);
END;
$$;

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
        s.do_status,
        s.do_released_amount,
        s.insurance_due_amount,
        s.do_payment_status,
        s.outstanding_amount,
        s.derived_payment_status
      FROM public.bodyshop_settlements s
      JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
      WHERE NULLIF(btrim(s.invoice_number), '') IS NOT NULL
        AND COALESCE(s.invoice_amount, c.billed_amount) IS NOT NULL
        AND COALESCE(c.overall_status, 'active') <> 'cancelled'
    ) x;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.bodyshop_settlement_can_post_do(integer) IS
  'ACCOUNTS-001 / DBL-0055: admin, accounts view/modify, recovery view/modify, or bodyshop_repair modify.';

COMMENT ON FUNCTION public.list_accounts_bodyshop_cases() IS
  'ACCOUNTS-001 / DBL-0055: billed Bodyshop cases plus settlement outstanding and overall payment status.';

GRANT EXECUTE ON FUNCTION public.bodyshop_settlement_can_post_do(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_accounts_bodyshop_cases() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
