begin;
-- Ensure RLS does not block frontend imports for parts tables.
alter table if exists public.service_parts_consumption_data enable row level security;
alter table if exists public.service_parts_order_data enable row level security;
alter table if exists public.service_parts_stock_snapshot_data enable row level security;
alter table if exists public.part_master enable row level security;
alter table if exists public.import_metadata enable row level security;
-- Consumption policies.
drop policy if exists parts_consumption_select_anon on public.service_parts_consumption_data;
create policy parts_consumption_select_anon
  on public.service_parts_consumption_data
  for select
  to anon, authenticated
  using (true);
drop policy if exists parts_consumption_insert_anon on public.service_parts_consumption_data;
create policy parts_consumption_insert_anon
  on public.service_parts_consumption_data
  for insert
  to anon, authenticated
  with check (true);
drop policy if exists parts_consumption_update_anon on public.service_parts_consumption_data;
create policy parts_consumption_update_anon
  on public.service_parts_consumption_data
  for update
  to anon, authenticated
  using (true)
  with check (true);
drop policy if exists parts_consumption_delete_anon on public.service_parts_consumption_data;
create policy parts_consumption_delete_anon
  on public.service_parts_consumption_data
  for delete
  to anon, authenticated
  using (true);
-- Order policies.
drop policy if exists parts_order_select_anon on public.service_parts_order_data;
create policy parts_order_select_anon
  on public.service_parts_order_data
  for select
  to anon, authenticated
  using (true);
drop policy if exists parts_order_insert_anon on public.service_parts_order_data;
create policy parts_order_insert_anon
  on public.service_parts_order_data
  for insert
  to anon, authenticated
  with check (true);
drop policy if exists parts_order_update_anon on public.service_parts_order_data;
create policy parts_order_update_anon
  on public.service_parts_order_data
  for update
  to anon, authenticated
  using (true)
  with check (true);
drop policy if exists parts_order_delete_anon on public.service_parts_order_data;
create policy parts_order_delete_anon
  on public.service_parts_order_data
  for delete
  to anon, authenticated
  using (true);
-- Stock policies.
drop policy if exists parts_stock_select_anon on public.service_parts_stock_snapshot_data;
create policy parts_stock_select_anon
  on public.service_parts_stock_snapshot_data
  for select
  to anon, authenticated
  using (true);
drop policy if exists parts_stock_insert_anon on public.service_parts_stock_snapshot_data;
create policy parts_stock_insert_anon
  on public.service_parts_stock_snapshot_data
  for insert
  to anon, authenticated
  with check (true);
drop policy if exists parts_stock_update_anon on public.service_parts_stock_snapshot_data;
create policy parts_stock_update_anon
  on public.service_parts_stock_snapshot_data
  for update
  to anon, authenticated
  using (true)
  with check (true);
drop policy if exists parts_stock_delete_anon on public.service_parts_stock_snapshot_data;
create policy parts_stock_delete_anon
  on public.service_parts_stock_snapshot_data
  for delete
  to anon, authenticated
  using (true);
-- Part master policies.
drop policy if exists part_master_select_anon on public.part_master;
create policy part_master_select_anon
  on public.part_master
  for select
  to anon, authenticated
  using (true);
drop policy if exists part_master_insert_anon on public.part_master;
create policy part_master_insert_anon
  on public.part_master
  for insert
  to anon, authenticated
  with check (true);
drop policy if exists part_master_update_anon on public.part_master;
create policy part_master_update_anon
  on public.part_master
  for update
  to anon, authenticated
  using (true)
  with check (true);
-- Import metadata policies used by upload status updates.
drop policy if exists import_metadata_select_anon on public.import_metadata;
create policy import_metadata_select_anon
  on public.import_metadata
  for select
  to anon, authenticated
  using (true);
drop policy if exists import_metadata_insert_anon on public.import_metadata;
create policy import_metadata_insert_anon
  on public.import_metadata
  for insert
  to anon, authenticated
  with check (true);
drop policy if exists import_metadata_update_anon on public.import_metadata;
create policy import_metadata_update_anon
  on public.import_metadata
  for update
  to anon, authenticated
  using (true)
  with check (true);
-- Refresh PostgREST schema cache.
notify pgrst, 'reload schema';
commit;
