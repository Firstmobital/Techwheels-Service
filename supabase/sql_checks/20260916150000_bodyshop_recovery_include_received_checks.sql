-- Read-only verification checks for:
-- supabase/migrations/20260916150000_bodyshop_recovery_include_received.sql

-- 1) RPC still SECURITY DEFINER + authenticated EXECUTE
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';

-- 2) Includes received / due ₹0 and still hides cancelled. Not customer remaining.
SELECT
  pg_get_functiondef(p.oid) LIKE '%no recovery needed%' AS includes_received_book,
  pg_get_functiondef(p.oid) LIKE '%cancelled%' AS hides_cancelled,
  pg_get_functiondef(p.oid) NOT LIKE '%insurance_due_amount, 0) > 0%' AS open_due_not_required,
  pg_get_functiondef(p.oid) NOT LIKE '%customer_remaining_amount%' AS still_do_only
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';
