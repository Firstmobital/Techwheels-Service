-- Migration: Switch closed-job sync mapping to use source closed_date_time -> target last_service_date.
-- Supersedes date mapping behavior from 20260625113000 for refresh function logic only.

begin;

create or replace function public.refresh_all_service_data_from_job_card_closed_data(
  p_chassis_key text default null,
  p_vehicle_registration_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with source_base as (
    select
      j.id as source_id,
      nullif(btrim(j.chassis_number), '') as chassis_number_raw,
      nullif(btrim(j.vehicle_registration_number), '') as vehicle_registration_number_raw,
      upper(nullif(btrim(j.chassis_number), '')) as chassis_norm,
      upper(nullif(btrim(j.vehicle_registration_number), '')) as vrn_norm,
      j.first_name,
      j.last_name,
      nullif(btrim(j.account_phone_number), '') as account_phone_number,
      j.parent_product_line,
      j.product_line,
      j.vehicle_sale_date,
      j.sr_type,
      j.last_service_km,
      j.closed_date_time,
      coalesce(j.closed_date_time, j.created_date_time, j.updated_at, j.created_at) as winner_ts
    from public.job_card_closed_data j
    where j.sr_type ilike '%Service%'
      and (
        (p_chassis_key is null and p_vehicle_registration_key is null)
        or (
          p_chassis_key is not null
          and upper(nullif(btrim(j.chassis_number), '')) = upper(nullif(btrim(p_chassis_key), ''))
        )
        or (
          p_vehicle_registration_key is not null
          and upper(nullif(btrim(j.vehicle_registration_number), '')) = upper(nullif(btrim(p_vehicle_registration_key), ''))
        )
      )
  ),
  winners_by_chassis as (
    select x.*
    from (
      select
        sb.*,
        row_number() over (
          partition by sb.chassis_norm
          order by sb.winner_ts desc nulls last, sb.source_id desc
        ) as rn
      from source_base sb
      where sb.chassis_norm is not null
    ) x
    where x.rn = 1
  ),
  winners_by_vrn as (
    select x.*
    from (
      select
        sb.*,
        row_number() over (
          partition by sb.vrn_norm
          order by sb.winner_ts desc nulls last, sb.source_id desc
        ) as rn
      from source_base sb
      where sb.chassis_norm is null
        and sb.vrn_norm is not null
    ) x
    where x.rn = 1
  ),
  winners as (
    select * from winners_by_chassis
    union all
    select * from winners_by_vrn
  ),
  target_match as (
    select
      w.*,
      coalesce(t_chassis.id, t_vrn.id) as matched_target_id
    from winners w
    left join lateral (
      select t.id
      from public.all_service_data t
      where w.chassis_norm is not null
        and upper(nullif(btrim(t.chassis_no), '')) = w.chassis_norm
      order by t.last_updated_at desc nulls last, t.created_at desc nulls last, t.id desc
      limit 1
    ) t_chassis on true
    left join lateral (
      select t.id
      from public.all_service_data t
      where t_chassis.id is null
        and w.vrn_norm is not null
        and upper(nullif(btrim(t.vehicle_registration_number), '')) = w.vrn_norm
      order by t.last_updated_at desc nulls last, t.created_at desc nulls last, t.id desc
      limit 1
    ) t_vrn on true
  ),
  updated_rows as (
    update public.all_service_data t
    set
      chassis_no = tm.chassis_number_raw,
      vehicle_registration_number = tm.vehicle_registration_number_raw,
      first_name = tm.first_name,
      last_name = tm.last_name,
      contact_phones = tm.account_phone_number,
      model = tm.parent_product_line,
      product_line = tm.product_line,
      vehicle_sale_date = tm.vehicle_sale_date,
      last_service_dealer = 'FIRST MOBITAL PVT. LTD.',
      last_service_type = tm.sr_type,
      last_service_km = case when tm.last_service_km is null then null else tm.last_service_km::text end,
      last_service_date = case
        when tm.closed_date_time is null then null
        else (tm.closed_date_time::timestamp at time zone 'Asia/Kolkata')
      end,
      updated_by_closed_job = true,
      updated_by_closed_job_at = now(),
      last_updated_at = now()
    from target_match tm
    where tm.matched_target_id is not null
      and tm.closed_date_time is not null
      and (
        t.last_service_date is null
        or (tm.closed_date_time::timestamp at time zone 'Asia/Kolkata') > t.last_service_date
        or t.last_service_dealer is null
      )
      and t.id = tm.matched_target_id
    returning t.id
  )
  insert into public.all_service_data (
    chassis_no,
    vehicle_registration_number,
    first_name,
    last_name,
    contact_phones,
    model,
    product_line,
    vehicle_sale_date,
    last_service_dealer,
    last_service_type,
    last_service_km,
    last_service_date,
    updated_by_closed_job,
    updated_by_closed_job_at,
    created_at,
    last_updated_at
  )
  select
    tm.chassis_number_raw,
    tm.vehicle_registration_number_raw,
    tm.first_name,
    tm.last_name,
    tm.account_phone_number,
    tm.parent_product_line,
    tm.product_line,
    tm.vehicle_sale_date,
    'FIRST MOBITAL PVT. LTD.',
    tm.sr_type,
    case when tm.last_service_km is null then null else tm.last_service_km::text end,
    case
      when tm.closed_date_time is null then null
      else (tm.closed_date_time::timestamp at time zone 'Asia/Kolkata')
    end,
    true,
    now(),
    now(),
    now()
  from target_match tm
  where tm.matched_target_id is null;
end;
$$;

comment on function public.refresh_all_service_data_from_job_card_closed_data(text, text) is
  'Service-only latest-winner sync from job_card_closed_data to all_service_data using closed_date_time -> last_service_date. Match by chassis first, fallback by vehicle_registration_number.';

grant execute on function public.refresh_all_service_data_from_job_card_closed_data(text, text)
  to postgres, service_role;

commit;
