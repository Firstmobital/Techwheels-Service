begin;

-- Shared trigger function for updated_at maintenance.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Employee master data.
create table if not exists public.employee_master (
  id bigint primary key generated always as identity,
  employee_code text not null unique,
  employee_name text not null,
  location text,
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_master_name_normalized
  on public.employee_master (lower(trim(employee_name)));

-- Job Card Closed (final schema).
create table if not exists public.job_card_closed_data (
  id bigint primary key generated always as identity,
  branch text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
  employee_code text,
  unique (job_card_number, branch),
  constraint fk_jc_closed_employee_code
    foreign key (employee_code)
    references public.employee_master (employee_code)
    on update cascade
    on delete set null
);

create index if not exists idx_job_card_closed_data_employee_code
  on public.job_card_closed_data (employee_code);

-- Service Invoice (final schema).
create table if not exists public.service_invoice_data (
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
  branch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Service VAS JC (final schema + employee mapping support).
create table if not exists public.service_vas_jc_data (
  id bigint primary key generated always as identity,
  branch text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
  net_price numeric,
  job_value numeric,
  discount numeric,
  billing_hours numeric,
  jc_closed_date_time timestamptz,
  employee_code text,
  constraint fk_service_vas_employee_code
    foreign key (employee_code)
    references public.employee_master (employee_code)
    on update cascade
    on delete set null
);

create index if not exists idx_service_vas_jc_data_employee_code
  on public.service_vas_jc_data (employee_code);

-- Service JC Parts.
create table if not exists public.service_jc_parts_data (
  id bigint primary key generated always as identity,
  jc_number text,
  service_record text,
  branch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Import metadata table.
create table if not exists public.import_metadata (
  id bigint primary key generated always as identity,
  table_name text not null unique,
  last_updated_at timestamptz
);

insert into public.import_metadata (table_name, last_updated_at)
values
  ('job_card_closed_data', null),
  ('service_invoice_data', null),
  ('service_vas_jc_data', null),
  ('service_jc_parts_data', null)
on conflict (table_name) do nothing;

-- Employee mapping issues table.
create table if not exists public.import_employee_mapping_issues (
  id bigint primary key generated always as identity,
  source_table text not null check (source_table in ('service_vas_jc_data', 'job_card_closed_data')),
  branch text not null,
  row_number integer,
  job_card_number text,
  sr_assigned_to text,
  resolved_employee_code text,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_mapping_issue_employee_code
    foreign key (resolved_employee_code)
    references public.employee_master (employee_code)
    on update cascade
    on delete set null
);

create index if not exists idx_mapping_issues_status_created
  on public.import_employee_mapping_issues (status, created_at desc);

create index if not exists idx_mapping_issues_source_branch
  on public.import_employee_mapping_issues (source_table, branch);

-- Updated_at triggers.
drop trigger if exists trg_employee_master_updated_at on public.employee_master;
create trigger trg_employee_master_updated_at
  before update on public.employee_master
  for each row execute function public.set_updated_at();

drop trigger if exists trg_job_card_closed_data_updated_at on public.job_card_closed_data;
create trigger trg_job_card_closed_data_updated_at
  before update on public.job_card_closed_data
  for each row execute function public.set_updated_at();

drop trigger if exists trg_service_invoice_data_updated_at on public.service_invoice_data;
create trigger trg_service_invoice_data_updated_at
  before update on public.service_invoice_data
  for each row execute function public.set_updated_at();

drop trigger if exists trg_service_vas_jc_data_updated_at on public.service_vas_jc_data;
create trigger trg_service_vas_jc_data_updated_at
  before update on public.service_vas_jc_data
  for each row execute function public.set_updated_at();

drop trigger if exists trg_service_jc_parts_data_updated_at on public.service_jc_parts_data;
create trigger trg_service_jc_parts_data_updated_at
  before update on public.service_jc_parts_data
  for each row execute function public.set_updated_at();

drop trigger if exists trg_import_employee_mapping_issues_updated_at on public.import_employee_mapping_issues;
create trigger trg_import_employee_mapping_issues_updated_at
  before update on public.import_employee_mapping_issues
  for each row execute function public.set_updated_at();

commit;
