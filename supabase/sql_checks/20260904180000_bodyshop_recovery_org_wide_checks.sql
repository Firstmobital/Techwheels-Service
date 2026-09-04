-- Read-only verification checks for:
-- supabase/migrations/20260904180000_bodyshop_recovery_org_wide.sql
-- Execution: This file can be run in one go.

-- 1) List RPC has no dealer/branch/fuel predicate
SELECT
  pg_get_functiondef(p.oid) NOT LIKE '%dealer_code_in_scope%' AS list_is_org_wide,
  pg_get_functiondef(p.oid) LIKE '%insurance_due_amount%' AS still_do_only
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';

-- 2) Recovery view short-circuits can_view before dealer scope
SELECT
  pg_get_functiondef(p.oid) LIKE '%bodyshop_recovery%' AS mentions_recovery,
  position('has_module_view(''bodyshop_recovery'')' in pg_get_functiondef(p.oid))
    < position('dealer_code_in_scope' in pg_get_functiondef(p.oid)) AS recovery_before_dealer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'bodyshop_settlement_can_view';
