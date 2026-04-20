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

-- Create service_vas_jc_data table
create table if not exists service_vas_jc_data (
  id bigint primary key generated always as identity,
  jc_number text,
  service_record text,
  branch text check (branch in ('AJ', 'JG PV', 'JG EV')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
