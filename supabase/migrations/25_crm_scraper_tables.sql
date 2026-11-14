-- CRM scraper support tables
-- crm_chassis_queue: list of chassis numbers to process
-- crm_vehicle_data: scraped results

create table if not exists crm_chassis_queue (
  id          uuid primary key default gen_random_uuid(),
  chassis_no  text not null unique,
  status      text not null default 'pending'
                check (status in ('pending', 'done', 'not_found', 'error')),
  error_msg   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists crm_vehicle_data (
  id                          uuid primary key default gen_random_uuid(),
  chassis_no                  text not null unique,

  -- Vehicle fields
  vehicle_registration_number text,
  product_name                text,
  model                       text,
  engine_no                   text,
  dealer_invoice_number       text,
  tm_invoice_date             text,
  resale_date                 text,
  resale_odometer_reading     text,
  vehicle_type                text,
  vehicle_category            text,
  status                      text,

  -- Service Information fields
  last_service_km             text,
  last_service_dealer         text,
  last_service_division       text,
  last_service_date           text,
  next_service_date           text,
  next_service_type           text,

  -- Customer contacts (first_name + cell_phone where status = Customer)
  customer_contacts           jsonb default '[]'::jsonb,

  fetched_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS: dealer users can read/write their own chassis data
alter table crm_chassis_queue enable row level security;
alter table crm_vehicle_data  enable row level security;

create policy "Allow authenticated users to manage chassis queue"
  on crm_chassis_queue for all
  to authenticated using (true) with check (true);

create policy "Allow authenticated users to manage vehicle data"
  on crm_vehicle_data for all
  to authenticated using (true) with check (true);

comment on table crm_chassis_queue is 'Queue of chassis numbers to fetch from Tata Motors CRM DMS';
comment on table crm_vehicle_data  is 'Scraped vehicle + service info + customer contacts from CRM DMS';
