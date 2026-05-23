-- Temporary read-only checks for:
-- supabase/migrations/20260523153000_phase33_tighten_parts_import_rls_locksafe_retry.sql
--
-- Goal: confirm final policy state after one or more lock-safe retry runs.

-- 1) RLS enabled state for target tables
SELECT
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

-- 2) Legacy permissive policies should be gone
SELECT
  tablename,
  policyname
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

-- 3) Required new policies must all exist (exactly 16)
WITH required AS (
  SELECT * FROM (VALUES
    ('import_metadata', 'import_metadata_read_rbac_v1'),
    ('import_metadata', 'import_metadata_write_admin_v1'),
    ('part_master', 'part_master_read_rbac_v1'),
    ('part_master', 'part_master_write_admin_v1'),
    ('service_parts_consumption_data', 'service_parts_consumption_select_rbac_v1'),
    ('service_parts_consumption_data', 'service_parts_consumption_insert_rbac_v1'),
    ('service_parts_consumption_data', 'service_parts_consumption_update_rbac_v1'),
    ('service_parts_consumption_data', 'service_parts_consumption_delete_rbac_v1'),
    ('service_parts_order_data', 'service_parts_order_select_rbac_v1'),
    ('service_parts_order_data', 'service_parts_order_insert_rbac_v1'),
    ('service_parts_order_data', 'service_parts_order_update_rbac_v1'),
    ('service_parts_order_data', 'service_parts_order_delete_rbac_v1'),
    ('service_parts_stock_snapshot_data', 'service_parts_stock_select_rbac_v1'),
    ('service_parts_stock_snapshot_data', 'service_parts_stock_insert_rbac_v1'),
    ('service_parts_stock_snapshot_data', 'service_parts_stock_update_rbac_v1'),
    ('service_parts_stock_snapshot_data', 'service_parts_stock_delete_rbac_v1')
  ) AS t(tablename, policyname)
), actual AS (
  SELECT tablename, policyname
  FROM pg_policies
  WHERE schemaname = 'public'
)
SELECT
  r.tablename,
  r.policyname,
  CASE WHEN a.policyname IS NULL THEN false ELSE true END AS present
FROM required r
LEFT JOIN actual a
  ON a.tablename = r.tablename
 AND a.policyname = r.policyname
ORDER BY r.tablename, r.policyname;

-- 4) Summary status, should return READY only when complete
WITH required AS (
  SELECT * FROM (VALUES
    ('import_metadata', 'import_metadata_read_rbac_v1'),
    ('import_metadata', 'import_metadata_write_admin_v1'),
    ('part_master', 'part_master_read_rbac_v1'),
    ('part_master', 'part_master_write_admin_v1'),
    ('service_parts_consumption_data', 'service_parts_consumption_select_rbac_v1'),
    ('service_parts_consumption_data', 'service_parts_consumption_insert_rbac_v1'),
    ('service_parts_consumption_data', 'service_parts_consumption_update_rbac_v1'),
    ('service_parts_consumption_data', 'service_parts_consumption_delete_rbac_v1'),
    ('service_parts_order_data', 'service_parts_order_select_rbac_v1'),
    ('service_parts_order_data', 'service_parts_order_insert_rbac_v1'),
    ('service_parts_order_data', 'service_parts_order_update_rbac_v1'),
    ('service_parts_order_data', 'service_parts_order_delete_rbac_v1'),
    ('service_parts_stock_snapshot_data', 'service_parts_stock_select_rbac_v1'),
    ('service_parts_stock_snapshot_data', 'service_parts_stock_insert_rbac_v1'),
    ('service_parts_stock_snapshot_data', 'service_parts_stock_update_rbac_v1'),
    ('service_parts_stock_snapshot_data', 'service_parts_stock_delete_rbac_v1')
  ) AS t(tablename, policyname)
), actual AS (
  SELECT tablename, policyname
  FROM pg_policies
  WHERE schemaname = 'public'
), legacy AS (
  SELECT count(*) AS legacy_count
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
), present AS (
  SELECT count(*) AS present_count
  FROM required r
  JOIN actual a
    ON a.tablename = r.tablename
   AND a.policyname = r.policyname
), rls_ok AS (
  SELECT count(*) AS rls_count
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
    AND c.relrowsecurity = true
)
SELECT
  CASE
    WHEN legacy.legacy_count = 0
     AND present.present_count = 16
     AND rls_ok.rls_count = 5
    THEN 'READY'
    ELSE 'INCOMPLETE_RERUN_LOCKSAFE_MIGRATION'
  END AS phase33_status,
  legacy.legacy_count,
  present.present_count,
  rls_ok.rls_count
FROM legacy, present, rls_ok;
