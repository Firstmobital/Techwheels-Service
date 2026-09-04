-- Read-only verification checks for:
-- supabase/migrations/20260904210000_bodyshop_recovery_case_doc_id.sql
-- Execution: This file can be run in one go.

SELECT
  pg_get_functiondef(p.oid) LIKE '%doc.id%' AS selects_doc_id,
  pg_get_functiondef(p.oid) LIKE '%ORDER BY d.uploaded_at DESC, d.id DESC%' AS orders_by_id
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_bodyshop_recovery_case';
