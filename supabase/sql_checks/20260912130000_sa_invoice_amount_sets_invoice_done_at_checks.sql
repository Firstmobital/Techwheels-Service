-- Read-only verification checks for:
-- supabase/migrations/20260912130000_sa_invoice_amount_sets_invoice_done_at.sql

-- 1) Save RPC still SECURITY DEFINER + authenticated EXECUTE
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_save_reception_entry';

-- 2) Save writes invoice_done_at only when NULL, on qualifying amount
SELECT
  pg_get_functiondef(p.oid) LIKE '%invoice_done_at%'
  AND pg_get_functiondef(p.oid) LIKE '%invoice_done_by%'
  AND pg_get_functiondef(p.oid) LIKE '%v_can_complete%'
  AND pg_get_functiondef(p.oid) LIKE '%sre.invoice_done_at IS NULL%'
    AS save_sets_invoice_done_once
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_save_reception_entry';

-- 3) Exceptions and zero-allowed (NOT NULL amount, including 0)
SELECT
  pg_get_functiondef(p.oid) LIKE '%accident%'
  AND pg_get_functiondef(p.oid) LIKE '%rusting%'
  AND pg_get_functiondef(p.oid) LIKE '%v_amount IS NOT NULL%'
    AS save_skips_exceptions_allows_zero
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_save_reception_entry';

-- 4) Accounts eligibility still uses invoice_done_at (unchanged)
SELECT
  pg_get_functiondef(p.oid) LIKE '%invoice_done_at IS NOT NULL%'
  AND pg_get_functiondef(p.oid) LIKE '%is_floor_incharge_service_type%'
    AS accounts_still_uses_invoice_done_at
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_cases';
