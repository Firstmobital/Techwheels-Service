-- Read-only verification checks for:
-- supabase/migrations/20260916161000_bodyshop_do_allow_extra_over_do.sql

-- 1) Post RPC still SECURITY DEFINER + authenticated EXECUTE, no DO cap
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  pg_get_functiondef(p.oid) NOT LIKE '%cannot exceed DO amount%' AS do_extra_allowed
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_bodyshop_settlement_line';

-- 2) Recalc clamps insurance due at 0 when Released > DO
SELECT
  pg_get_functiondef(p.oid) LIKE '%GREATEST%'
  AND pg_get_functiondef(p.oid) LIKE '%insurance_due_amount%'
    AS due_clamped_at_zero
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'recalc_bodyshop_settlement';
