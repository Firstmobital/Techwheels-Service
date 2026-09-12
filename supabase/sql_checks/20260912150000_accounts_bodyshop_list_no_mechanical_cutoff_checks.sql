-- Read-only verification checks for:
-- supabase/migrations/20260912150000_accounts_bodyshop_list_no_mechanical_cutoff.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Both list RPCs remain SECURITY DEFINER + authenticated EXECUTE
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'list_accounts_mechanical_cases',
    'list_accounts_bodyshop_cases'
  )
ORDER BY p.proname;

-- 2) Mechanical cutoff remains IST Mark Done only
SELECT
  pg_get_functiondef(p.oid) LIKE '%2026-09-11 00:00:00+05:30%'
  AND pg_get_functiondef(p.oid) LIKE '%invoice_done_at IS NOT NULL%'
  AND pg_get_functiondef(p.oid) LIKE '%is_floor_incharge_service_type%'
    AS mechanical_cutoff_still_ist_mark_done
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_cases';

-- 3) Bodyshop list has no 11-Sep cutoff; still billed-not-recovery
SELECT
  pg_get_functiondef(p.oid) NOT LIKE '%2026-09-11%'
  AND pg_get_functiondef(p.oid) LIKE '%invoice_number%'
  AND pg_get_functiondef(p.oid) LIKE '%COALESCE(s.invoice_amount, c.billed_amount)%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%insurance_due_amount > 0%'
    AS bodyshop_no_mechanical_cutoff
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_bodyshop_cases';

-- 4) Eligibility counts (same predicates as the RPCs)
SELECT
  (
    SELECT count(*)
    FROM public.service_reception_entries e
    WHERE e.invoice_done_at IS NOT NULL
      AND e.invoice_done_at >= TIMESTAMPTZ '2026-09-11 00:00:00+05:30'
      AND NULLIF(btrim(e.jc_number), '') IS NOT NULL
      AND public.is_floor_incharge_service_type(e.service_type)
  ) AS mechanical_eligible,
  (
    SELECT count(*)
    FROM public.service_reception_entries e
    WHERE e.invoice_done_at IS NOT NULL
      AND e.invoice_done_at < TIMESTAMPTZ '2026-09-11 00:00:00+05:30'
      AND NULLIF(btrim(e.jc_number), '') IS NOT NULL
      AND public.is_floor_incharge_service_type(e.service_type)
  ) AS mechanical_hidden_pre_cutoff,
  (
    SELECT count(*)
    FROM public.bodyshop_settlements s
    JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
    WHERE NULLIF(btrim(s.invoice_number), '') IS NOT NULL
      AND COALESCE(s.invoice_amount, c.billed_amount) IS NOT NULL
      AND COALESCE(c.overall_status, 'active') <> 'cancelled'
  ) AS bodyshop_eligible,
  (
    SELECT count(*)
    FROM public.bodyshop_settlements s
    JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
    WHERE NULLIF(btrim(s.invoice_number), '') IS NOT NULL
      AND COALESCE(s.invoice_amount, c.billed_amount) IS NOT NULL
      AND COALESCE(c.overall_status, 'active') <> 'cancelled'
      AND s.invoice_date < DATE '2026-09-11'
  ) AS bodyshop_historical_before_11_sep;

-- 5) Recovery still has no Accounts cutoff
SELECT
  pg_get_functiondef(p.oid) LIKE '%insurance_due_amount%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%2026-09-11%'
    AS recovery_untouched
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';
