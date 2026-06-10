-- TECH-EARNINGS-001 hotfix
-- Fix cron target URL to current Supabase project (jmdndcphkmaljhwgzqxq)
--
-- Why this is needed:
-- Previous scheduler command targeted a different project URL,
-- so cron showed "succeeded" while this project's edge function was never invoked.
--
-- IMPORTANT before running:
-- 1) Ensure edge function env vars are configured:
--      TECH_EARNINGS_CRON_SECRET
--      INTERNAL_EMAIL_DISPATCH_SECRET
--      TECH_EARNINGS_SCHEDULED_RECIPIENTS
-- 2) Optional override (if you need to rotate secret during this migration):
--      select set_config('app.tech_earnings_cron_secret', 'YOUR_SECRET_HERE', false);
--
-- This migration will auto-reuse existing cron secret from current cron.command
-- if app.tech_earnings_cron_secret is not set.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_job_id bigint;
  v_existing_command text;
  v_cron_secret text := nullif(current_setting('app.tech_earnings_cron_secret', true), '');
  v_match text[];
begin
  select jobid, command into v_job_id, v_existing_command
  from cron.job
  where jobname = 'technician_daily_earnings_email_1130_ist';

  if v_cron_secret is null and v_existing_command is not null then
    v_match := regexp_match(v_existing_command, '''x-tech-earnings-cron-secret''\s*,\s*''([^'']+)''');
    if array_length(v_match, 1) >= 1 then
      v_cron_secret := nullif(v_match[1], '');
    end if;
  end if;

  if v_cron_secret is null then
    raise exception 'Could not resolve cron secret. Set app.tech_earnings_cron_secret via set_config() before executing migration.';
  end if;

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
      'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/technician-daily-earnings-report',
      v_cron_secret
    )
  );
end $$;
