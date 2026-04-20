-- Rebuild job_card_closed_data with strict final schema.
-- WARNING: This drops existing data from job_card_closed_data.

drop trigger if exists trg_job_card_closed_data_updated_at on job_card_closed_data;
drop table if exists job_card_closed_data;

create table job_card_closed_data (
  -- System columns
  id bigint primary key generated always as identity,
  branch text not null check (branch in ('Ajmer Road', 'Sitapura PV', 'Sitapura EV')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Required business columns
  job_card_number text,
  sr_type text,
  chassis_number text,
  final_labour_amount numeric,
  final_spares_amount numeric,
  total_invoice_amount numeric,
  parent_product_line text,
  product_line text,
  created_date_time timestamptz,
  closed_date_time timestamptz,
  first_name text,
  last_name text,
  sr_assigned_to text,
  vehicle_registration_number text,
  vehicle_sale_date date,
  account_phone_number text,

  -- Upsert dedupe key
  unique (job_card_number, branch)
);

create trigger trg_job_card_closed_data_updated_at
  before update on job_card_closed_data
  for each row execute function set_updated_at();

insert into import_metadata (table_name, last_updated_at)
values ('job_card_closed_data', null)
on conflict (table_name) do nothing;
