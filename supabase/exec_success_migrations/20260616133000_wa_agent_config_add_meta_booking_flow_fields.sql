begin;

alter table if exists public.wa_agent_config
  add column if not exists meta_booking_flow_id text,
  add column if not exists meta_booking_flow_cta text;

commit;
