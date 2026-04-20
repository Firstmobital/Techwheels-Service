-- Rebuild job_card_closed_data table with 16 business columns
-- Drop existing table and constraints
drop trigger if exists trg_job_card_closed_data_updated_at on job_card_closed_data;
drop table if exists job_card_closed_data;

-- Create new job_card_closed_data table with full schema
create table job_card_closed_data (
  id bigint primary key generated always as identity,
  
  -- System columns
  branch text not null check (branch in ('AJ', 'JG PV', 'JG EV')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- 16 Business columns
  job_card_number text,
  sr_type text,
  chassis_no text,
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
  account_phone_number text
);

-- Recreate trigger for updated_at
create trigger trg_job_card_closed_data_updated_at
  before update on job_card_closed_data
  for each row execute function set_updated_at();

-- Ensure import_metadata entry exists for job_card_closed_data
insert into import_metadata (table_name, last_updated_at)
values ('job_card_closed_data', null)
on conflict (table_name) do nothing;
