begin;
-- Extend service_parts_order_data with portal awareness and detailed order tracking
alter table if exists public.service_parts_order_data
  add column if not exists portal text default 'EV',
  add column if not exists div_id text,
  add column if not exists dealer_name text,
  add column if not exists invoice_number text,
  add column if not exists crm_order_number text,
  add column if not exists sap_order_number text,
  add column if not exists sap_order_line_item text,
  add column if not exists spares_order_type text,
  add column if not exists confirmation_date date,
  add column if not exists confirmation_qty numeric,
  add column if not exists challan_no text,
  add column if not exists challan_date date,
  add column if not exists challan_qty numeric,
  add column if not exists invoice_date date,
  add column if not exists invoice_qty numeric,
  add column if not exists docket_number text,
  add column if not exists eta_1 date,
  add column if not exists eta_2 date,
  add column if not exists eta_3 date,
  add column if not exists intransit_qty numeric;
-- Add computed column for order status
alter table if exists public.service_parts_order_data
  add column if not exists order_status text;
-- Create trigger to compute order status
create or replace function public.compute_parts_order_status()
returns trigger
language plpgsql
as $$
begin
  new.order_status := case
    when new.received_quantity >= new.ordered_quantity then 'Received'
    when new.confirmation_qty > 0 then 'Confirmed'
    when new.invoice_qty > 0 then 'Invoiced'
    when new.challan_qty > 0 then 'In-Transit'
    when new.order_date is not null then 'Ordered'
    else null
  end;
  return new;
end;
$$;
-- Trigger on insert and update
drop trigger if exists trg_parts_order_status on public.service_parts_order_data;
create trigger trg_parts_order_status
  before insert or update on public.service_parts_order_data
  for each row execute function public.compute_parts_order_status();
-- Drop and recreate unique constraint to include portal
drop index if exists uq_parts_order_conflict;
create unique index if not exists uq_parts_order_conflict
  on public.service_parts_order_data (part_number, branch, portal, order_date, source_row_hash)
  where branch is not null and source_row_hash is not null;
-- Indexes for order filtering and status tracking
create index if not exists idx_parts_order_branch_portal_date
  on public.service_parts_order_data (branch, portal, order_date);
create index if not exists idx_parts_order_status
  on public.service_parts_order_data (order_status, branch, portal);
create index if not exists idx_parts_order_part_portal
  on public.service_parts_order_data (part_number, branch, portal);
create index if not exists idx_parts_order_dealer
  on public.service_parts_order_data (dealer_name, branch, portal);
create index if not exists idx_parts_order_eta
  on public.service_parts_order_data (eta_1, branch, portal);
commit;
