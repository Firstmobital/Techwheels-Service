-- Employee master data and import mapping support

create table if not exists employee_master (
  id bigint primary key generated always as identity,
  employee_code text not null unique,
  employee_name text not null,
  location text,
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_master_name_normalized
  on employee_master (lower(trim(employee_name)));

alter table service_vas_jc_data
  add column if not exists employee_code text;

alter table job_card_closed_data
  add column if not exists employee_code text;

create index if not exists idx_service_vas_jc_data_employee_code
  on service_vas_jc_data (employee_code);

create index if not exists idx_job_card_closed_data_employee_code
  on job_card_closed_data (employee_code);

alter table service_vas_jc_data
  drop constraint if exists fk_service_vas_employee_code;
alter table service_vas_jc_data
  add constraint fk_service_vas_employee_code
  foreign key (employee_code)
  references employee_master (employee_code)
  on update cascade
  on delete set null;

alter table job_card_closed_data
  drop constraint if exists fk_jc_closed_employee_code;
alter table job_card_closed_data
  add constraint fk_jc_closed_employee_code
  foreign key (employee_code)
  references employee_master (employee_code)
  on update cascade
  on delete set null;

create table if not exists import_employee_mapping_issues (
  id bigint primary key generated always as identity,
  source_table text not null check (source_table in ('service_vas_jc_data', 'job_card_closed_data')),
  branch text not null check (branch in ('AJ', 'JG PV', 'JG EV')),
  row_number integer,
  job_card_number text,
  sr_assigned_to text,
  resolved_employee_code text,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mapping_issues_status_created
  on import_employee_mapping_issues (status, created_at desc);

create index if not exists idx_mapping_issues_source_branch
  on import_employee_mapping_issues (source_table, branch);

alter table import_employee_mapping_issues
  drop constraint if exists fk_mapping_issue_employee_code;
alter table import_employee_mapping_issues
  add constraint fk_mapping_issue_employee_code
  foreign key (resolved_employee_code)
  references employee_master (employee_code)
  on update cascade
  on delete set null;

create trigger trg_employee_master_updated_at
  before update on employee_master
  for each row execute function set_updated_at();

create trigger trg_import_employee_mapping_issues_updated_at
  before update on import_employee_mapping_issues
  for each row execute function set_updated_at();
