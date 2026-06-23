-- Read-only verification checks for:
-- supabase/migrations/20260623123000_all_service_dynamic_daily_reconcile_and_assumed_backfill.sql

-- 1) Function exists.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'refresh_all_service_data_dynamic_full';

-- 2) Cron job exists and is active.
SELECT
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname = 'all-service-data-dynamic-daily-reconcile';

-- 3) Rows with calculable assumed_next_service_date but stored NULL (should be 0 after backfill).
SELECT COUNT(*) AS assumed_date_backfill_gaps
FROM public.all_service_data a
WHERE a.assumed_next_service_date IS NULL
  AND public.calc_all_service_assumed_next_service_date(
    a.last_service_date,
    a.last_service_type,
    current_date
  ) IS NOT NULL;

-- 4) Predicate parity (expected == dynamic) overall and EV/PV split.
WITH expected AS (
  SELECT
    a.id,
    CASE
      WHEN upper(COALESCE(a.product_line, '')) LIKE '%EV%' THEN 'EV'
      ELSE 'PV'
    END AS expected_fuel_tp
  FROM public.all_service_data a
  WHERE public.is_all_service_dynamic_match(a)
), dynamic_rows AS (
  SELECT id, fuel_tp
  FROM public.all_service_data_dynamic
)
SELECT
  (SELECT COUNT(*) FROM expected) AS expected_total,
  (SELECT COUNT(*) FROM dynamic_rows) AS dynamic_total,
  (SELECT COUNT(*) FROM expected e WHERE e.expected_fuel_tp = 'EV') AS expected_ev,
  (SELECT COUNT(*) FROM dynamic_rows d WHERE d.fuel_tp = 'EV') AS dynamic_ev,
  (SELECT COUNT(*) FROM expected e WHERE e.expected_fuel_tp = 'PV') AS expected_pv,
  (SELECT COUNT(*) FROM dynamic_rows d WHERE d.fuel_tp = 'PV') AS dynamic_pv;

-- 5) Any rows expected but missing from dynamic (should be 0).
SELECT COUNT(*) AS expected_missing_in_dynamic
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a)
  AND NOT EXISTS (
    SELECT 1
    FROM public.all_service_data_dynamic d
    WHERE d.id = a.id
  );

-- 6) Any rows in dynamic that no longer match predicate (should be 0).
SELECT COUNT(*) AS stale_dynamic_rows
FROM public.all_service_data_dynamic d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.all_service_data a
  WHERE a.id = d.id
    AND public.is_all_service_dynamic_match(a)
);

-- 7) Focus check for known row id 19952.
SELECT
  a.id,
  a.chassis_no,
  a.product_line,
  a.last_service_type,
  a.last_service_date,
  a.assumed_next_service_date AS stored_assumed_next_service_date,
  public.calc_all_service_assumed_next_service_date(
    a.last_service_date,
    a.last_service_type,
    current_date
  ) AS recalculated_assumed_next_service_date,
  public.is_all_service_dynamic_match(a) AS predicate_match,
  EXISTS (
    SELECT 1
    FROM public.all_service_data_dynamic d
    WHERE d.id = a.id
  ) AS exists_in_dynamic
FROM public.all_service_data a
WHERE a.id = 19952;
