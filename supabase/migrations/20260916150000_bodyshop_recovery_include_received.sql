-- BODYSHOP-RECOVERY-001 / DBL-0070
-- Recovery list includes received DO (insurance due ₹0) so the Received KPI
-- can show cases that no longer need recovery.
--
-- Default UI still lists open due > 0. Received is a KPI filter.
-- Cancelled cards stay hidden. Customer remaining stays off this RPC.
-- Do not re-run DBL-0031 / DBL-0032 / DBL-0036.
-- Timestamp 20260916150000 because 20260916143000 is DBL-0069.

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

  -- Open (due > 0) plus received / due ₹0 (no recovery needed).
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
        AND COALESCE(c.overall_status, 'active') <> 'cancelled'
    ) x;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.list_bodyshop_do_recovery() IS
  'Org-wide DO recovery book: billed non-cancelled cards with a DO. '
  'Includes open insurance due and received / due ₹0 (no recovery needed).';

GRANT EXECUTE ON FUNCTION public.list_bodyshop_do_recovery() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
