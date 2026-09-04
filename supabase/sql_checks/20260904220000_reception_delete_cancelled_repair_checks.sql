-- Read-only verification checks for:
-- supabase/migrations/20260904220000_reception_delete_cancelled_repair.sql
-- Execution: This file can be run in one go.

SELECT
  pg_get_functiondef(p.oid) LIKE '%cancelled%' AS allows_cancelled
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'delete_reception_entry_cascade';

SELECT
  pg_get_functiondef(p.oid) LIKE '%cancelled%' AS hides_cancelled
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_bodyshop_do_recovery';
