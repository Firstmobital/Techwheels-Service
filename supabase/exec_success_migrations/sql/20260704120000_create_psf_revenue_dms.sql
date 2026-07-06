create table if not exists public.psf_revenue_dms (
  id bigint generated always as identity primary key,
  branch text not null,
  location text,
  portal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  invoice_number text,
  invoice_date date,
  account text,
  first_name text,
  last_name text,
  invoice_type text,
  invoice_format text,
  invoice_status text,
  final_labour_amount numeric,
  final_spares_amount numeric,
  total_invoice_amount numeric,
  job_card_number text,
  sr_number text,
  chassis_number text,
  vehicle_registration_number text,
  irn text,
  irn_date date,
  irn_status text,
  irn_cancellation_date date,
  tcs_percent numeric,
  tcs_assessable_amount numeric,
  final_tcs_amount numeric,
  cancellation_reason text,
  arn text,
  crn text,
  contact_home_phone text,
  account_phone_number text,
  contact_cell_phone text,
  contact_work_phone text,
  jc_supervisor text,
  delivery_date date,
  reason_for_delay text,
  sr_type text,
  kms_run numeric,
  sr_assigned_to text,
  employee_code text references public.employee_master(employee_code) on update cascade on delete set null,
  discounts_labour numeric,
  other_charges_labour numeric,
  service_tax numeric,
  swachh_bharat_cess_amount numeric,
  krishi_kalyan_cess_amount numeric,
  wct numeric,
  education_cess numeric,
  discounts_parts numeric,
  other_charges_parts numeric,
  tax_parts numeric,
  mode_of_payment text,
  invoice_cancellation_date date,
  prolife_flag text,

  constraint psf_revenue_dms_portal_check check (portal is null or portal in ('EV', 'PV'))
);

create unique index if not exists uq_psf_revenue_dms_location_portal_job_card_invoice_date
  on public.psf_revenue_dms (location, portal, job_card_number, invoice_date)
  where job_card_number is not null
    and btrim(job_card_number) <> ''
    and invoice_date is not null
    and location is not null
    and btrim(location) <> ''
    and portal is not null
    and btrim(portal) <> '';

create index if not exists idx_psf_revenue_dms_invoice_date
  on public.psf_revenue_dms (invoice_date);

create index if not exists idx_psf_revenue_dms_employee_code
  on public.psf_revenue_dms (employee_code);

create index if not exists idx_psf_revenue_dms_location_portal
  on public.psf_revenue_dms (location, portal);

drop trigger if exists trg_psf_revenue_dms_updated_at on public.psf_revenue_dms;

create trigger trg_psf_revenue_dms_updated_at
  before update on public.psf_revenue_dms
  for each row execute function public.set_updated_at();

alter table public.psf_revenue_dms enable row level security;

create policy psf_revenue_dms_select_authenticated
  on public.psf_revenue_dms for select
  to authenticated using (true);

create policy psf_revenue_dms_insert_authenticated
  on public.psf_revenue_dms for insert
  to authenticated with check (true);

create policy psf_revenue_dms_update_authenticated
  on public.psf_revenue_dms for update
  to authenticated using (true) with check (true);

create policy psf_revenue_dms_delete_authenticated
  on public.psf_revenue_dms for delete
  to authenticated using (true);

alter table public.import_employee_mapping_issues
  drop constraint if exists import_employee_mapping_issues_source_table_check;

alter table public.import_employee_mapping_issues
  add constraint import_employee_mapping_issues_source_table_check
  check (source_table = any (array[
    'service_vas_jc_data'::text,
    'job_card_closed_data'::text,
    'psf_revenue_dms'::text
  ]));
