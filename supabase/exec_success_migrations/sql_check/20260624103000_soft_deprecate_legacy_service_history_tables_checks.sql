-- Read-only verification checks for:
-- supabase/migrations/20260624103000_soft_deprecate_legacy_service_history_tables.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; final validation should be based on full-run output.

-- 1) Legacy table comments must indicate deprecation.
SELECT
  c.relname AS table_name,
  obj_description(c.oid, 'pg_class') AS table_comment,
  (obj_description(c.oid, 'pg_class') ILIKE '%deprecated%') AS has_deprecated_marker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('EV_Service_History', 'PV_Service_History')
ORDER BY c.relname;

-- 2) App-facing roles should not have write privileges on legacy tables.
SELECT
  role_name,
  table_name,
  has_table_privilege(role_name, table_name, 'INSERT') AS can_insert,
  has_table_privilege(role_name, table_name, 'UPDATE') AS can_update,
  has_table_privilege(role_name, table_name, 'DELETE') AS can_delete,
  has_table_privilege(role_name, table_name, 'TRUNCATE') AS can_truncate
FROM (
  VALUES
    ('anon', 'public."EV_Service_History"'),
    ('authenticated', 'public."EV_Service_History"'),
    ('anon', 'public."PV_Service_History"'),
    ('authenticated', 'public."PV_Service_History"')
) AS v(role_name, table_name)
ORDER BY role_name, table_name;

-- 3) Guardrail: realtime sync triggers must still be on *_test tables, not legacy tables.
SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND t.tgisinternal = false
  AND t.tgname IN (
    'trg_sync_all_service_data_from_ev_service_history',
    'trg_sync_all_service_data_from_pv_service_history'
  )
ORDER BY c.relname, t.tgname;

-- 4) Data-retention snapshot for deprecation window monitoring.
SELECT
  (SELECT COUNT(*) FROM public."EV_Service_History") AS ev_legacy_rows,
  (SELECT COUNT(*) FROM public."PV_Service_History") AS pv_legacy_rows,
  (SELECT COUNT(*) FROM public."EV_service_history_test") AS ev_test_rows,
  (SELECT COUNT(*) FROM public."PV_service_history_test") AS pv_test_rows;
