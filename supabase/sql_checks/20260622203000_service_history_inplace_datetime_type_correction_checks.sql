-- Read-only validation checks for Service_History in-place datetime type correction.
--
-- Migration under test:
-- supabase/migrations/20260622203000_service_history_inplace_datetime_type_correction.sql
--
-- Run sequence:
-- - Run Sections A+B before migration (baseline types and parse coverage).
-- - Apply migration 20260622203000.
-- - Run Sections C+D+E+F after migration.

-- ============================================================
-- A) Baseline type snapshot (before apply)
-- ============================================================

SELECT
  c.table_name,
  c.column_name,
  c.data_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('EV_Service_History', 'PV_Service_History')
  AND c.column_name IN ('service_date_time', 'created_at')
ORDER BY c.table_name, c.column_name;

-- ============================================================
-- B) Baseline parse coverage for legacy text service_date_time
-- ============================================================

CREATE OR REPLACE FUNCTION pg_temp.parse_service_history_datetime_ist(p_text text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
  m text[];
  dd integer;
  mm integer;
  yy integer;
  hh integer;
  mi integer;
  ampm text;
  hh24 integer;
BEGIN
  v := nullif(upper(btrim(coalesce(p_text, ''))), '');

  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  m := regexp_match(v, '^([0-9]{2})/([0-9]{2})/([0-9]{4})\s+([0-9]{1,2}):([0-9]{2})\s*(AM|PM)$');

  IF m IS NULL THEN
    RETURN NULL;
  END IF;

  dd := m[1]::integer;
  mm := m[2]::integer;
  yy := m[3]::integer;
  hh := m[4]::integer;
  mi := m[5]::integer;
  ampm := m[6];

  IF hh < 1 OR hh > 12 OR mi < 0 OR mi > 59 THEN
    RETURN NULL;
  END IF;

  IF ampm = 'AM' THEN
    hh24 := CASE WHEN hh = 12 THEN 0 ELSE hh END;
  ELSE
    hh24 := CASE WHEN hh = 12 THEN 12 ELSE hh + 12 END;
  END IF;

  RETURN make_timestamptz(yy, mm, dd, hh24, mi, 0, 'Asia/Kolkata');
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

WITH src AS (
  SELECT 'EV_Service_History'::text AS table_name, service_date_time::text AS service_date_time
  FROM public."EV_Service_History"
  UNION ALL
  SELECT 'PV_Service_History'::text AS table_name, service_date_time::text AS service_date_time
  FROM public."PV_Service_History"
)
SELECT
  table_name,
  count(*) AS total_rows,
  count(*) FILTER (
    WHERE nullif(btrim(coalesce(service_date_time, '')), '') IS NOT NULL
  ) AS non_null_service_date_time,
  count(*) FILTER (
    WHERE nullif(btrim(coalesce(service_date_time, '')), '') IS NOT NULL
      AND pg_temp.parse_service_history_datetime_ist(service_date_time) IS NOT NULL
  ) AS parseable_service_date_time,
  count(*) FILTER (
    WHERE nullif(btrim(coalesce(service_date_time, '')), '') IS NOT NULL
      AND pg_temp.parse_service_history_datetime_ist(service_date_time) IS NULL
  ) AS non_parseable_service_date_time
FROM src
GROUP BY table_name
ORDER BY table_name;

-- ============================================================
-- C) Post-apply type verification (must all match expected)
-- ============================================================

SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  CASE
    WHEN c.column_name IN ('service_date_time', 'created_at')
      AND c.data_type = 'timestamp with time zone' THEN true
    ELSE false
  END AS matches_expected_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('EV_Service_History', 'PV_Service_History')
  AND c.column_name IN ('service_date_time', 'created_at')
ORDER BY c.table_name, c.column_name;

-- ============================================================
-- D) Post-apply non-null + type runtime sanity
-- ============================================================

SELECT
  'EV_Service_History'::text AS table_name,
  count(*) AS total_rows,
  count(service_date_time) AS service_date_time_non_null,
  count(created_at) AS created_at_non_null,
  pg_typeof(max(service_date_time))::text AS service_date_time_runtime_type,
  pg_typeof(max(created_at))::text AS created_at_runtime_type
FROM public."EV_Service_History"
UNION ALL
SELECT
  'PV_Service_History'::text AS table_name,
  count(*) AS total_rows,
  count(service_date_time) AS service_date_time_non_null,
  count(created_at) AS created_at_non_null,
  pg_typeof(max(service_date_time))::text AS service_date_time_runtime_type,
  pg_typeof(max(created_at))::text AS created_at_runtime_type
FROM public."PV_Service_History";

-- ============================================================
-- E) Sample rows for manual inspection
-- ============================================================

SELECT
  'EV_Service_History'::text AS table_name,
  id,
  chassis_no,
  service_date_time,
  created_at
FROM public."EV_Service_History"
ORDER BY created_at DESC NULLS LAST
LIMIT 20;

SELECT
  'PV_Service_History'::text AS table_name,
  id,
  chassis_no,
  service_date_time,
  created_at
FROM public."PV_Service_History"
ORDER BY created_at DESC NULLS LAST
LIMIT 20;

-- ============================================================
-- F) Parser/function compatibility checks (after apply)
-- ============================================================

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_function_result(p.oid) AS returns_type
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'parse_service_history_datetime_ist'
ORDER BY p.oid;

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) AS function_def
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'refresh_all_service_data_from_service_history'
ORDER BY p.oid DESC
LIMIT 1;
