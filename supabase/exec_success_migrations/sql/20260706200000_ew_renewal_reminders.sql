-- EW Renewal Reminders: table, config columns, indexes, pg_cron schedule
-- This migration is additive-only; it does not modify any existing table data.
--
-- Sends a WhatsApp "Renew Now" reminder 10 days and 3 days before
-- all_service_data.extended_warranty_end_date.

begin;

-- ─── 1. Tracking table ───────────────────────────────────────────────────────
create table if not exists public.ew_renewal_reminders (
  id                           bigserial primary key,
  service_data_id              bigint    not null,
  customer_name                text,
  mobile_number                text      not null,
  vehicle_registration_number  text,
  chassis_no                   text,
  extended_warranty_end_date   date      not null,
  reminder_type                text      not null
    constraint err_reminder_type_check
      check (reminder_type in ('10_day', '3_day')),
  scheduled_for_date           date      not null,
  sent_at                      timestamptz,
  wa_message_id                text,
  template_name                text,
  status                       text      not null default 'pending'
    constraint err_status_check
      check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  failure_reason               text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),

  -- Prevent duplicate reminders for same vehicle / expiry-date / reminder-type
  constraint uq_err_vehicle_date_type
    unique (service_data_id, extended_warranty_end_date, reminder_type)
);

comment on table public.ew_renewal_reminders is
  'Tracks automated WhatsApp Extended Warranty renewal reminders sent from all_service_data.extended_warranty_end_date.';

-- Indexes
create index if not exists idx_err_mobile
  on public.ew_renewal_reminders (mobile_number);

create index if not exists idx_err_wa_message_id
  on public.ew_renewal_reminders (wa_message_id)
  where wa_message_id is not null;

create index if not exists idx_err_status
  on public.ew_renewal_reminders (status);

create index if not exists idx_err_scheduled_for_date
  on public.ew_renewal_reminders (scheduled_for_date desc);

-- ─── 2. Config columns on wa_agent_config ───────────────────────────────────
-- ew_renewal_enabled       : master on/off switch
-- ew_renewal_template_id   : FK to wa_templates (must be approved)
-- ew_renewal_template_lang : BCP-47 language code, default 'en'
-- ew_renewal_variable_map  : JSON mapping template var names → all_service_data columns
-- ew_renewal_send_time     : local (Asia/Kolkata) time of day the daily job runs

alter table public.wa_agent_config
  add column if not exists ew_renewal_enabled       boolean  not null default false,
  add column if not exists ew_renewal_template_id   bigint   references public.wa_templates(id) on delete set null,
  add column if not exists ew_renewal_template_lang text     not null default 'en',
  add column if not exists ew_renewal_variable_map  jsonb    not null default '{
    "name":        "first_name",
    "model":       "model",
    "reg_no":      "vehicle_registration_number",
    "ew_end_date": "extended_warranty_end_date"
  }'::jsonb,
  add column if not exists ew_renewal_send_time     time     not null default '12:00:00';

comment on column public.wa_agent_config.ew_renewal_enabled is
  'Master toggle for the daily EW renewal reminder job.';
comment on column public.wa_agent_config.ew_renewal_template_id is
  'Approved wa_templates row used for EW renewal reminder messages (must have status=approved).';
comment on column public.wa_agent_config.ew_renewal_variable_map is
  'JSON map: template variable name → all_service_data column name. e.g. {"name":"first_name",...}';
comment on column public.wa_agent_config.ew_renewal_send_time is
  'Local (Asia/Kolkata) time of day the daily EW renewal reminder job runs. Drives the pg_cron schedule via reschedule_ew_renewal_reminder_cron().';

-- ─── 3. pg_cron: daily job, default 12:00 PM IST (06:30 UTC) ───────────────
-- One hour after the existing post-service-feedback job to keep load spread out.

create or replace function public.invoke_ew_renewal_reminder_daily()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url     := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/wa-ew-renewal-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{"dry_run": false}'::jsonb
  )
  into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.invoke_ew_renewal_reminder_daily() is
  'Daily scheduler for wa-ew-renewal-reminder edge function. Default 12:00 PM IST (06:30 UTC).';

grant execute on function public.invoke_ew_renewal_reminder_daily()
  to postgres, service_role;

create or replace function public.reschedule_ew_renewal_reminder_cron(p_send_time time)
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
    raise notice 'pg_cron not installed — skipping reschedule for ew-renewal-reminder';
    return;
  end if;

  select j.jobid
  into v_existing_job_id
  from cron.job j
  where j.jobname = 'ew-renewal-reminder-daily-ist'
  limit 1;

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  -- Asia/Kolkata is UTC+5:30 year-round (no DST).
  v_utc_time := (p_send_time - interval '5 hours 30 minutes')::time;
  v_cron := extract(minute from v_utc_time)::int || ' ' || extract(hour from v_utc_time)::int || ' * * *';

  perform cron.schedule(
    'ew-renewal-reminder-daily-ist',
    v_cron,
    $job$ select public.invoke_ew_renewal_reminder_daily(); $job$
  );
end;
$$;

comment on function public.reschedule_ew_renewal_reminder_cron(time) is
  'Re-registers the ew-renewal-reminder-daily-ist pg_cron job for the given Asia/Kolkata send time.';

grant execute on function public.reschedule_ew_renewal_reminder_cron(time)
  to postgres, service_role;

-- ─── 4. Trigger: reschedule automatically when the send time is saved ──────
create or replace function public.trg_reschedule_ew_renewal_reminder_cron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reschedule_ew_renewal_reminder_cron(new.ew_renewal_send_time);
  return new;
end;
$$;

drop trigger if exists trg_wa_agent_config_reschedule_ew_renewal on public.wa_agent_config;

create trigger trg_wa_agent_config_reschedule_ew_renewal
  after update of ew_renewal_send_time on public.wa_agent_config
  for each row
  when (old.ew_renewal_send_time is distinct from new.ew_renewal_send_time)
  execute function public.trg_reschedule_ew_renewal_reminder_cron();

-- ─── 5. Register the cron job for the currently configured time ────────────
do $$
declare
  v_send_time time;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — cron job not registered';
    return;
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not installed — cron job not registered';
    return;
  end if;

  select ew_renewal_send_time into v_send_time
  from public.wa_agent_config
  where id = 1;

  perform public.reschedule_ew_renewal_reminder_cron(coalesce(v_send_time, '12:00:00'::time));
end $$;

commit;
