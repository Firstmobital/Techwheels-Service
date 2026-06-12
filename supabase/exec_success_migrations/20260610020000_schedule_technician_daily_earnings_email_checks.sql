-- Read-only verification checks for:
-- 20260610020000_schedule_technician_daily_earnings_email.sql

-- 1) Required extensions
select extname
from pg_extension
where extname in ('pg_cron', 'pg_net')
order by extname;

-- 2) Cron job registration
select
  jobid,
  jobname,
  schedule,
  active,
  command
from cron.job
where jobname = 'technician_daily_earnings_email_1130_ist';

-- 3) Recent execution history (after scheduler has run)
select
  jobid,
  runid,
  status,
  return_message,
  start_time,
  end_time
from cron.job_run_details
where jobid in (
  select jobid
  from cron.job
  where jobname = 'technician_daily_earnings_email_1130_ist'
)
order by start_time desc
limit 20;
