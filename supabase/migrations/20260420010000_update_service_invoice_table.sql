-- Recreate service_invoice_data with only required invoice columns
drop trigger if exists trg_service_invoice_data_updated_at on service_invoice_data;

drop table if exists service_invoice_data;

create table service_invoice_data (
  id bigint primary key generated always as identity,
  invoice_number text,
  invoice_date date,
  bill_to_first_name text,
  bill_to_last_name text,
  final_labour_invoice_amount numeric,
  final_spares_invoice_amount numeric,
  final_consolidated_invoice_amount numeric,
  order_number text,
  sr_number text,
  chassis_number text,
  vrn text,
  branch text check (branch in ('AJ', 'JG PV', 'JG EV')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_service_invoice_data_updated_at
  before update on service_invoice_data
  for each row execute function set_updated_at();