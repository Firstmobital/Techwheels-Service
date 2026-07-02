-- Read-only verification checks for:
-- supabase/migrations/20260702100000_post_service_feedback_cre.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) New CRE columns on post_service_feedback_messages exist with expected defaults.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'post_service_feedback_messages'
  AND column_name IN ('cre_status', 'resolved_at', 'resolved_by_id', 'resolved_by_name')
ORDER BY column_name;

-- 2) cre_status check constraint present.
SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.post_service_feedback_messages'::regclass
  AND conname = 'psfm_cre_status_check';

-- 3) post_service_feedback_remarks table exists with expected columns/FK.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'post_service_feedback_remarks'
ORDER BY ordinal_position;

SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.post_service_feedback_remarks'::regclass
ORDER BY conname;

-- 4) Queue view exists and is queryable (row count informational).
SELECT COUNT(*) AS cre_queue_row_count
FROM public.post_service_feedback_cre_queue;

-- 5) View definition sanity — confirms rating<=3 / responded filter and SA join.
SELECT pg_get_viewdef('public.post_service_feedback_cre_queue'::regclass, true) AS view_def;

-- 6) RPCs exist as SECURITY DEFINER and are granted to authenticated.
SELECT
  p.proname,
  p.prosecdef AS is_security_definer,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('psf_add_remark', 'psf_mark_resolved')
ORDER BY p.proname;

SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN ('psf_add_remark', 'psf_mark_resolved')
  AND grantee = 'authenticated';

-- 7) RLS is enabled on both tables, with exactly the expected SELECT-only policies.
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('post_service_feedback_messages', 'post_service_feedback_remarks');

SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('post_service_feedback_messages', 'post_service_feedback_remarks')
ORDER BY tablename, policyname;

-- 8) Module registered.
SELECT id, name, label, route, sort_order, is_active
FROM public.modules
WHERE name = 'post_service_feedback_cre';
