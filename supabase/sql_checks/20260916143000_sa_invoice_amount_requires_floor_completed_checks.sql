-- Read-only verification checks for:
-- supabase/migrations/20260916143000_sa_invoice_amount_requires_floor_completed.sql

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

-- 2) Floor completed gate is in the save RPC
SELECT
  pg_get_functiondef(p.oid) LIKE '%technician_assignments%'
  AND pg_get_functiondef(p.oid) LIKE '%v_floor_completed%'
  AND pg_get_functiondef(p.oid) LIKE '%work_status%'
    AS save_requires_floor_completed
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_save_reception_entry';

-- 3) Completion still writes invoice_done_at only when NULL
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

-- 4) Exceptions and zero-allowed (NOT NULL amount, including 0)
SELECT
  pg_get_functiondef(p.oid) LIKE '%accident%'
  AND pg_get_functiondef(p.oid) LIKE '%rusting%'
  AND pg_get_functiondef(p.oid) LIKE '%v_amount IS NOT NULL%'
    AS save_skips_exceptions_allows_zero
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_save_reception_entry';
