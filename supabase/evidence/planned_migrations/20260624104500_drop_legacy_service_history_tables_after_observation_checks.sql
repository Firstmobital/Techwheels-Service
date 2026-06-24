-- PLANNED read-only checks for hard-drop readiness of legacy service-history tables.

-- 1) Trigger/functions/views should not reference legacy table names anymore.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  position('"EV_Service_History"' in pg_get_functiondef(p.oid)) > 0 AS mentions_ev_legacy,
  position('"PV_Service_History"' in pg_get_functiondef(p.oid)) > 0 AS mentions_pv_legacy
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    position('"EV_Service_History"' in pg_get_functiondef(p.oid)) > 0
    OR position('"PV_Service_History"' in pg_get_functiondef(p.oid)) > 0
  )
ORDER BY p.proname;

-- 2) Ensure no user-defined triggers are attached to legacy tables.
SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND t.tgisinternal = false
  AND c.relname IN ('EV_Service_History', 'PV_Service_History')
ORDER BY c.relname, t.tgname;

-- 3) Optional final data snapshot before drop.
SELECT
  (SELECT COUNT(*) FROM public."EV_Service_History") AS ev_legacy_rows,
  (SELECT COUNT(*) FROM public."PV_Service_History") AS pv_legacy_rows;
