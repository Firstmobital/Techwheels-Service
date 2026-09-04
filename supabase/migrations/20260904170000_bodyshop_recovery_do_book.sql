-- BODYSHOP-RECOVERY-001 / DBL-0031
-- Bodyshop Recovery v1: DO / insurance-due book only. No customer remaining.
-- Timestamp 20260904170000 because 20260904160000 is DBL-0030 (payroll Add Employee).
-- Safe to re-run.

-- View helper: Accounts with this module can read a settlement header (no write).
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
  IF NOT (
    public.has_module_view('bodyshop_repair')
    OR public.has_module_modify('bodyshop_repair')
    OR public.has_module_view('bodyshop_tracker')
    OR public.has_module_view('bodyshop_floor')
    OR public.has_module_view('bodyshop_recovery')
    OR public.has_module_modify('bodyshop_recovery')
  ) THEN
    RETURN false;
  END IF;

  SELECT sre.dealer_code
    INTO v_dealer
    FROM public.bodyshop_repair_cards brc
    LEFT JOIN public.service_reception_entries sre ON sre.id = brc.reception_entry_id
   WHERE brc.id = p_repair_card_id;

  IF v_dealer IS NULL THEN
    RETURN public.is_admin();
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
      LEFT JOIN public.service_reception_entries sre ON sre.id = c.reception_entry_id
      WHERE s.do_amount IS NOT NULL
        AND COALESCE(s.insurance_due_amount, 0) > 0
        AND (
          public.is_admin()
          OR public.dealer_code_in_scope(sre.dealer_code)
        )
    ) x;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_bodyshop_do_recovery() TO authenticated, service_role;

INSERT INTO public.modules (name, label, description, route, sort_order, is_active)
VALUES (
  'bodyshop_recovery',
  'Bodyshop Recovery',
  'DO / insurance-due recovery book. Customer remaining is not in v1.',
  '/bodyshop-recovery',
  33,
  true
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  route = EXCLUDED.route,
  is_active = true;
