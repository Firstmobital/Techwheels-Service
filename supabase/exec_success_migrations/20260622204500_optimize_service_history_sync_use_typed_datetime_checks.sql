-- Read-only checks for optimized Service_History realtime sync using typed datetime.
--
-- Migration under test:
-- supabase/migrations/20260622204500_optimize_service_history_sync_use_typed_datetime.sql
--
-- Run sequence:
-- - Run after applying migration 20260622204500.

-- ============================================================
-- A) Trigger presence on both source tables
-- ============================================================

SELECT
  c.relname AS source_table,
  t.tgname,
  pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_class c
  ON c.oid = t.tgrelid
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('EV_Service_History', 'PV_Service_History')
  AND NOT t.tgisinternal
  AND t.tgname IN (
    'trg_sync_all_service_data_from_ev_service_history',
    'trg_sync_all_service_data_from_pv_service_history'
  )
ORDER BY c.relname, t.tgname;

-- ============================================================
-- B) Function presence
-- ============================================================

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_function_result(p.oid) AS returns_type
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'refresh_all_service_data_from_service_history',
    'trg_sync_all_service_data_from_service_history'
  )
ORDER BY p.proname, args;

-- ============================================================
-- C) Optimization proof: refresh function no longer parses service_date_time text
-- ============================================================

SELECT
  CASE
    WHEN strpos(pg_get_functiondef(p.oid), 'parse_service_history_datetime_ist(') = 0 THEN true
    ELSE false
  END AS uses_typed_service_date_time_path,
  strpos(pg_get_functiondef(p.oid), 'su.service_date_time AS parsed_service_at') > 0 AS direct_typed_assignment_present
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'refresh_all_service_data_from_service_history'
ORDER BY p.oid DESC
LIMIT 1;

-- ============================================================
-- D) Source type guard (must already be timestamptz)
-- ============================================================

SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  (c.data_type = 'timestamp with time zone') AS type_ok
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('EV_Service_History', 'PV_Service_History')
  AND c.column_name IN ('service_date_time', 'created_at')
ORDER BY c.table_name, c.column_name;
