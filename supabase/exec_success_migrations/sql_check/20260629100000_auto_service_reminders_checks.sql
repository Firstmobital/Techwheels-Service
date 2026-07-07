-- Read-only verification checks for:
-- supabase/migrations/20260629100000_auto_service_reminders.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; final validation should be based on full-run output.

-- 1) Table exists with expected columns/types/defaults.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'auto_service_reminders'
ORDER BY ordinal_position;

-- 2) Expected constraints exist (reminder_type check, status check, unique, FK to service_bookings).
SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.auto_service_reminders'::regclass
ORDER BY conname;

-- 3) Expected indexes exist.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'auto_service_reminders'
ORDER BY indexname;

-- 4) New config columns on wa_agent_config exist with expected defaults.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'wa_agent_config'
  AND column_name IN (
    'auto_reminder_enabled',
    'auto_reminder_template_id',
    'auto_reminder_template_lang',
    'auto_reminder_variable_map'
  )
ORDER BY column_name;

-- 5) Scheduler function exists (SECURITY DEFINER, expected search_path).
SELECT
  p.oid::regprocedure::text AS function_signature,
  p.prosecdef AS is_security_definer,
  p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'invoke_auto_service_reminder_daily';

-- 6) pg_cron extension presence (job registration is skipped by the migration if absent).
SELECT
  extname,
  extversion
FROM pg_extension
WHERE extname = 'pg_cron';

-- 7) Scheduled job presence and configuration (only meaningful if pg_cron is installed).
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'auto-service-reminder-daily-ist';

-- 8) Assert expected schedule/command signature for the job, if registered.
SELECT
  COUNT(*) AS matching_job_rows
FROM cron.job
WHERE jobname = 'auto-service-reminder-daily-ist'
  AND schedule = '30 4 * * *'
  AND command ILIKE '%public.invoke_auto_service_reminder_daily()%'
  AND active = true;

-- 9) Row-count sanity check (table should exist and be queryable; row count itself is informational).
SELECT COUNT(*) AS auto_service_reminders_row_count
FROM public.auto_service_reminders;
