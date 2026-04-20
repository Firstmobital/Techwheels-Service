-- Create job_card_closed_data table
create table if not exists job_card_closed_data (
  id bigint primary key generated always as identity,
  jc_number text,
  service_record text,
  branch text check (branch in ('AJ', 'JG PV', 'JG EV')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create service_invoice_data table
create table if not exists service_invoice_data (
  id bigint primary key generated always as identity,
  jc_number text,
  service_record text,
  branch text check (branch in ('AJ', 'JG PV', 'JG EV')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create service_vas_jc_data table (NEW SCHEMA: 20 business columns + 4 system)
drop table if exists service_vas_jc_data;
create table service_vas_jc_data (
  -- System columns
  id bigint primary key generated always as identity,
  branch text not null check (branch in ('AJ', 'JG PV', 'JG EV')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Text columns (15)
  job_card_number text,
  vrn text,
  complaint_code text,
  job_code text,
  job_description text,
  job_status text,
  chassis_number text,
  model text,
  product_line text,
  billing_type text,
  sr_assigned_to text,
  rate_type text,
  sr_type text,
  performed_by text,
  sr_number text,
  
  -- Numeric columns (4)
  net_price numeric,
  job_value numeric,
  discount numeric,
  billing_hours numeric,
  
  -- Timestamp column (1)
  jc_closed_date_time timestamptz
);

-- Create service_jc_parts_data table
create table if not exists service_jc_parts_data (
  id bigint primary key generated always as identity,
  jc_number text,
  service_record text,
  branch text check (branch in ('AJ', 'JG PV', 'JG EV')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create import_metadata table
create table if not exists import_metadata (
  id bigint primary key generated always as identity,
  table_name text not null unique,
  last_updated_at timestamptz
);

-- Seed import_metadata with one row per managed table
insert into import_metadata (table_name, last_updated_at)
values
  ('job_card_closed_data', null),
  ('service_invoice_data', null),
  ('service_vas_jc_data', null),
  ('service_jc_parts_data', null)
on conflict (table_name) do nothing;

-- Trigger function to keep updated_at current
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_job_card_closed_data_updated_at
  before update on job_card_closed_data
  for each row execute function set_updated_at();

create trigger trg_service_invoice_data_updated_at
  before update on service_invoice_data
  for each row execute function set_updated_at();

create trigger trg_service_vas_jc_data_updated_at
  before update on service_vas_jc_data
  for each row execute function set_updated_at();

create trigger trg_service_jc_parts_data_updated_at
  before update on service_jc_parts_data
  for each row execute function set_updated_at();
