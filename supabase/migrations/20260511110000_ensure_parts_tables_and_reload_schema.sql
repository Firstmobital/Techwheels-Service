begin;
-- Ensure parts tables exist in the API schema even if earlier migrations were skipped.
create table if not exists public.service_parts_consumption_data (
  id bigint primary key generated always as identity,
  part_number text not null,
  part_description text,
  transaction_date date,
  otc_quantity numeric not null default 0,
  ws_quantity numeric not null default 0,
  quantity_consumed numeric not null default 0,
  unit_cost numeric,
  total_cost numeric,
  source_reference text,
  source_row_hash text not null,
  branch text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
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
-- Ensure OTC/WS columns exist in already-created schemas.
alter table if exists public.service_parts_consumption_data
  add column if not exists otc_quantity numeric not null default 0,
  add column if not exists ws_quantity numeric not null default 0,
  add column if not exists quantity_consumed numeric not null default 0;
-- Refresh PostgREST schema cache so newly created tables are visible immediately.
notify pgrst, 'reload schema';
commit;
