begin;

-- Parts consumption transactions (history).
create table if not exists public.service_parts_consumption_data (
  id bigint primary key generated always as identity,
  part_number text not null,
  part_description text,
  transaction_date date,
  quantity_consumed numeric not null default 0,
  unit_cost numeric,
  total_cost numeric,
  source_reference text,
  source_row_hash text not null,
  branch text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Parts order and in-transit data (history).
create table if not exists public.service_parts_order_data (
  id bigint primary key generated always as identity,
  part_number text not null,
  part_description text,
  order_date date,
  expected_date date,
  ordered_quantity numeric not null default 0,
  received_quantity numeric not null default 0,
  backorder_quantity numeric not null default 0,
  status text,
  source_document_id text,
  source_row_hash text not null,
  branch text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- On-hand inventory snapshots.
create table if not exists public.service_parts_stock_snapshot_data (
  id bigint primary key generated always as identity,
  part_number text not null,
  part_description text,
  snapshot_date date not null,
  on_hand_quantity numeric not null default 0,
  weighted_cost numeric,
  inventory_value numeric,
  source_row_hash text not null,
  branch text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional canonical part metadata (global part number key).
create table if not exists public.part_master (
  part_number text primary key,
  part_description text,
  uom text,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Replace legacy import metadata entry for parts sheet with three new sheets.
delete from public.import_metadata
where table_name = 'service_jc_parts_data';

insert into public.import_metadata (table_name, last_updated_at)
values
  ('service_parts_consumption_data', null),
  ('service_parts_order_data', null),
  ('service_parts_stock_snapshot_data', null)
on conflict (table_name) do nothing;

-- Uniqueness for idempotent re-imports.
create unique index if not exists uq_parts_consumption_conflict
  on public.service_parts_consumption_data (part_number, branch, transaction_date, source_row_hash);

create unique index if not exists uq_parts_order_conflict
  on public.service_parts_order_data (part_number, branch, order_date, source_row_hash);

create unique index if not exists uq_parts_stock_conflict
  on public.service_parts_stock_snapshot_data (part_number, branch, snapshot_date, source_row_hash);

-- Reporting and filtering indexes.
create index if not exists idx_parts_consumption_part
  on public.service_parts_consumption_data (part_number);
create index if not exists idx_parts_consumption_branch_date
  on public.service_parts_consumption_data (branch, transaction_date);

create index if not exists idx_parts_order_part
  on public.service_parts_order_data (part_number);
create index if not exists idx_parts_order_branch_date
  on public.service_parts_order_data (branch, order_date);

create index if not exists idx_parts_stock_part
  on public.service_parts_stock_snapshot_data (part_number);
create index if not exists idx_parts_stock_branch_date
  on public.service_parts_stock_snapshot_data (branch, snapshot_date);

-- Keep part_master synchronized from imports.
insert into public.part_master (part_number, part_description)
select distinct part_number, nullif(part_description, '')
from public.service_parts_consumption_data
where part_number is not null and trim(part_number) <> ''
on conflict (part_number) do nothing;

insert into public.part_master (part_number, part_description)
select distinct part_number, nullif(part_description, '')
from public.service_parts_order_data
where part_number is not null and trim(part_number) <> ''
on conflict (part_number) do nothing;

insert into public.part_master (part_number, part_description)
select distinct part_number, nullif(part_description, '')
from public.service_parts_stock_snapshot_data
where part_number is not null and trim(part_number) <> ''
on conflict (part_number) do nothing;

-- updated_at triggers.
drop trigger if exists trg_service_parts_consumption_data_updated_at on public.service_parts_consumption_data;
create trigger trg_service_parts_consumption_data_updated_at
  before update on public.service_parts_consumption_data
  for each row execute function public.set_updated_at();

drop trigger if exists trg_service_parts_order_data_updated_at on public.service_parts_order_data;
create trigger trg_service_parts_order_data_updated_at
  before update on public.service_parts_order_data
  for each row execute function public.set_updated_at();

drop trigger if exists trg_service_parts_stock_snapshot_data_updated_at on public.service_parts_stock_snapshot_data;
create trigger trg_service_parts_stock_snapshot_data_updated_at
  before update on public.service_parts_stock_snapshot_data
  for each row execute function public.set_updated_at();

drop trigger if exists trg_part_master_updated_at on public.part_master;
create trigger trg_part_master_updated_at
  before update on public.part_master
  for each row execute function public.set_updated_at();

commit;
