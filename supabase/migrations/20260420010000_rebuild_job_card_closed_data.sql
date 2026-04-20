-- Rebuild Job Card Closed Data table to match strict JC Closed import schema
-- This migration intentionally drops existing table data.

drop table if exists job_card_closed_data;

create table job_card_closed_data (
  id bigint primary key generated always as identity,
  job_card_number text,
  sr_type text,
  chassis_no text,
  final_labour_amount numeric(14, 2),
  final_spares_amount numeric(14, 2),
  total_invoice_amount numeric(14, 2),
  parent_product_line text,
  product_line text,
  created_date_time timestamptz,
  closed_date_time timestamptz,
  first_name text,
  last_name text,
  sr_assigned_to text,
  vehicle_registration_number text,
  vehicle_sale_date_dealer date,
  account_phone_number text,
  branch text check (branch in ('AJ', 'JG PV', 'JG EV')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_job_card_closed_data_updated_at on job_card_closed_data;

create trigger trg_job_card_closed_data_updated_at
  before update on job_card_closed_data
  for each row execute function set_updated_at();
