-- BODYSHOP-RECOVERY-001 / DBL-0032
-- Recovery book is dealer-agnostic: no dealer_code / branch / fuel row filter.
-- NO-DEALER logins with bodyshop_recovery view must see every open insurance due.
-- Do not re-run DBL-0031. This file is safe to re-run.
-- Timestamp 20260904180000 because 20260904170000 is DBL-0031.

CREATE OR REPLACE FUNCTION public.bodyshop_settlement_can_view(p_repair_card_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dealer text;
BEGIN
  IF public.is_admin() THEN
    RETURN true;
  END IF;

  -- Recovery is org-wide. Do not require a mapped dealer or branch.
  IF public.has_module_view('bodyshop_recovery')
     OR public.has_module_modify('bodyshop_recovery') THEN
    RETURN true;
  END IF;

  IF NOT (
    public.has_module_view('bodyshop_repair')
    OR public.has_module_modify('bodyshop_repair')
    OR public.has_module_view('bodyshop_tracker')
    OR public.has_module_view('bodyshop_floor')
  ) THEN
    RETURN false;
  END IF;

  SELECT sre.dealer_code
    INTO v_dealer
    FROM public.bodyshop_repair_cards brc
    LEFT JOIN public.service_reception_entries sre ON sre.id = brc.reception_entry_id
   WHERE brc.id = p_repair_card_id;

  IF v_dealer IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.dealer_code_in_scope(v_dealer);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_bodyshop_do_recovery()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security = off
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_view('bodyshop_recovery')
    OR public.has_module_modify('bodyshop_recovery')
  ) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_recovery view'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.insurance_due_amount DESC, x.invoice_date DESC NULLS LAST, x.repair_card_id DESC), '[]'::jsonb)
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
        c.overall_status,
        c.current_stage,
        s.invoice_number,
        s.invoice_date,
        s.invoice_amount,
        s.invoice_account,
        s.do_amount,
        s.do_released_amount,
        s.insurance_due_amount,
        s.do_payment_status,
        s.needs_accounts_review
      FROM public.bodyshop_settlements s
      JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
      WHERE s.do_amount IS NOT NULL
        AND COALESCE(s.insurance_due_amount, 0) > 0
    ) x;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_bodyshop_do_recovery() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bodyshop_settlement_can_view(integer) TO authenticated, service_role;
