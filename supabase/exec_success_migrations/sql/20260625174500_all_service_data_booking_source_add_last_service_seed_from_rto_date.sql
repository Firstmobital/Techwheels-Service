-- Migration: Booking source sync seeds service fields on insert
-- Change:
--   - last_service_type = 'New'
--   - last_service_date = p_vehicle_sale_date (derived from source booking.rto_date)
-- Scope:
--   - Insert-only helper for booking -> all_service_data
--   - Existing chassis rows remain skipped (no update path)

begin;

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
    last_service_type,
    last_service_date,
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
    'New',
    (p_vehicle_sale_date::timestamp at time zone 'Asia/Kolkata'),
    now(),
    now()
  )
  returning id into v_target_id;

  return query select 'inserted'::text, v_target_id;
end;
$$;

comment on function public.upsert_all_service_data_from_booking_source(text, date, text, text, text, text, date, text, text, timestamptz, text) is
  'Wave-1 cross-project insert-only helper for booking->all_service_data. Match by normalized chassis. Existing chassis rows are skipped. Hard gate requires non-null core mapped fields; derived JSON mappings are optional. Inserts sold_dealer=Techwheels, updated_by_sale audit stamps, last_service_type=New, last_service_date from rto_date.';

grant execute on function public.upsert_all_service_data_from_booking_source(text, date, text, text, text, text, date, text, text, timestamptz, text)
  to service_role, postgres;

commit;
