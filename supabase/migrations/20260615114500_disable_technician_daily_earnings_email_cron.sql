-- Disable technician daily earnings email cron job.
-- Safe to run multiple times.

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'technician_daily_earnings_email_1130_ist'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end $$;
