-- Auto Service Reminders: table, config columns, indexes, pg_cron schedule
-- This migration is additive-only; it does not modify any existing table data.

begin;

-- ─── 1. Tracking table ───────────────────────────────────────────────────────
create table if not exists public.auto_service_reminders (
  id                          bigserial primary key,
  service_data_id             bigint    not null,
  customer_name               text,
  mobile_number               text      not null,
  vehicle_registration_number text,
  chassis_no                  text,
  assumed_next_service_date   date      not null,
  reminder_type               text      not null
    constraint asr_reminder_type_check
      check (reminder_type in ('20_day', '9_day', '3_day')),
  scheduled_for_date          date      not null,
  sent_at                     timestamptz,
  wa_message_id               text,
  template_name               text,
  status                      text      not null default 'pending'
    constraint asr_status_check
      check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  failure_reason              text,
  flow_response_id            text,
  booking_id                  bigint    references public.service_bookings(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Prevent duplicate reminders for same vehicle / due-date / reminder-type
  constraint uq_asr_vehicle_date_type
    unique (service_data_id, assumed_next_service_date, reminder_type)
);

comment on table public.auto_service_reminders is
  'Tracks automated WhatsApp service reminder messages sent from all_service_data.assumed_next_service_date.';

-- Indexes
create index if not exists idx_asr_mobile
  on public.auto_service_reminders (mobile_number);

create index if not exists idx_asr_wa_message_id
  on public.auto_service_reminders (wa_message_id)
  where wa_message_id is not null;

create index if not exists idx_asr_status
  on public.auto_service_reminders (status);

create index if not exists idx_asr_scheduled_for_date
  on public.auto_service_reminders (scheduled_for_date desc);

create index if not exists idx_asr_booking_id
  on public.auto_service_reminders (booking_id)
  where booking_id is not null;

-- ─── 2. Config columns on wa_agent_config ───────────────────────────────────
-- auto_reminder_enabled           : master on/off switch (also overrideable via env)
-- auto_reminder_template_id       : FK to wa_templates (must be approved)
-- auto_reminder_template_lang     : BCP-47 language code, default 'en'
-- auto_reminder_variable_map      : JSON mapping template var names → all_service_data columns
--   Default maps: name→cust_first_name, model→ppl, reg_no→registration_no,
--                 service_due→assumed_next_service_date

alter table public.wa_agent_config
  add column if not exists auto_reminder_enabled       boolean  not null default false,
  add column if not exists auto_reminder_template_id   bigint   references public.wa_templates(id) on delete set null,
  add column if not exists auto_reminder_template_lang text     not null default 'en',
  add column if not exists auto_reminder_variable_map  jsonb    not null default '{
    "name":        "cust_first_name",
    "model":       "ppl",
    "reg_no":      "registration_no",
    "service_due": "assumed_next_service_date"
  }'::jsonb;

comment on column public.wa_agent_config.auto_reminder_enabled is
  'Master toggle for the daily auto service reminder job.';
comment on column public.wa_agent_config.auto_reminder_template_id is
  'Approved wa_templates row used for auto service reminder messages (must have status=approved).';
comment on column public.wa_agent_config.auto_reminder_variable_map is
  'JSON map: template variable name → all_service_data column name. e.g. {"name":"cust_first_name",...}';

-- ─── 3. pg_cron: daily job at 10:00 AM IST (04:30 UTC) ─────────────────────
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skipping cron schedule for auto-service-reminder';
    return;
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not installed — skipping cron schedule for auto-service-reminder';
    return;
  end if;
end $$;

create or replace function public.invoke_auto_service_reminder_daily()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url     := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/wa-auto-service-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{"dry_run": false}'::jsonb
  )
  into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.invoke_auto_service_reminder_daily() is
  'Daily 10:00 AM IST (04:30 UTC) scheduler for wa-auto-service-reminder edge function.';

grant execute on function public.invoke_auto_service_reminder_daily()
  to postgres, service_role;

do $$
declare
  v_existing_job_id bigint;
begin
  -- Check if pg_cron is available before scheduling
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — cron job not registered';
    return;
  end if;

  select j.jobid
  into v_existing_job_id
  from cron.job j
  where j.jobname = 'auto-service-reminder-daily-ist'
  limit 1;

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  -- 04:30 UTC = 10:00 AM IST
  perform cron.schedule(
    'auto-service-reminder-daily-ist',
    '30 4 * * *',
    $job$ select public.invoke_auto_service_reminder_daily(); $job$
  );
end $$;

commit;
