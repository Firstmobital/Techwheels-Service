-- Read-only verification checks for:
-- supabase/migrations/20260624190000_drop_legacy_service_and_vehicle_source_tables.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; final validation should be based on full-run output.

-- 1) Dropped-table existence check (all must be NULL).
SELECT
  to_regclass('public."EV_Service_History"') AS ev_service_history_regclass,
  to_regclass('public."PV_Service_History"') AS pv_service_history_regclass,
  to_regclass('public."EV_Vehicle_Data"') AS ev_vehicle_data_regclass,
  to_regclass('public."PV_Vehicle_Data"') AS pv_vehicle_data_regclass;

-- 2) Hard assertion summary (expected: dropped_table_count = 4, remaining_table_count = 0).
SELECT
  COUNT(*) FILTER (WHERE to_regclass(tbl) IS NULL) AS dropped_table_count,
  COUNT(*) FILTER (WHERE to_regclass(tbl) IS NOT NULL) AS remaining_table_count
FROM (
  VALUES
    ('public."EV_Service_History"'),
    ('public."PV_Service_History"'),
    ('public."EV_Vehicle_Data"'),
    ('public."PV_Vehicle_Data"')
) v(tbl);

-- 3) Guardrail scan: no public function definitions should still mention dropped tables.
SELECT
  p.oid::regprocedure::text AS function_signature,
  n.nspname AS schema_name,
  p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    position('"EV_Service_History"' IN pg_get_functiondef(p.oid)) > 0
    OR position('"PV_Service_History"' IN pg_get_functiondef(p.oid)) > 0
    OR position('"EV_Vehicle_Data"' IN pg_get_functiondef(p.oid)) > 0
    OR position('"PV_Vehicle_Data"' IN pg_get_functiondef(p.oid)) > 0
  )
ORDER BY 1;

-- 4) Guardrail scan: no trigger should be attached to any dropped table names.
SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND t.tgisinternal = false
  AND c.relname IN (
    'EV_Service_History',
    'PV_Service_History',
    'EV_Vehicle_Data',
    'PV_Vehicle_Data'
  )
ORDER BY c.relname, t.tgname;
