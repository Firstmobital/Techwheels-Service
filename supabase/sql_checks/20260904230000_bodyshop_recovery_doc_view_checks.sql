-- Read-only verification checks for:
-- supabase/migrations/20260904230000_bodyshop_recovery_doc_view.sql
-- Execution: This file can be run in one go.

SELECT EXISTS (
  SELECT 1
  FROM pg_policy
  WHERE polrelid = 'storage.objects'::regclass
    AND polname = 'autodoc objects: recovery read'
    AND polcmd = 'r'
) AS recovery_storage_read;

SELECT
  pg_get_functiondef(p.oid) LIKE '%drive_file_id%' AS case_selects_drive_file_id,
  pg_get_functiondef(p.oid) LIKE '%doc.id%' AS case_selects_doc_id
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_bodyshop_recovery_case';

SELECT
  pg_get_functiondef(p.oid) LIKE '%sl.id%' AS export_selects_line_id,
  pg_get_functiondef(p.oid) LIKE '%ORDER BY l.repair_card_id, l.created_at, l.id%' AS export_orders_by_line_id
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'export_bodyshop_do_recovery';
