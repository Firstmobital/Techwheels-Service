-- Updation Reminders: import-driven WhatsApp automation for Tata Motors "updation"
-- (recall/software/hardware update) campaigns. Staff import a chassis-number sheet,
-- each chassis is resolved to a customer via all_service_data, and up to two WhatsApp
-- reminders (day 0 + day 0+gap) are sent with a Flow booking form (date/time/branch)
-- that writes into service_bookings — mirrors 20260629100000_auto_service_reminders.sql
-- and 20260707080000_configurable_post_service_feedback_send_time.sql.
-- This migration is additive-only.

begin;

-- ─── 1. Import batch tracking ────────────────────────────────────────────────
create table if not exists public.updation_import_batches (
  id                        bigserial primary key,
  file_name                 text,
  sheet_name                text,
  uploaded_by               uuid,
  total_rows                integer not null default 0,
  matched_with_phone_count  integer not null default 0,
  matched_no_phone_count    integer not null default 0,
  unmatched_count           integer not null default 0,
  unmatched_chassis         jsonb   not null default '[]'::jsonb,
  matched_no_phone_chassis  jsonb   not null default '[]'::jsonb,
  created_at                timestamptz not null default now()
);

comment on table public.updation_import_batches is
  'One row per Updation Reminder chassis-list import, recording match/unmatched counts for staff review.';

-- ─── 2. Reminder tracking table ──────────────────────────────────────────────
create table if not exists public.updation_reminders (
  id                          bigserial primary key,
  batch_id                    bigint references public.updation_import_batches(id) on delete set null,
  service_data_id             bigint    not null,
  chassis_no                  text      not null,
  updation_code                text,
  updation_name                text,
  customer_name               text,
  mobile_number                text      not null,
  vehicle_registration_number text,
  model                        text,
  reminder_number              smallint  not null
    constraint ur_reminder_number_check
      check (reminder_number in (1, 2)),
  scheduled_for_date           date      not null,
  sent_at                      timestamptz,
  wa_message_id                text,
  template_name                text,
  status                        text      not null default 'pending'
    constraint ur_status_check
      check (status in ('pending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  failure_reason                text,
  flow_response_id              text,
  booking_id                    bigint references public.service_bookings(id) on delete set null,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  -- Guard against re-processing the same batch twice for the same chassis/reminder step
  constraint uq_ur_chassis_reminder_batch
    unique (chassis_no, reminder_number, batch_id)
);

comment on table public.updation_reminders is
  'Tracks the two WhatsApp updation-campaign reminders (day 0 and day 0+gap) sent per chassis from an updation_import_batches upload.';

-- Indexes
create index if not exists idx_ur_mobile
  on public.updation_reminders (mobile_number);

create index if not exists idx_ur_wa_message_id
  on public.updation_reminders (wa_message_id)
  where wa_message_id is not null;

create index if not exists idx_ur_status
  on public.updation_reminders (status);

create index if not exists idx_ur_scheduled_for_date
  on public.updation_reminders (scheduled_for_date desc);

create index if not exists idx_ur_booking_id
  on public.updation_reminders (booking_id)
  where booking_id is not null;

create index if not exists idx_ur_batch_id
  on public.updation_reminders (batch_id)
  where batch_id is not null;

create index if not exists idx_ur_chassis_no
  on public.updation_reminders (chassis_no);

-- ─── 3. Config columns on wa_agent_config ───────────────────────────────────
-- updation_reminder_enabled      : gates the day-N follow-up sweep only. Reminder 1
--                                   always fires synchronously on import (staff-initiated).
-- updation_reminder_template_id  : FK to wa_templates (must be approved)
-- updation_reminder_template_lang: BCP-47 language code, default 'en'
-- updation_reminder_variable_map : JSON mapping template var names → source columns.
--   name/model/reg_no come from the matched all_service_data row; reason comes from
--   the import file's UpdationName column (see wa-updation-reminder edge function).
-- updation_reminder_send_time    : local (IST) time of day the follow-up sweep runs
-- updation_reminder_gap_days     : days between reminder 1 and reminder 2

alter table public.wa_agent_config
  add column if not exists updation_reminder_enabled       boolean  not null default true,
  add column if not exists updation_reminder_template_id   bigint   references public.wa_templates(id) on delete set null,
  add column if not exists updation_reminder_template_lang text     not null default 'en',
  add column if not exists updation_reminder_variable_map  jsonb    not null default '{
    "name":    "first_name",
    "model":   "model",
    "reg_no":  "vehicle_registration_number",
    "reason":  "updation_name"
  }'::jsonb,
  add column if not exists updation_reminder_send_time     time     not null default '10:00:00',
  add column if not exists updation_reminder_gap_days      smallint not null default 3;

comment on column public.wa_agent_config.updation_reminder_enabled is
  'Master toggle for the daily updation-reminder follow-up (reminder 2) sweep. Reminder 1 always sends synchronously on import.';
comment on column public.wa_agent_config.updation_reminder_template_id is
  'Approved wa_templates row used for updation reminder messages (must have status=approved).';
comment on column public.wa_agent_config.updation_reminder_variable_map is
  'JSON map: template variable name → source column. name/model/reg_no read from the matched all_service_data row; reason reads from updation_reminders.updation_name (sourced from the import file).';
comment on column public.wa_agent_config.updation_reminder_send_time is
  'Local (Asia/Kolkata) time of day the daily updation-reminder follow-up job runs. Drives the pg_cron schedule via reschedule_updation_reminder_cron().';
comment on column public.wa_agent_config.updation_reminder_gap_days is
  'Number of days after reminder 1 that reminder 2 is scheduled for.';

-- ─── 4. pg_cron: configurable daily follow-up sweep ─────────────────────────
create or replace function public.invoke_updation_reminder_daily()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url     := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/wa-updation-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{"dry_run": false}'::jsonb
  )
  into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.invoke_updation_reminder_daily() is
  'Daily scheduler for wa-updation-reminder edge function follow-up sweep (reminder 2). Time driven by wa_agent_config.updation_reminder_send_time.';

