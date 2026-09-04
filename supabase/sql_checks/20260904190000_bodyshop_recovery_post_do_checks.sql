-- Read-only verification checks for:
-- supabase/migrations/20260904190000_bodyshop_recovery_post_do.sql
-- Execution: This file can be run in one go.

-- 1) Recovery can post DO; customer path still requires repair modify
SELECT
  pg_get_functiondef(p.oid) LIKE '%bodyshop_settlement_can_post_do%' AS do_uses_recovery,
  pg_get_functiondef(p.oid) LIKE '%requires bodyshop_repair modify%' AS customer_still_repair
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';

-- 2) can_post_do short-circuits recovery before dealer
SELECT
  pg_get_functiondef(p.oid) LIKE '%bodyshop_recovery%' AS mentions_recovery,
  pg_get_functiondef(p.oid) NOT LIKE '%dealer_code_in_scope%' AS recovery_org_wide
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'bodyshop_settlement_can_post_do';

-- 3) can_modify is still repair + dealer (no recovery short-circuit)
SELECT
  pg_get_functiondef(p.oid) LIKE '%has_module_modify(''bodyshop_repair'')%' AS still_repair_modify,
  pg_get_functiondef(p.oid) NOT LIKE '%bodyshop_recovery%' AS no_recovery_bypass
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'bodyshop_settlement_can_modify';

-- 4) Case RPC present
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_bodyshop_recovery_case';
