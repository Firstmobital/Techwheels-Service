-- Create Closed but not Invoiced upload table.

create table if not exists public.closed_but_not_invoiced (
  id bigint generated always as identity primary key,
  branch text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  job_card_number text not null,
  status text,
  vehicle_registration_number text,
  job_card_channel text,
  created_date_time timestamp with time zone,
  completed_date_time timestamp with time zone,
  closed_date_time timestamp with time zone,
  service_request_no text,
  account text,
  last_name text,
  first_name text,
  labour_rate_list text,
  sr_assigned_to text,
  parts_price_list text,
  customer_po_ref text,
  delivery_variance_percent numeric,
  sr_type text,
  payment_type text,
  fms text,
  insurance_company_name text,
  insurance_type text,
  insurance_expiry_date date,
  open_for_days integer,
  parts_entry_complete text,
  crn text,
  action_on_delay_reason text,
  arn text,
  account_phone_number text,
  contact_phones text,
  vehicle_delivery_date date,
  effective_final_delivery_estimate_date timestamp with time zone,
  delivery_variance_hours numeric,
  effective_total_estimate numeric,
  total_estimate_variance_percent numeric,
  balance_payment_to_be_adjusted numeric,
  total_payment_amount_adjusted numeric,
  parent_product_line text,
  product_line text,
  division text,
  total_invoice_amount numeric,
  kms numeric,
  hours numeric,
  vehicle_sale_date date,
  tm_invoice_date date,
  warranty text,
  amc text,
  final_labour_amount numeric,
  final_spares_amount numeric,
  total_order_value numeric,
  delay_reason text,
  jobs_entry_complete text,
  supervisor text,
  invoiced text,
  invoice_format text,
  chassis_number text,
  constraint closed_but_not_invoiced_branch_check
    check (branch in ('Ajmer Road', 'Sitapura PV', 'Sitapura EV')),
  constraint closed_but_not_invoiced_job_card_number_branch_key
    unique (job_card_number, branch)
);

insert into public.import_metadata (table_name, last_updated_at)
values ('closed_but_not_invoiced', null)
on conflict (table_name) do nothing;

drop trigger if exists trg_closed_but_not_invoiced_updated_at on public.closed_but_not_invoiced;
create trigger trg_closed_but_not_invoiced_updated_at
  before update on public.closed_but_not_invoiced
  for each row execute function public.set_updated_at();

create index if not exists idx_closed_but_not_invoiced_branch
  on public.closed_but_not_invoiced (branch);

create index if not exists idx_closed_but_not_invoiced_closed_date_time
  on public.closed_but_not_invoiced (closed_date_time);

notify pgrst, 'reload schema';
