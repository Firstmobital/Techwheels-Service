-- Post Service Feedback: table, config columns, indexes, pg_cron schedule
-- This migration is additive-only; it does not modify any existing table data.

begin;

-- ─── 1. Tracking table ───────────────────────────────────────────────────────
create table if not exists public.post_service_feedback_messages (
  id                          bigserial primary key,
  job_card_closed_data_id     bigint    not null,
  customer_name               text,
  mobile_number               text      not null,
  vehicle_registration_number text,
  job_card_number             text,
  closed_date                 date      not null,
  scheduled_for_date          date      not null,
  sent_at                     timestamptz,
  wa_message_id               text,
  template_name               text,
  status                      text      not null default 'pending'
    constraint psfm_status_check
      check (status in ('pending', 'sent', 'delivered', 'read', 'responded', 'failed')),
  failure_reason              text,
  rating                      smallint
    constraint psfm_rating_check
      check (rating is null or (rating between 1 and 5)),
  feedback_text               text,
  responded_at                timestamptz,
  review_link_sent            boolean   not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Prevent duplicate feedback requests for the same closed job card
  constraint uq_psfm_job_card
    unique (job_card_closed_data_id)
);

comment on table public.post_service_feedback_messages is
  'Tracks automated WhatsApp post-service feedback messages sent from job_card_closed_data.closed_date_time, plus captured ratings/remarks.';

-- Indexes
create index if not exists idx_psfm_mobile
  on public.post_service_feedback_messages (mobile_number);

create index if not exists idx_psfm_wa_message_id
  on public.post_service_feedback_messages (wa_message_id)
  where wa_message_id is not null;

create index if not exists idx_psfm_status
  on public.post_service_feedback_messages (status);

create index if not exists idx_psfm_scheduled_for_date
  on public.post_service_feedback_messages (scheduled_for_date desc);

create index if not exists idx_psfm_rating
  on public.post_service_feedback_messages (rating)
  where rating is not null;

-- ─── 2. Config columns on wa_agent_config ───────────────────────────────────
-- post_service_feedback_enabled     : master on/off switch
-- post_service_feedback_delay_days  : days after closed_date_time to send (default 1)
-- post_service_feedback_template_id : FK to wa_templates (must be approved)
-- post_service_feedback_template_lang : BCP-47 language code, default 'en'
-- post_service_feedback_variable_map : JSON mapping template var names → job_card_closed_data columns
--   Keys must match wa_templates.variable_examples[].name for the chosen template.
--   The already-approved "post_service_feedback_v1" template uses "customer_name" and "service_date".
-- google_review_link                : URL sent as a follow-up when rating >= 4

alter table public.wa_agent_config
  add column if not exists post_service_feedback_enabled       boolean  not null default false,
  add column if not exists post_service_feedback_delay_days    integer  not null default 1,
  add column if not exists post_service_feedback_template_id   bigint   references public.wa_templates(id) on delete set null,
  add column if not exists post_service_feedback_template_lang text     not null default 'en',
  add column if not exists post_service_feedback_variable_map  jsonb    not null default '{
    "customer_name": "first_name",
    "service_date": "closed_date_time"
  }'::jsonb,
  add column if not exists google_review_link                 text     default 'https://g.page/r/CU9vMfH6HydcEBM/review';

comment on column public.wa_agent_config.post_service_feedback_enabled is
  'Master toggle for the daily post-service feedback job.';
comment on column public.wa_agent_config.post_service_feedback_delay_days is
  'Number of days after job_card_closed_data.closed_date_time to send the feedback request.';
comment on column public.wa_agent_config.post_service_feedback_template_id is
  'Approved wa_templates row used for post-service feedback messages (must have status=approved).';
comment on column public.wa_agent_config.post_service_feedback_variable_map is
  'JSON map: template variable name (wa_templates.variable_examples[].name) → job_card_closed_data column name. e.g. {"customer_name":"first_name","service_date":"closed_date_time"}';
comment on column public.wa_agent_config.google_review_link is
  'Google Business review URL sent as a follow-up when a customer rates 4 or 5 stars.';

-- ─── 2b. Wire the already-approved post_service_feedback_v1 template ───────
-- Points config at the template Meta has approved; the job stays OFF until
-- post_service_feedback_enabled is explicitly set to true.
update public.wa_agent_config
set post_service_feedback_template_id = t.id
from public.wa_templates t
where wa_agent_config.id = 1
  and wa_agent_config.post_service_feedback_template_id is null
  and t.name = 'post_service_feedback_v1'
  and t.status = 'approved';

-- ─── 3. pg_cron: daily job at 11:00 AM IST (05:30 UTC) ─────────────────────
-- Runs 1 hour after the auto-service-reminder job to spread load.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skipping cron schedule for post-service-feedback';
    return;
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not installed — skipping cron schedule for post-service-feedback';
    return;
  end if;
end $$;

create or replace function public.invoke_post_service_feedback_daily()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url     := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/wa-post-service-feedback',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{"dry_run": false}'::jsonb
  )
  into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.invoke_post_service_feedback_daily() is
  'Daily 11:00 AM IST (05:30 UTC) scheduler for wa-post-service-feedback edge function.';

grant execute on function public.invoke_post_service_feedback_daily()
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
  where j.jobname = 'post-service-feedback-daily-ist'
  limit 1;

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  -- 05:30 UTC = 11:00 AM IST
  perform cron.schedule(
    'post-service-feedback-daily-ist',
    '30 5 * * *',
    $job$ select public.invoke_post_service_feedback_daily(); $job$
  );
end $$;

commit;
