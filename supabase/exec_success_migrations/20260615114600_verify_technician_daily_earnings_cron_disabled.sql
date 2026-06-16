-- Verify technician daily earnings cron is disabled.
-- Expected result after disable migration: 0 rows

select jobid, jobname, schedule, active
from cron.job
where jobname = 'technician_daily_earnings_email_1130_ist';
