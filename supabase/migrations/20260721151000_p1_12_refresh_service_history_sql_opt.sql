-- P1-12 / SUPABASE-003: use typed contact_full_name column instead of to_jsonb(h).

create or replace function public.refresh_all_service_data_from_service_history(p_chassis_key text)
 returns void
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_key text;
begin
  v_key := nullif(upper(btrim(coalesce(p_chassis_key, ''))), '');

  if v_key is null then
    return;
  end if;

  with source_union as (
    select
      h.id,
      upper(btrim(h.chassis_no)) as chassis_key,
      h.registration_no,
      h.odometer_reading,
      h.serviced_at_dealer,
      h.sr_type,
      h.service_date_time,
      nullif(btrim(h.contact_full_name), '') as contact_full_name,
      h.created_at,
      1::int as source_rank
    from public.ev_service_history_test h
    where nullif(btrim(h.chassis_no), '') is not null
      and upper(btrim(h.chassis_no)) = v_key

    union all

    select
      h.id,
      upper(btrim(h.chassis_no)) as chassis_key,
      h.registration_no,
      h.odometer_reading,
      h.serviced_at_dealer,
      h.sr_type,
      h.service_date_time,
      nullif(btrim(h.contact_full_name), '') as contact_full_name,
      h.created_at,
      2::int as source_rank
    from public.pv_service_history_test h
    where nullif(btrim(h.chassis_no), '') is not null
      and upper(btrim(h.chassis_no)) = v_key
  ),
  ranked as (
    select
      su.*,
      case
        when lower(coalesce(su.sr_type, '')) like '%service%' then 0
        else 1
      end as service_priority,
      su.service_date_time as parsed_service_at
    from source_union su
  ),
  chosen as (
    select
      r.chassis_key,
      r.registration_no,
      r.odometer_reading,
      r.serviced_at_dealer,
      r.sr_type,
      r.parsed_service_at,
      r.contact_full_name,
      r.created_at
    from ranked r
    order by
      r.service_priority asc,
      r.parsed_service_at desc nulls last,
      r.created_at desc nulls last,
      r.source_rank asc,
      r.id desc
    limit 1
  )
  update public.all_service_data as t
  set
    vehicle_registration_number = coalesce(c.registration_no, t.vehicle_registration_number),
    updated_by_robot = true,
    updated_by_robot_at = c.created_at,
    last_updated_at = now(),
    last_service_km = coalesce(c.odometer_reading, t.last_service_km),
    last_service_dealer = coalesce(c.serviced_at_dealer, t.last_service_dealer),
    last_service_date = coalesce(c.parsed_service_at::date, t.last_service_date),
    first_name = coalesce(c.contact_full_name, t.first_name),
    last_service_type = coalesce(c.sr_type, t.last_service_type)
  from chosen c
  where upper(btrim(t.chassis_no)) = c.chassis_key
    and (
      t.vehicle_registration_number is distinct from coalesce(c.registration_no, t.vehicle_registration_number)
      or t.updated_by_robot is distinct from true
      or t.updated_by_robot_at is distinct from c.created_at
      or t.last_service_km is distinct from coalesce(c.odometer_reading, t.last_service_km)
      or t.last_service_dealer is distinct from coalesce(c.serviced_at_dealer, t.last_service_dealer)
      or t.last_service_date is distinct from coalesce(c.parsed_service_at::date, t.last_service_date)
      or t.first_name is distinct from coalesce(c.contact_full_name, t.first_name)
      or t.last_service_type is distinct from coalesce(c.sr_type, t.last_service_type)
    );
end;
$function$;

comment on function public.refresh_all_service_data_from_service_history(text) is
  'Refreshes all_service_data from EV/PV service-history test sources (contact_full_name column).';
