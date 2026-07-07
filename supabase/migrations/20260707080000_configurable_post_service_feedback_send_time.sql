-- Make the post-service feedback daily send time configurable from the frontend
-- instead of hardcoded in the pg_cron schedule ('30 5 * * *' = 11:00 AM IST).
-- Mirrors 20260706070000_configurable_auto_reminder_send_time.sql.
-- This migration is additive-only.

begin;

-- ─── 1. Config column ────────────────────────────────────────────────────────
alter table public.wa_agent_config
  add column if not exists post_service_feedback_send_time time not null default '11:00:00';

comment on column public.wa_agent_config.post_service_feedback_send_time is
  'Local (Asia/Kolkata) time of day the daily post-service feedback job runs. Drives the pg_cron schedule via reschedule_post_service_feedback_cron().';

-- ─── 2. Reschedule function ─────────────────────────────────────────────────
-- Converts the IST send time to a UTC cron expression and (re)registers the job.
create or replace function public.reschedule_post_service_feedback_cron(p_send_time time)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_job_id bigint;
  v_utc_time         time;
  v_cron             text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skipping reschedule for post-service-feedback';
    return;
  end if;

  select j.jobid
  into v_existing_job_id
  from cron.job j
  where j.jobname = 'post-service-feedback-daily-ist'
  limit 1;

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  -- Asia/Kolkata is UTC+5:30 year-round (no DST).
  v_utc_time := (p_send_time - interval '5 hours 30 minutes')::time;
  v_cron := extract(minute from v_utc_time)::int || ' ' || extract(hour from v_utc_time)::int || ' * * *';

  perform cron.schedule(
    'post-service-feedback-daily-ist',
    v_cron,
    $job$ select public.invoke_post_service_feedback_daily(); $job$
  );
end;
$$;

comment on function public.reschedule_post_service_feedback_cron(time) is
  'Re-registers the post-service-feedback-daily-ist pg_cron job for the given Asia/Kolkata send time.';

grant execute on function public.reschedule_post_service_feedback_cron(time)
  to postgres, service_role;

-- ─── 3. Trigger: reschedule automatically when the send time is saved ───────
create or replace function public.trg_reschedule_post_service_feedback_cron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reschedule_post_service_feedback_cron(new.post_service_feedback_send_time);
  return new;
end;
$$;

drop trigger if exists trg_wa_agent_config_reschedule_psf on public.wa_agent_config;

create trigger trg_wa_agent_config_reschedule_psf
  after update of post_service_feedback_send_time on public.wa_agent_config
  for each row
  when (old.post_service_feedback_send_time is distinct from new.post_service_feedback_send_time)
  execute function public.trg_reschedule_post_service_feedback_cron();

-- ─── 4. Apply current configured time immediately ───────────────────────────
do $$
declare
  v_send_time time;
begin
  select post_service_feedback_send_time into v_send_time
  from public.wa_agent_config
  where id = 1;

  perform public.reschedule_post_service_feedback_cron(coalesce(v_send_time, '11:00:00'::time));
end $$;

commit;
