begin;

-- Extend service_parts_consumption_data with portal awareness and fiscal year tracking
alter table if exists public.service_parts_consumption_data
  add column if not exists portal text default 'EV',
  add column if not exists fiscal_year integer,
  add column if not exists month_name text;

-- Rename quantity_consumed to total_consumption for clarity (add new column first, then update, then drop old)
alter table if exists public.service_parts_consumption_data
  add column if not exists total_consumption numeric;

-- Backfill total_consumption from quantity_consumed if it exists
update public.service_parts_consumption_data
set total_consumption = coalesce(quantity_consumed, 0)
where total_consumption is null;

-- Drop and recreate unique constraint to include portal and fiscal dimensions
drop index if exists uq_parts_consumption_conflict;
create unique index if not exists uq_parts_consumption_conflict
  on public.service_parts_consumption_data (part_number, branch, portal, fiscal_year, month_name, source_row_hash)
  where branch is not null and source_row_hash is not null and fiscal_year is not null;

-- Indexes for consumption trend queries
create index if not exists idx_parts_consumption_branch_portal_fiscal
  on public.service_parts_consumption_data (branch, portal, fiscal_year, month_name);

create index if not exists idx_parts_consumption_part_portal
  on public.service_parts_consumption_data (part_number, branch, portal);

-- Ensure otc_quantity and ws_quantity columns exist and sum to total_consumption
alter table if exists public.service_parts_consumption_data
  add column if not exists otc_quantity numeric not null default 0,
  add column if not exists ws_quantity numeric not null default 0;

commit;
