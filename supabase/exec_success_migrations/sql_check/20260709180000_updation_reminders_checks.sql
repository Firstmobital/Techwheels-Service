-- Read-only verification checks for:
-- supabase/migrations/20260709180000_updation_reminders.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) updation_import_batches table exists with expected columns/types/defaults.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'updation_import_batches'
ORDER BY ordinal_position;

-- 2) updation_reminders table exists with expected columns/types/defaults.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'updation_reminders'
ORDER BY ordinal_position;

-- 3) Expected constraints exist on updation_reminders (reminder_number check, status
--    check, unique chassis/reminder/batch, FK to updation_import_batches and
--    service_bookings).
SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.updation_reminders'::regclass
ORDER BY conname;

-- 4) Expected indexes exist.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('updation_reminders', 'updation_import_batches')
ORDER BY tablename, indexname;

-- 5) New config columns on wa_agent_config exist with expected defaults.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'wa_agent_config'
  AND column_name IN (
    'updation_reminder_enabled',
    'updation_reminder_template_id',
    'updation_reminder_template_lang',
    'updation_reminder_variable_map',
    'updation_reminder_send_time',
    'updation_reminder_gap_days'
  )
ORDER BY column_name;

-- 6) Config row default state (job enabled by default at id=1; template_id null until
--    an approved template is wired in via the UI).
SELECT
  c.id AS config_id,
  c.updation_reminder_enabled,
  c.updation_reminder_template_id,
  c.updation_reminder_template_lang,
  c.updation_reminder_variable_map,
  c.updation_reminder_send_time,
  c.updation_reminder_gap_days
FROM public.wa_agent_config c
WHERE c.id = 1;

-- 7) Scheduler functions exist (SECURITY DEFINER, expected search_path).
SELECT
  p.oid::regprocedure::text AS function_signature,
  p.prosecdef AS is_security_definer,
  p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('invoke_updation_reminder_daily', 'reschedule_updation_reminder_cron', 'trg_reschedule_updation_reminder_cron');

-- 8) Reschedule trigger exists on wa_agent_config.
SELECT
  tgname,
  tgenabled,
  pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgname = 'trg_wa_agent_config_reschedule_updation';

-- 9) pg_cron extension presence (job registration is skipped by the migration if absent).
SELECT
  extname,
  extversion
FROM pg_extension
WHERE extname = 'pg_cron';

-- 10) Scheduled job presence and configuration (only meaningful if pg_cron is installed).
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'updation-reminder-daily-ist';

-- 11) Assert expected schedule/command signature for the job, if registered
--     (default send_time '10:00:00' IST = '30 4 * * *' UTC).
SELECT
  COUNT(*) AS matching_job_rows
FROM cron.job
WHERE jobname = 'updation-reminder-daily-ist'
  AND schedule = '30 4 * * *'
  AND command ILIKE '%public.invoke_updation_reminder_daily()%'
  AND active = true;

-- 12) Row-count sanity check (tables should exist and be queryable; row counts are
--     informational — both are empty immediately after migration).
SELECT
  (SELECT COUNT(*) FROM public.updation_import_batches) AS updation_import_batches_row_count,
  (SELECT COUNT(*) FROM public.updation_reminders)      AS updation_reminders_row_count;

-- 13) Grants — anon/authenticated/service_role should have full access, matching
--     sibling WA reminder tables (no RLS on this repo's WA tables).
SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('updation_import_batches', 'updation_reminders')
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
