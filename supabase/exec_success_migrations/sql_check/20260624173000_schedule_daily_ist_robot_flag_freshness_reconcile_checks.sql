-- Read-only verification checks for:
-- supabase/migrations/20260624173000_schedule_daily_ist_robot_flag_freshness_reconcile.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; final validation should be based on full-run output.

-- 1) pg_cron extension presence.
SELECT
  extname,
  extversion
FROM pg_extension
WHERE extname = 'pg_cron';

-- 2) Scheduled job presence and configuration.
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active,
  nodename,
  nodeport,
  database,
  username
FROM cron.job
WHERE jobname = 'all-service-data-robot-flag-freshness-daily-ist';

-- 3) Assert expected schedule/command signature.
SELECT
  COUNT(*) AS matching_job_rows
FROM cron.job
WHERE jobname = 'all-service-data-robot-flag-freshness-daily-ist'
  AND schedule = '30 18 * * *'
  AND command ILIKE '%public.reconcile_all_service_data_robot_flag_freshness_for_plus2_due()%'
  AND active = true;

-- 4) Optional latest run snapshot (may be empty immediately after scheduling).
SELECT
  j.jobid,
  j.jobname,
  d.runid,
  d.status,
  d.return_message,
  d.start_time,
  d.end_time
FROM cron.job j
LEFT JOIN LATERAL (
  SELECT runid, status, return_message, start_time, end_time
  FROM cron.job_run_details d
  WHERE d.jobid = j.jobid
  ORDER BY d.start_time DESC NULLS LAST
  LIMIT 1
) d ON true
WHERE j.jobname = 'all-service-data-robot-flag-freshness-daily-ist';
