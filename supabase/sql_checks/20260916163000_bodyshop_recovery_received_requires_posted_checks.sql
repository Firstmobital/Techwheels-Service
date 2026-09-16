-- Read-only verification checks for:
-- supabase/migrations/20260916163000_bodyshop_recovery_received_requires_posted.sql

SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';

SELECT
  pg_get_functiondef(p.oid) LIKE '%do_payment_status%' AS has_received_status,
  pg_get_functiondef(p.oid) LIKE '%do_released_amount%' AS requires_posted_release,
  pg_get_functiondef(p.oid) LIKE '%insurance_due_amount, 0) > 0%' AS keeps_open_due,
  pg_get_functiondef(p.oid) LIKE '%cancelled%' AS hides_cancelled,
  pg_get_functiondef(p.oid) NOT LIKE '%customer_remaining_amount%' AS still_do_only
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';
