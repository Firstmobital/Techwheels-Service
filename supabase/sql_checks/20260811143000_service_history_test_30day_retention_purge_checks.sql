-- Post-apply checks for 20260811143000_service_history_test_30day_retention_purge.sql

-- 1) Retention indexes
SELECT
  i.relname AS index_name,
  t.relname AS table_name
FROM pg_class i
JOIN pg_index x ON x.indexrelid = i.oid
JOIN pg_class t ON t.oid = x.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND i.relname IN (
    'idx_ev_service_history_test_created_at',
    'idx_pv_service_history_test_created_at'
  )
ORDER BY i.relname;

-- Expect: both index rows present

-- 2) Function exists as SECURITY DEFINER
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'purge_service_history_test_older_than';

-- Expect: security_definer = true, args = integer, integer, integer

-- 3) authenticated must NOT have EXECUTE
SELECT
  has_function_privilege(
    'authenticated',
    'public.purge_service_history_test_older_than(integer, integer, integer)',
    'EXECUTE'
  ) AS authenticated_can_execute;

-- Expect: false

-- 4) service_role / postgres can execute
SELECT
  has_function_privilege(
    'service_role',
    'public.purge_service_history_test_older_than(integer, integer, integer)',
    'EXECUTE'
  ) AS service_role_can_run,
  has_function_privilege(
    'postgres',
    'public.purge_service_history_test_older_than(integer, integer, integer)',
    'EXECUTE'
  ) AS postgres_can_run;

-- Expect: both true

-- 5) Older-than-30d counts (informational)
SELECT
  (SELECT count(*) FROM public.ev_service_history_test WHERE created_at < now() - interval '30 days') AS ev_older_than_30d,
  (SELECT count(*) FROM public.pv_service_history_test WHERE created_at < now() - interval '30 days') AS pv_older_than_30d,
  (SELECT count(*) FROM public.ev_service_history_test WHERE created_at >= now() - interval '30 days') AS ev_kept_last_30d,
  (SELECT count(*) FROM public.pv_service_history_test WHERE created_at >= now() - interval '30 days') AS pv_kept_last_30d;

-- 6) pg_cron job
SELECT
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AS pg_cron_installed;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'service-history-test purge cron jobs: %', (
      SELECT coalesce(json_agg(row_to_json(j)), '[]'::json)::text
      FROM (
        SELECT jobid, jobname, schedule, command, active
        FROM cron.job
        WHERE jobname = 'service-history-test-30d-purge'
           OR command ILIKE '%purge_service_history_test_older_than%'
        ORDER BY jobid
      ) j
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — cron job check skipped';
  END IF;
END $$;

-- Expect schedule: 30 20 * * * (02:00 IST)

-- 7) Smoke: budgeted purge returns ok shape
SELECT public.purge_service_history_test_older_than(30, 100, 5000);
