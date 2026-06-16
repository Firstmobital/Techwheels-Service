begin;
-- Parts alert log table for tracking triggered alerts and acknowledgments
create table if not exists public.parts_alerts_log (
  id bigint primary key generated always as identity,
  config_id bigint references public.parts_alerts_config (id) on delete cascade,
  branch text not null,
  alert_type text not null,
  part_number text,
  product_category text,
  alert_details jsonb,
  triggered_at timestamptz not null default now(),
  acknowledged_by text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  constraint fk_parts_alerts_log_config
    foreign key (config_id)
    references public.parts_alerts_config (id)
    on delete cascade
);
-- RLS policies for alerts log
alter table public.parts_alerts_log enable row level security;
drop policy if exists parts_alerts_log_select_anon on public.parts_alerts_log;
create policy parts_alerts_log_select_anon
  on public.parts_alerts_log
  for select
  to anon, authenticated
  using (true);
drop policy if exists parts_alerts_log_insert_anon on public.parts_alerts_log;
create policy parts_alerts_log_insert_anon
  on public.parts_alerts_log
  for insert
  to anon, authenticated
  with check (true);
drop policy if exists parts_alerts_log_update_anon on public.parts_alerts_log;
create policy parts_alerts_log_update_anon
  on public.parts_alerts_log
  for update
  to anon, authenticated
  using (true)
  with check (true);
drop policy if exists parts_alerts_log_delete_anon on public.parts_alerts_log;
create policy parts_alerts_log_delete_anon
  on public.parts_alerts_log
  for delete
  to anon, authenticated
  using (true);
-- Indexes for alert history queries
create index if not exists idx_parts_alerts_log_branch_type
  on public.parts_alerts_log (branch, alert_type, triggered_at desc);
create index if not exists idx_parts_alerts_log_part_number
  on public.parts_alerts_log (part_number);
create index if not exists idx_parts_alerts_log_acknowledged
  on public.parts_alerts_log (acknowledged_at)
  where acknowledged_at is null;
commit;
