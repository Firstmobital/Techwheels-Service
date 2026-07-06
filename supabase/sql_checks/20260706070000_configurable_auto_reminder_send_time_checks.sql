-- Read-only verification checks for:
-- supabase/migrations/20260706070000_configurable_auto_reminder_send_time.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; final validation should be based on full-run output.

-- 1) New config column exists with expected type/default.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'wa_agent_config'
  AND column_name = 'auto_reminder_send_time';

-- 2) Reschedule function exists (SECURITY DEFINER, expected search_path).
SELECT
  p.oid::regprocedure::text AS function_signature,
  p.prosecdef AS is_security_definer,
  p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'reschedule_auto_service_reminder_cron';

-- 3) Trigger function exists.
SELECT
  p.oid::regprocedure::text AS function_signature,
  p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'trg_reschedule_auto_reminder_cron';

-- 4) Trigger is registered on wa_agent_config, fires on UPDATE OF auto_reminder_send_time.
SELECT
  tgname,
  tgenabled,
  pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.wa_agent_config'::regclass
  AND tgname = 'trg_wa_agent_config_reschedule_reminder';

-- 5) pg_cron extension presence (job registration is skipped by the migration if absent).
SELECT
  extname,
  extversion
FROM pg_extension
WHERE extname = 'pg_cron';

-- 6) Scheduled job reflects the currently configured send time (only meaningful if pg_cron is installed).
SELECT
  c.jobid,
  c.jobname,
  c.schedule,
  c.command,
  c.active,
  w.auto_reminder_send_time
FROM cron.job c
CROSS JOIN (
  SELECT auto_reminder_send_time FROM public.wa_agent_config WHERE id = 1
) w
WHERE c.jobname = 'auto-service-reminder-daily-ist';

-- 7) Manual re-run of the reschedule function is idempotent (does not raise, leaves exactly one job row).
SELECT public.reschedule_auto_service_reminder_cron(
  (SELECT auto_reminder_send_time FROM public.wa_agent_config WHERE id = 1)
);

SELECT COUNT(*) AS job_row_count
FROM cron.job
WHERE jobname = 'auto-service-reminder-daily-ist';
