-- Read-only verification checks for:
-- supabase/migrations/20260916170000_reception_delete_requires_module_delete.sql

-- 1) RPC still SECURITY DEFINER + authenticated EXECUTE
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'delete_reception_entry_cascade';

-- 2) Permission gate matches table DELETE RLS
SELECT
  pg_get_functiondef(p.oid) LIKE '%has_module_delete%reception%'
  AND pg_get_functiondef(p.oid) LIKE '%dealer_code_in_scope%'
  AND pg_get_functiondef(p.oid) LIKE '%permission denied: requires reception delete or admin%'
    AS delete_requires_reception_delete
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'delete_reception_entry_cascade';

-- 3) Cancelled-repair path is still allowed
SELECT
  pg_get_functiondef(p.oid) LIKE '%cancelled%'
    AS allows_cancelled
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'delete_reception_entry_cascade';
