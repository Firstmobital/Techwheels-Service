-- Read-only verification checks for:
-- supabase/migrations/20260701090000_post_service_feedback.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Table exists with expected columns/types/defaults.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'post_service_feedback_messages'
ORDER BY ordinal_position;

-- 2) Expected constraints exist (status check, rating check, unique on job_card_closed_data_id).
SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.post_service_feedback_messages'::regclass
ORDER BY conname;

-- 3) Expected indexes exist.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'post_service_feedback_messages'
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
    'post_service_feedback_enabled',
    'post_service_feedback_delay_days',
    'post_service_feedback_template_id',
    'post_service_feedback_template_lang',
    'post_service_feedback_variable_map',
    'google_review_link'
  )
ORDER BY column_name;

-- 5) Config row is wired to the approved post_service_feedback_v1 template
--    (post_service_feedback_template_id should equal that template's id; job stays
--    disabled until post_service_feedback_enabled is explicitly set true).
SELECT
  c.id AS config_id,
  c.post_service_feedback_enabled,
  c.post_service_feedback_template_id,
  t.name AS wired_template_name,
  t.status AS wired_template_status,
  c.google_review_link
FROM public.wa_agent_config c
LEFT JOIN public.wa_templates t ON t.id = c.post_service_feedback_template_id
WHERE c.id = 1;

-- 6) Scheduler function exists (SECURITY DEFINER, expected search_path).
SELECT
  p.oid::regprocedure::text AS function_signature,
  p.prosecdef AS is_security_definer,
  p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'invoke_post_service_feedback_daily';

-- 7) pg_cron extension presence (job registration is skipped by the migration if absent).
SELECT
  extname,
  extversion
FROM pg_extension
WHERE extname = 'pg_cron';

-- 8) Scheduled job presence and configuration (only meaningful if pg_cron is installed).
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'post-service-feedback-daily-ist';

-- 9) Assert expected schedule/command signature for the job, if registered.
SELECT
  COUNT(*) AS matching_job_rows
FROM cron.job
WHERE jobname = 'post-service-feedback-daily-ist'
  AND schedule = '30 5 * * *'
  AND command ILIKE '%public.invoke_post_service_feedback_daily()%'
  AND active = true;

-- 10) Row-count sanity check (table should exist and be queryable; row count itself is informational).
SELECT COUNT(*) AS post_service_feedback_messages_row_count
FROM public.post_service_feedback_messages;
