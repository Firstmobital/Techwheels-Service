begin;

-- Add OTC and WS consumption columns to track consumption by type.
alter table if exists public.service_parts_consumption_data
add column if not exists otc_quantity numeric not null default 0,
add column if not exists ws_quantity numeric not null default 0;

-- Backfill quantity_consumed = otc_quantity + ws_quantity for any existing rows
-- (currently none, but this ensures consistency if data exists)
update public.service_parts_consumption_data
set quantity_consumed = otc_quantity + ws_quantity
where quantity_consumed <> (otc_quantity + ws_quantity);

commit;
