-- Read-only verification checks for:
-- supabase/migrations/20260623153000_rewire_service_history_realtime_sync_to_test_tables.sql

-- 1) Function exists and no longer references legacy source table names.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  position('"EV_service_history_test"' in pg_get_functiondef(p.oid)) > 0 AS uses_ev_test,
  position('"PV_service_history_test"' in pg_get_functiondef(p.oid)) > 0 AS uses_pv_test,
  position('"EV_Service_History"' in pg_get_functiondef(p.oid)) > 0 AS still_uses_ev_legacy,
  position('"PV_Service_History"' in pg_get_functiondef(p.oid)) > 0 AS still_uses_pv_legacy,
  position('last_service_at' in pg_get_functiondef(p.oid)) > 0 AS still_references_last_service_at
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'refresh_all_service_data_from_service_history';

-- 2) Trigger bindings should exist on test tables.
SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_def
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

-- 3) Legacy tables should no longer carry these realtime triggers.
SELECT
  c.relname AS legacy_table_name,
  t.tgname AS legacy_trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND t.tgisinternal = false
  AND c.relname IN ('EV_Service_History', 'PV_Service_History')
  AND t.tgname IN (
    'trg_sync_all_service_data_from_ev_service_history',
    'trg_sync_all_service_data_from_pv_service_history'
  );

-- 4) Sanity: test sources currently have rows.
SELECT
  (SELECT COUNT(*) FROM public."EV_service_history_test") AS ev_test_rows,
  (SELECT COUNT(*) FROM public."PV_service_history_test") AS pv_test_rows;
