-- Read-only verification checks for:
-- supabase/migrations/20260915120000_accounts_mechanical_gatepass_credit_overpay.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Keep on Credit columns on Mechanical invoice header
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_invoices'
      AND column_name = 'keep_on_credit'
  ) AS keep_on_credit_col,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_invoices'
      AND column_name = 'keep_on_credit_approved_by'
  ) AS approved_by_col,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_invoices'
      AND column_name = 'keep_on_credit_approved_at'
  ) AS approved_at_col;

-- 2) Admin module for explicit grant (not accounts.can_modify)
SELECT
  EXISTS (
    SELECT 1 FROM public.modules
     WHERE name = 'accounts_keep_on_credit' AND is_active = true
  ) AS keep_on_credit_module_active;

-- 3) Helpers + RPCs exist, SECURITY DEFINER where required, authenticated EXECUTE
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'accounts_mechanical_remaining_amount',
    'accounts_mechanical_short_payment_allowance',
    'accounts_mechanical_gatepass_reason',
    'accounts_mechanical_gatepass_eligible',
    'accounts_mechanical_can_keep_on_credit',
    'accounts_mechanical_user_is_gm',
    'set_accounts_mechanical_keep_on_credit',
    'issue_accounts_mechanical_gatepass',
    'add_accounts_mechanical_payment',
    'list_accounts_mechanical_cases'
  )
ORDER BY p.proname;

-- 4) 2% / paid / credit math (no live money mutation)
SELECT
  public.accounts_mechanical_remaining_amount(10000, 9850) = 150 AS remaining_150,
  public.accounts_mechanical_short_payment_allowance(10000) = 200 AS allowance_200,
  public.accounts_mechanical_gatepass_reason(10000, 10000, false) = 'paid' AS full_paid,
  public.accounts_mechanical_gatepass_reason(10000, 9801, false) = 'short_payment' AS short_1_99pct,
  public.accounts_mechanical_gatepass_reason(10000, 9800, false) = 'short_payment' AS short_exact_2pct,
  public.accounts_mechanical_gatepass_reason(10000, 9799.99, false) IS NULL AS over_2pct_denied,
  public.accounts_mechanical_gatepass_reason(10000, 9700, false) IS NULL AS remaining_300_denied,
  public.accounts_mechanical_gatepass_reason(10000, 9700, true) = 'keep_on_credit' AS credit_allows_300,
  public.accounts_mechanical_remaining_amount(3680, 3700) = 0 AS overpay_remaining_floored,
  public.accounts_mechanical_gatepass_reason(3680, 3700, false) = 'paid' AS overpay_paid_reason;

-- 5) add_payment no longer rejects or clips over-remaining
SELECT
  pg_get_functiondef(p.oid) NOT LIKE '%exceeds remaining%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%v_amount - v_remaining) <= 1%'
    AND pg_get_functiondef(p.oid) LIKE '%receipt amount must be greater than 0%'
    AS add_payment_allows_overpay
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_accounts_mechanical_payment';

-- 6) Keep on Credit setter uses GM / admin / dedicated module, not accounts.can_modify
SELECT
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_can_keep_on_credit%'
    AND pg_get_functiondef(p.oid) LIKE '%keep_on_credit_approved_by%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%has_module_modify(''accounts'')%'
    AS setter_uses_dedicated_authority
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'set_accounts_mechanical_keep_on_credit';

SELECT
  pg_get_functiondef(p.oid) LIKE '%accounts_keep_on_credit%'
    AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_user_is_gm%'
    AND pg_get_functiondef(p.oid) LIKE '%is_admin()%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%has_module_modify(''accounts'')%'
    AS can_keep_on_credit_authority
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_mechanical_can_keep_on_credit';

-- 7) Issue RPC computes eligibility; no client-supplied eligible argument
SELECT
  p.pronargs = 1 AS issue_takes_only_reception_id,
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_gatepass_reason%'
    AND pg_get_functiondef(p.oid) LIKE '%gatepass not eligible%'
    AND pg_get_functiondef(p.oid) LIKE '%customer_gatepass_payload%'
    AS issue_enforces_and_persists
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'issue_accounts_mechanical_gatepass';

-- 8) List still Mechanical-only cutoff; includes keep_on_credit; Bodyshop list untouched
SELECT
  pg_get_functiondef(p.oid) LIKE '%keep_on_credit%'
    AND pg_get_functiondef(p.oid) LIKE '%2026-09-11 00:00:00+05:30%'
    AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_remaining_amount%'
    AS mechanical_list_has_credit_and_cutoff
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_cases';

SELECT
  pg_get_functiondef(p.oid) NOT LIKE '%keep_on_credit%'
    AND pg_get_functiondef(p.oid) LIKE '%bodyshop_settlements%'
    AS bodyshop_list_unchanged_no_credit
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_bodyshop_cases';
