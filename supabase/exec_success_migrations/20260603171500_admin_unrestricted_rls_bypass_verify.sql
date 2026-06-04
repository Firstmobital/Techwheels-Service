-- Verification queries for 20260603170500_admin_unrestricted_rls_bypass.sql
-- Run after migration execution to confirm policies are present and admin-bypass clauses exist.

-- 1) Touched policy names should exist.
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE (schemaname, tablename, policyname) IN (
  ('public', 'service_parts_order_data', 'service_parts_order_select_rbac_v1'),
  ('public', 'service_parts_order_data', 'service_parts_order_insert_rbac_v1'),
  ('public', 'service_parts_order_data', 'service_parts_order_update_rbac_v1'),
  ('public', 'service_parts_order_data', 'service_parts_order_delete_rbac_v1'),
  ('public', 'service_reception_entries', 'service_reception_select_rbac'),
  ('public', 'service_reception_entries', 'service_reception_insert_rbac'),
  ('public', 'service_reception_entries', 'service_reception_update_rbac'),
  ('public', 'service_reception_entries', 'service_reception_delete_rbac'),
  ('public', 'settings_model_options', 'settings_model_options_select_v1'),
  ('public', 'settings_model_options', 'settings_model_options_insert_v1'),
  ('public', 'settings_model_options', 'settings_model_options_update_v1'),
  ('public', 'settings_model_options', 'settings_model_options_delete_v1'),
  ('public', 'vehicles', 'vehicles: own dealership select'),
  ('public', 'vehicles', 'vehicles: own dealership insert'),
  ('public', 'vehicles', 'vehicles: own dealership update'),
  ('storage', 'objects', 'autodoc objects: own dealer read'),
  ('storage', 'objects', 'autodoc objects: own dealer insert'),
  ('storage', 'objects', 'autodoc objects: own dealer update'),
  ('storage', 'objects', 'autodoc objects: own dealer delete')
)
ORDER BY schemaname, tablename, policyname;

-- 2) Count policies containing explicit is_admin() bypass on touched tables.
SELECT schemaname, tablename, COUNT(*) AS admin_bypass_policy_count
FROM pg_policies
WHERE (schemaname, tablename) IN (
  ('public', 'service_parts_order_data'),
  ('public', 'service_reception_entries'),
  ('public', 'settings_model_options'),
  ('public', 'vehicles'),
  ('storage', 'objects')
)
AND (
  COALESCE(qual, '') ILIKE '%is_admin()%'
  OR COALESCE(with_check, '') ILIKE '%is_admin()%'
)
GROUP BY schemaname, tablename
ORDER BY schemaname, tablename;
