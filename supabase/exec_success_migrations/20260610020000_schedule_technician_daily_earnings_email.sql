-- TECH-EARNINGS-001
-- Schedule daily technician earnings report email at 11:30 AM IST (06:00 UTC)
--
-- IMPORTANT:
-- 1) Set session variable before executing this migration (same value as
--    Edge Function env TECH_EARNINGS_CRON_SECRET):
--      select set_config('app.tech_earnings_cron_secret', 'YOUR_SECRET_HERE', false);
-- 2) Ensure Edge Function env INTERNAL_EMAIL_DISPATCH_SECRET is configured.
-- 3) Ensure scheduled recipient env TECH_EARNINGS_SCHEDULED_RECIPIENTS is configured.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_job_id bigint;
  v_cron_secret text := nullif(current_setting('app.tech_earnings_cron_secret', true), '');
begin
  if v_cron_secret is null then
    raise exception 'Set app.tech_earnings_cron_secret via set_config() before executing migration.';
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'technician_daily_earnings_email_1130_ist';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'technician_daily_earnings_email_1130_ist',
    '0 6 * * *',
    format($cmd$
      select net.http_post(
        url => %L,
        headers => jsonb_build_object(
          'Content-Type', 'application/json',
          'x-tech-earnings-cron-secret', %L
        ),
        body => jsonb_build_object(
          'runMode', 'scheduled'
        )
      ) as request_id;
    $cmd$,
      'https://tnakgaoqyumgfxklkujl.supabase.co/functions/v1/technician-daily-earnings-report',
      v_cron_secret
    )
  );
end $$;
