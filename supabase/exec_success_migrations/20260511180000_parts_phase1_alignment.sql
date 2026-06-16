begin;
-- Align conflict keys with importer behavior.
drop index if exists uq_parts_consumption_conflict;
create unique index if not exists uq_parts_consumption_conflict
  on public.service_parts_consumption_data (part_number, branch, portal, fiscal_year, month_name, source_row_hash)
  where branch is not null
    and portal is not null
    and fiscal_year is not null
    and month_name is not null
    and source_row_hash is not null;
drop index if exists uq_parts_order_conflict;
create unique index if not exists uq_parts_order_conflict
  on public.service_parts_order_data (part_number, branch, portal, invoice_number, source_row_hash);
-- Keep order lifecycle status consistent for downstream reports.
create or replace function public.compute_parts_order_status()
returns trigger
language plpgsql
as $$
begin
  new.order_status := case
    when coalesce(new.received_quantity, 0) >= coalesce(new.ordered_quantity, 0)
      and coalesce(new.ordered_quantity, 0) > 0 then 'Received'
    when coalesce(new.intransit_qty, 0) > 0 or coalesce(new.challan_qty, 0) > 0 then 'In-Transit'
    when coalesce(new.invoice_qty, 0) > 0 then 'Invoiced'
    when coalesce(new.confirmation_qty, 0) > 0 then 'Confirmed'
    when new.order_date is not null then 'Ordered'
    else null
  end;
  return new;
end;
$$;
-- Data integrity guardrails.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_parts_consumption_sum'
  ) then
    alter table public.service_parts_consumption_data
      add constraint ck_parts_consumption_sum
      check (
        coalesce(total_consumption, 0) = coalesce(otc_quantity, 0) + coalesce(ws_quantity, 0)
      ) not valid;
  end if;
end;
$$;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_parts_consumption_period'
  ) then
    alter table public.service_parts_consumption_data
      add constraint ck_parts_consumption_period
      check (fiscal_year is not null and month_name is not null) not valid;
  end if;
end;
$$;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_parts_consumption_non_negative'
  ) then
    alter table public.service_parts_consumption_data
      add constraint ck_parts_consumption_non_negative
      check (
        coalesce(otc_quantity, 0) >= 0
        and coalesce(ws_quantity, 0) >= 0
        and coalesce(total_consumption, 0) >= 0
      ) not valid;
  end if;
end;
$$;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_parts_stock_non_negative'
  ) then
    alter table public.service_parts_stock_snapshot_data
      add constraint ck_parts_stock_non_negative
      check (coalesce(on_hand_quantity, 0) >= 0) not valid;
  end if;
end;
$$;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_parts_order_non_negative'
  ) then
    alter table public.service_parts_order_data
      add constraint ck_parts_order_non_negative
      check (
        coalesce(ordered_quantity, 0) >= 0
        and coalesce(received_quantity, 0) >= 0
        and coalesce(backorder_quantity, 0) >= 0
        and coalesce(intransit_qty, 0) >= 0
      ) not valid;
  end if;
end;
$$;
create index if not exists idx_parts_order_invoice_lookup
  on public.service_parts_order_data (invoice_number, part_number, branch, portal);
create index if not exists idx_parts_consumption_period
  on public.service_parts_consumption_data (branch, portal, fiscal_year, month_name, part_number);
commit;
