-- Migration: Booking source -> all_service_data target sync contract (wave 1)
-- Source key: booking.chassis_no
-- Wave-1 mapping:
--   chassis_no -> chassis_no
--   rto_date -> vehicle_sale_date
--   engine_no -> engine_no
--   customer_phone -> contact_phones
--   customer_name -> first_name
--   insurance_company_name -> last_insurance_comapny
--   insurance_date + 1 year -> last_insurance_expiry_date
--   updated_at -> last_updated_at (source timestamp accepted for trace, target stamp uses now())
--   quote_snapshot.car.name -> model
--   quote_snapshot.variant.name -> product_line
--   constant 'Techwheels' -> sold_dealer (insert-only for newly created target rows)
--   powertrain_type mapping deferred (derive later from variant/product_line rules)
-- Guard model:
--   - Hard gate: core mapped fields must be non-null to allow insert.
--   - Soft gate: derived JSON mappings may be null; row can still insert.

begin;

create table if not exists public.integration_sync_state (
  sync_name text primary key,
  last_source_cursor_id text,
  last_source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.integration_sync_state is
  'Watermark state for external/source-to-target sync jobs (edge workers, batch jobs).';

comment on column public.integration_sync_state.sync_name is
  'Stable unique sync identifier, e.g. booking_to_all_service_data.';

comment on column public.integration_sync_state.last_source_cursor_id is
  'Tie-break cursor (source booking.id UUID) for rows sharing same updated_at watermark.';

alter table public.all_service_data
  add column if not exists updated_by_sale boolean;

alter table public.all_service_data
  add column if not exists updated_by_sale_at timestamptz;

comment on column public.all_service_data.updated_by_sale is
  'TRUE when row is inserted by booking source sale-sync flow.';

comment on column public.all_service_data.updated_by_sale_at is
  'Timestamp when booking source sale-sync inserted the row.';

create or replace function public.upsert_all_service_data_from_booking_source(
  p_chassis_no text,
  p_vehicle_sale_date date default null,
  p_engine_no text default null,
  p_contact_phones text default null,
  p_first_name text default null,
  p_last_insurance_comapny text default null,
  p_last_insurance_expiry_date date default null,
  p_model text default null,
  p_product_line text default null,
  p_source_updated_at timestamptz default null,
  p_source_row_id text default null
)
returns table(action text, target_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chassis_norm text;
  v_chassis_raw text;
  v_engine_no text;
  v_contact_phones text;
  v_first_name text;
  v_last_insurance_comapny text;
  v_model text;
  v_product_line text;
  v_target_id bigint;
begin
  v_chassis_raw := nullif(btrim(p_chassis_no), '');
  v_chassis_norm := upper(v_chassis_raw);
  v_engine_no := nullif(btrim(p_engine_no), '');
  v_contact_phones := nullif(btrim(p_contact_phones), '');
  v_first_name := nullif(btrim(p_first_name), '');
  v_last_insurance_comapny := nullif(btrim(p_last_insurance_comapny), '');
  v_model := nullif(btrim(p_model), '');
  v_product_line := nullif(btrim(p_product_line), '');

  if v_chassis_norm is null then
    return query select 'skipped_no_chassis'::text, null::bigint;
    return;
  end if;

  -- Hard gate (core fields): insert only when all core mapped values are present.
  if p_vehicle_sale_date is null
    or v_engine_no is null
    or v_contact_phones is null
    or v_first_name is null
    or v_last_insurance_comapny is null
    or p_last_insurance_expiry_date is null
    or p_source_updated_at is null
  then
    return query select 'skipped_missing_core_fields'::text, null::bigint;
    return;
  end if;

  select t.id
  into v_target_id
  from public.all_service_data t
  where upper(nullif(btrim(t.chassis_no), '')) = v_chassis_norm
  order by t.last_updated_at desc nulls last, t.id desc
  limit 1;

  if v_target_id is not null then
    return query select 'skipped_existing_chassis'::text, v_target_id;
    return;
  end if;

  insert into public.all_service_data (
    chassis_no,
    vehicle_sale_date,
    engine_no,
    contact_phones,
    first_name,
    last_insurance_comapny,
    last_insurance_expiry_date,
    model,
    product_line,
    sold_dealer,
    updated_by_sale,
    updated_by_sale_at,
    created_at,
    last_updated_at
  )
  values (
    v_chassis_raw,
    p_vehicle_sale_date,
    v_engine_no,
    v_contact_phones,
    v_first_name,
    v_last_insurance_comapny,
    p_last_insurance_expiry_date,
    v_model,
    v_product_line,
    'Techwheels',
    true,
    now(),
    now(),
    now()
  )
  returning id into v_target_id;

  return query select 'inserted'::text, v_target_id;
end;
$$;

comment on function public.upsert_all_service_data_from_booking_source(text, date, text, text, text, text, date, text, text, timestamptz, text) is
  'Wave-1 cross-project insert-only helper for booking->all_service_data. Match by normalized chassis. Existing chassis rows are skipped. Hard gate requires non-null core mapped fields; derived JSON mappings are optional.';

grant execute on function public.upsert_all_service_data_from_booking_source(text, date, text, text, text, text, date, text, text, timestamptz, text)
  to service_role, postgres;

grant select, insert, update on table public.integration_sync_state
  to service_role, postgres;

commit;