grant execute on function public.invoke_updation_reminder_daily()
  to postgres, service_role;

create or replace function public.reschedule_updation_reminder_cron(p_send_time time)
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
    raise notice 'pg_cron not installed — skipping reschedule for updation-reminder';
    return;
  end if;

  select j.jobid
  into v_existing_job_id
  from cron.job j
  where j.jobname = 'updation-reminder-daily-ist'
  limit 1;

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  -- Asia/Kolkata is UTC+5:30 year-round (no DST).
  v_utc_time := (p_send_time - interval '5 hours 30 minutes')::time;
  v_cron := extract(minute from v_utc_time)::int || ' ' || extract(hour from v_utc_time)::int || ' * * *';

  perform cron.schedule(
    'updation-reminder-daily-ist',
    v_cron,
    $job$ select public.invoke_updation_reminder_daily(); $job$
  );
end;
$$;

comment on function public.reschedule_updation_reminder_cron(time) is
  'Re-registers the updation-reminder-daily-ist pg_cron job for the given Asia/Kolkata send time.';

grant execute on function public.reschedule_updation_reminder_cron(time)
  to postgres, service_role;

-- ─── 5. Trigger: reschedule automatically when the send time is saved ───────
create or replace function public.trg_reschedule_updation_reminder_cron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reschedule_updation_reminder_cron(new.updation_reminder_send_time);
  return new;
end;
$$;

drop trigger if exists trg_wa_agent_config_reschedule_updation on public.wa_agent_config;

create trigger trg_wa_agent_config_reschedule_updation
  after update of updation_reminder_send_time on public.wa_agent_config
  for each row
  when (old.updation_reminder_send_time is distinct from new.updation_reminder_send_time)
  execute function public.trg_reschedule_updation_reminder_cron();

-- ─── 6. Apply current configured time immediately (registers the cron job) ──
do $$
declare
  v_send_time time;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — cron job not registered';
  else
    select updation_reminder_send_time into v_send_time
    from public.wa_agent_config
    where id = 1;

    perform public.reschedule_updation_reminder_cron(coalesce(v_send_time, '10:00:00'::time));
  end if;
end $$;

-- ─── 7. Grants — match sibling reminder tables (no RLS on this repo's WA tables) ─
grant all on table public.updation_import_batches to anon;
grant all on table public.updation_import_batches to authenticated;
grant all on table public.updation_import_batches to service_role;

grant all on table public.updation_reminders to anon;
grant all on table public.updation_reminders to authenticated;
grant all on table public.updation_reminders to service_role;

grant all on sequence public.updation_import_batches_id_seq to anon;
grant all on sequence public.updation_import_batches_id_seq to authenticated;
grant all on sequence public.updation_import_batches_id_seq to service_role;

grant all on sequence public.updation_reminders_id_seq to anon;
grant all on sequence public.updation_reminders_id_seq to authenticated;
grant all on sequence public.updation_reminders_id_seq to service_role;

commit;
