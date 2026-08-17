-- Read-only verification checks for:
-- supabase/migrations/20260817161000_contact_details_10day_retention_purge.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Retention index
SELECT
  i.relname AS index_name,
  pg_get_indexdef(i.oid) AS index_def
FROM pg_class i
JOIN pg_namespace n ON n.oid = i.relnamespace
WHERE n.nspname = 'public'
  AND i.relname = 'idx_contact_details_created_at';

-- 2) Function exists as SECURITY DEFINER
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'purge_contact_details_older_than';

-- 3) authenticated must NOT have EXECUTE
SELECT
  has_function_privilege(
    'authenticated',
    'public.purge_contact_details_older_than(integer, integer, integer)',
    'EXECUTE'
  ) AS authenticated_can_execute;

-- 4) service_role / postgres can execute
SELECT
  has_function_privilege(
    'service_role',
    'public.purge_contact_details_older_than(integer, integer, integer)',
    'EXECUTE'
  ) AS service_role_can_run,
  has_function_privilege(
    'postgres',
    'public.purge_contact_details_older_than(integer, integer, integer)',
    'EXECUTE'
  ) AS postgres_can_run;

-- 5) Retention snapshot (informational)
SELECT
  count(*) FILTER (
    WHERE created_at IS NULL OR created_at < now() - interval '10 days'
  ) AS older_than_10d,
  count(*) FILTER (
    WHERE created_at >= now() - interval '10 days'
  ) AS kept_last_10d,
  count(*) AS total_rows
FROM public.contact_details;

-- 6) pg_cron job
SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AS pg_cron_installed;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'contact-details-10d-purge cron jobs: %', (
      SELECT coalesce(json_agg(row_to_json(j)), '[]'::json)::text
      FROM (
        SELECT jobid, jobname, schedule, command, active
        FROM cron.job
        WHERE jobname = 'contact-details-10d-purge'
           OR command ILIKE '%purge_contact_details_older_than%'
        ORDER BY jobid
      ) j
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — cron job check skipped';
  END IF;
END $$;

-- Expect schedule: 45 20 * * * (02:15 IST)

-- 7) Fill trigger still present (new Customer rows keep auto-filling blank phones)
SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND t.tgname IN (
    'trg_fill_all_service_data_contact_phones_from_contact_details',
    'trg_refresh_all_service_data_from_contact_details'
  )
ORDER BY c.relname, t.tgname;
