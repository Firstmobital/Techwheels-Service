-- Temporary read-only verification checks for:
-- supabase/migrations/20260523143000_phase33_tighten_parts_import_rls.sql
--
-- Run after applying migration. Share output for verification review.

-- 1) Confirm RLS is enabled on target tables
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'import_metadata',
    'part_master',
    'service_parts_consumption_data',
    'service_parts_order_data',
    'service_parts_stock_snapshot_data'
  )
ORDER BY c.relname;

-- Expected: 5 rows, all rls_enabled = true

-- 2) Confirm legacy permissive policies are removed
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'import_metadata_insert_anon',
    'import_metadata_select_anon',
    'import_metadata_update_anon',
    'part_master_insert_anon',
    'part_master_select_anon',
    'part_master_update_anon',
    'parts_consumption_delete_anon',
    'parts_consumption_insert_anon',
    'parts_consumption_select_anon',
    'parts_consumption_update_anon',
    'parts_order_delete_anon',
    'parts_order_insert_anon',
    'parts_order_select_anon',
    'parts_order_update_anon',
    'parts_stock_delete_anon',
    'parts_stock_insert_anon',
    'parts_stock_select_anon',
    'parts_stock_update_anon'
  )
ORDER BY tablename, policyname;

-- Expected: 0 rows

-- 3) Confirm new RBAC policies exist on each table
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'import_metadata',
    'part_master',
    'service_parts_consumption_data',
    'service_parts_order_data',
    'service_parts_stock_snapshot_data'
  )
ORDER BY tablename, policyname;

-- Expected: only *_rbac_v1 / *_admin_v1 style policies for these tables

-- 4) Sanity check policy expressions include helper functions
SELECT
  tablename,
  policyname,
  COALESCE(qual, '') AS using_expr,
  COALESCE(with_check, '') AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'import_metadata',
    'part_master',
    'service_parts_consumption_data',
    'service_parts_order_data',
    'service_parts_stock_snapshot_data'
  )
ORDER BY tablename, policyname;

-- Expected: expressions reference public.is_admin()/public.has_module_* and
-- service_parts_order_data policies include dealer_code guard

-- 5) Table-level smoke checks (should run; row counts depend on caller)
SELECT count(*) AS import_metadata_rows FROM public.import_metadata;
SELECT count(*) AS part_master_rows FROM public.part_master;
SELECT count(*) AS parts_consumption_rows FROM public.service_parts_consumption_data;
SELECT count(*) AS parts_order_rows FROM public.service_parts_order_data;
SELECT count(*) AS parts_stock_rows FROM public.service_parts_stock_snapshot_data;
