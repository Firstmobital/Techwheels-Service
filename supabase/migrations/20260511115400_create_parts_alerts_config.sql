begin;

-- Parts alert configuration table
create table if not exists public.parts_alerts_config (
  id bigint primary key generated always as identity,
  branch text not null,
  alert_type text not null,
  part_number text,
  product_category text,
  threshold_value numeric,
  threshold_unit text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch, alert_type, part_number, product_category)
);

-- Insert default alert thresholds
insert into public.parts_alerts_config (branch, alert_type, threshold_value, threshold_unit, enabled)
values
  ('TPEM-PARTS-N4-RJ-500A840-MbtPlt-Jaipur', 'low_stock', 2, 'weeks_of_supply', true),
  ('TPEM-PARTS-N4-RJ-500A840-MbtPlt-Jaipur', 'delayed_order', 7, 'days_past_eta', true),
  ('TPEM-PARTS-N4-RJ-500A840-MbtPlt-Jaipur', 'consumption_spike', 30, 'percent_increase', true)
on conflict (branch, alert_type, part_number, product_category) do nothing;

-- RLS policies for alerts config
alter table public.parts_alerts_config enable row level security;

drop policy if exists parts_alerts_config_select_anon on public.parts_alerts_config;
create policy parts_alerts_config_select_anon
  on public.parts_alerts_config
  for select
  to anon, authenticated
  using (true);

drop policy if exists parts_alerts_config_insert_anon on public.parts_alerts_config;
create policy parts_alerts_config_insert_anon
  on public.parts_alerts_config
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists parts_alerts_config_update_anon on public.parts_alerts_config;
create policy parts_alerts_config_update_anon
  on public.parts_alerts_config
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists parts_alerts_config_delete_anon on public.parts_alerts_config;
create policy parts_alerts_config_delete_anon
  on public.parts_alerts_config
  for delete
  to anon, authenticated
  using (true);

-- Index for alert lookups
create index if not exists idx_parts_alerts_config_branch_type
  on public.parts_alerts_config (branch, alert_type);

commit;
