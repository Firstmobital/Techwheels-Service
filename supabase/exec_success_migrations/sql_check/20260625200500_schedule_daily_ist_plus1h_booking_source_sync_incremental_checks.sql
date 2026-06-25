-- Read-only checks for:
--   supabase/migrations/20260625200500_schedule_daily_ist_plus1h_booking_source_sync_incremental.sql
--
-- Supports one-go execution in Supabase SQL editor.
-- Also supports section-by-section execution (A -> F) if needed.

-- ============================================================
-- A) Extension presence
-- ============================================================
select extname, extversion
from pg_extension
where extname in ('pg_cron', 'pg_net')
order by extname;

-- ============================================================
-- B) Wrapper function presence
-- ============================================================
select
  to_regprocedure('public.invoke_booking_source_sync_incremental_daily()') as wrapper_signature;

-- ============================================================
-- C) Booking function presence sanity (scheduler target)
-- ============================================================
select
  to_regprocedure('public.invoke_booking_source_sync_incremental_daily()') is not null as wrapper_exists;

-- ============================================================
-- D) Cron job presence and expected schedule/command
-- ============================================================
select
  j.jobid,
  j.jobname,
  j.schedule,
  j.command,
  j.active,
  (j.schedule = '30 19 * * *') as is_expected_utc_schedule,
  (j.command ilike '%invoke_booking_source_sync_incremental_daily%') as uses_wrapper_function
from cron.job j
where j.jobname = 'booking-source-sync-daily-ist-plus1h';

-- ============================================================
-- E) Uniqueness of job name
-- ============================================================
select
  count(*) as matching_job_rows,
  count(*) filter (where active) as active_matching_job_rows
from cron.job
where jobname = 'booking-source-sync-daily-ist-plus1h';

-- ============================================================
-- F) Optional recent run telemetry (if any runs happened)
-- ============================================================
select
  r.jobid,
  r.runid,
  r.status,
  r.return_message,
  r.start_time,
  r.end_time
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where j.jobname = 'booking-source-sync-daily-ist-plus1h'
order by r.start_time desc
limit 20;
