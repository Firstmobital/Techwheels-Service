-- Read-only verification checks for:
-- supabase/migrations/20260706200000_ew_renewal_reminders.sql
-- Execution: This file can be run in one go.

-- 1) Table exists with expected columns/types/defaults.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ew_renewal_reminders'
ORDER BY ordinal_position;

-- 2) Expected constraints exist (reminder_type check, status check, unique).
SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.ew_renewal_reminders'::regclass
ORDER BY conname;

-- 3) Expected indexes exist.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ew_renewal_reminders'
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
    'ew_renewal_enabled',
    'ew_renewal_template_id',
    'ew_renewal_template_lang',
    'ew_renewal_variable_map',
    'ew_renewal_send_time'
  )
ORDER BY column_name;

-- 5) Scheduler + reschedule functions exist (SECURITY DEFINER, expected search_path).
SELECT
  p.oid::regprocedure::text AS function_signature,
  p.prosecdef AS is_security_definer,
  p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('invoke_ew_renewal_reminder_daily', 'reschedule_ew_renewal_reminder_cron', 'trg_reschedule_ew_renewal_reminder_cron');

-- 6) Trigger exists on wa_agent_config.
SELECT
  tgname,
  tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.wa_agent_config'::regclass
  AND tgname = 'trg_wa_agent_config_reschedule_ew_renewal';

-- 7) pg_cron extension presence (job registration is skipped by the migration if absent).
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_cron';

-- 8) Scheduled job presence and configuration (only meaningful if pg_cron is installed).
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'ew-renewal-reminder-daily-ist';

-- 9) Assert expected schedule/command signature for the job, if registered (12:00 IST = 06:30 UTC).
SELECT COUNT(*) AS matching_job_rows
FROM cron.job
WHERE jobname = 'ew-renewal-reminder-daily-ist'
  AND schedule = '30 6 * * *'
  AND command ILIKE '%public.invoke_ew_renewal_reminder_daily()%'
  AND active = true;

-- 10) Row-count sanity check.
SELECT COUNT(*) AS ew_renewal_reminders_row_count FROM public.ew_renewal_reminders;
