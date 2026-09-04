-- Read-only verification checks for:
-- supabase/migrations/20260904170000_bodyshop_recovery_do_book.sql
-- Execution: This file can be run in one go.

-- 1) Module registered
SELECT name, label, route, is_active
FROM public.modules
WHERE name = 'bodyshop_recovery';

-- 2) RPC exists, SECURITY DEFINER, executable by authenticated
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';

-- 3) View helper includes bodyshop_recovery
SELECT pg_get_functiondef(p.oid) LIKE '%bodyshop_recovery%' AS can_view_includes_recovery
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'bodyshop_settlement_can_view';

-- 4) Open-row predicate is insurance due only (no customer remaining)
SELECT pg_get_functiondef(p.oid) LIKE '%insurance_due_amount%'
   AND pg_get_functiondef(p.oid) NOT LIKE '%customer_remaining_amount%' AS do_only
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';
