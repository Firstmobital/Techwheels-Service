begin;
-- Extend service_parts_stock_snapshot_data with portal awareness and location details
alter table if exists public.service_parts_stock_snapshot_data
  add column if not exists portal text default 'EV',
  add column if not exists last_issue_date timestamptz,
  add column if not exists last_received_date timestamptz,
  add column if not exists availability_status text,
  add column if not exists status text,
  add column if not exists location_1 text,
  add column if not exists inventory_location text,
  add column if not exists location_2 text,
  add column if not exists location_3 text,
  add column if not exists weighted_avg_cost numeric,
  add column if not exists total_price_value numeric;
-- Drop and recreate unique constraint to include portal
drop index if exists uq_parts_stock_conflict;
create unique index if not exists uq_parts_stock_conflict
  on public.service_parts_stock_snapshot_data (part_number, branch, portal, snapshot_date, source_row_hash)
  where branch is not null and source_row_hash is not null;
-- Indexes for efficient latest snapshot queries and filtering
create index if not exists idx_parts_stock_branch_portal_date
  on public.service_parts_stock_snapshot_data (branch, portal, snapshot_date desc);
create index if not exists idx_parts_stock_part_branch_portal
  on public.service_parts_stock_snapshot_data (part_number, branch, portal);
create index if not exists idx_parts_stock_location
  on public.service_parts_stock_snapshot_data (location_1, inventory_location);
commit;
