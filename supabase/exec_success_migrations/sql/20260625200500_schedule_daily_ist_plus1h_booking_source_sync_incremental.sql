-- Schedule daily booking-source incremental sync at IST 01:00 (UTC 19:30 previous day)
-- Cron timing requested: run once daily, one hour after IST date change.
--
-- Prerequisites:
-- 1) Extensions available: pg_cron, pg_net
-- 2) Edge function `booking-source-sync` must be deployed with verify_jwt=false
--    so scheduler can invoke without bearer token dependency.
--
-- This scheduler calls edge function:
--   POST /functions/v1/booking-source-sync
--   body = {"dry_run": false, "batch_size": 200}

begin;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron extension is not installed; cannot schedule booking-source-sync job';
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_net extension is not installed; cannot invoke edge function from cron';
  end if;
end $$;

create or replace function public.invoke_booking_source_sync_incremental_daily()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/booking-source-sync',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{"dry_run": false, "batch_size": 200}'::jsonb
  )
  into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.invoke_booking_source_sync_incremental_daily() is
  'Daily IST 01:00 scheduler wrapper for booking-source-sync edge function (incremental insert-only mode).';

grant execute on function public.invoke_booking_source_sync_incremental_daily()
  to postgres, service_role;

do $$
declare
  v_existing_job_id bigint;
begin
  select j.jobid
  into v_existing_job_id
  from cron.job j
  where j.jobname = 'booking-source-sync-daily-ist-plus1h'
  limit 1;

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  -- 19:30 UTC = 01:00 IST (next day)
  perform cron.schedule(
    'booking-source-sync-daily-ist-plus1h',
    '30 19 * * *',
    $job$select public.invoke_booking_source_sync_incremental_daily();$job$
  );
end $$;

commit;
