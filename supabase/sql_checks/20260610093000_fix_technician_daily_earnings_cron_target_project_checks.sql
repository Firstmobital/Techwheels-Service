-- Read-only checks for:
-- 20260610093000_fix_technician_daily_earnings_cron_target_project.sql

-- 1) Confirm cron job points to current project URL
select
  jobid,
  jobname,
  schedule,
  active,
  command
from cron.job
where jobname = 'technician_daily_earnings_email_1130_ist';

-- 2) Confirm recent cron executions
select
  d.jobid,
  d.runid,
  d.status,
  d.return_message,
  d.start_time,
  d.end_time
from cron.job_run_details d
where d.jobid in (
  select jobid
  from cron.job
  where jobname = 'technician_daily_earnings_email_1130_ist'
)
order by d.start_time desc
limit 20;

-- 3) Optional: inspect pg_net HTTP response status/body for latest request id
-- Replace <REQUEST_ID> with request_id returned by net.http_post if available.
-- select id, status_code, timed_out, error_msg, content
-- from net._http_response
-- where id = <REQUEST_ID>;
