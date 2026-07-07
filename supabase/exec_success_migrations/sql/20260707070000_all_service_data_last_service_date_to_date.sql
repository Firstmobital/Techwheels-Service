-- Migration: Change all_service_data.last_service_date (and mirror
-- all_service_data_dynamic.last_service_date) from timestamp with time zone to date.
--
-- last_service_date was only ever meaningful as a calendar day; the timestamptz
-- component was a legacy artifact of an earlier text->timestamptz correction.
-- This migration truncates existing values to their IST calendar date and updates
-- every function that reads or writes the column.
--
-- Tradeoff accepted: the closed-job sync freshness gate in
-- refresh_all_service_data_from_job_card_closed_data compared last_service_date
-- against job_card_closed_data.closed_date_time at timestamp granularity so it
-- could tell which of several same-day closures was "newest". With last_service_date
-- as a plain date, two closures on the same calendar day are now indistinguishable
-- for that gate (the update is skipped once a same-day value is already stored).

begin;

-- 0. Drop the trigger that depends on last_service_date's type so the column can be altered.
--    Postgres refuses ALTER COLUMN TYPE while a column-list trigger references the column.
drop trigger trg_set_all_service_assumed_columns on public.all_service_data;

-- 1. all_service_data.last_service_date: timestamptz -> date (IST calendar day)
alter table public.all_service_data
  alter column last_service_date type date
  using (last_service_date at time zone 'Asia/Kolkata')::date;

comment on column public.all_service_data.last_service_date is
  'Type corrected to date (IST calendar day of last service). Previously timestamptz; converted using the IST wall-clock date so the calendar day is preserved.';

-- 2. all_service_data_dynamic.last_service_date: kept aligned with source table
alter table public.all_service_data_dynamic
  alter column last_service_date type date
  using (last_service_date at time zone 'Asia/Kolkata')::date;

comment on column public.all_service_data_dynamic.last_service_date is
  'Type aligned in-place to date to match source all_service_data.last_service_date.';

-- 3. New date-typed overload so the existing trigger call
--    (NEW.last_service_date, NEW.last_service_type, current_date) resolves to an
--    exact-match overload now that the column is a plain date.
create or replace function public.calc_all_service_assumed_next_service_date(
  p_last_service_date date,
  p_last_service_type text,
  p_as_of_date date default current_date
) returns date
language sql stable
as $function$
  WITH normalized AS (
    SELECT lower(btrim(COALESCE(p_last_service_type, ''))) AS lst
  ), inferred_type AS (
    SELECT public.calc_all_service_assumed_next_service_type(p_last_service_type) AS assumed_type
  )
  SELECT
    CASE
      WHEN it.assumed_type = 'Unknown' THEN NULL
      WHEN p_last_service_date IS NULL THEN NULL
      ELSE p_as_of_date + (
        (
          CASE
            WHEN n.lst = '' OR n.lst = 'new' THEN 60
            WHEN n.lst IN ('first free service', 'tma-first free service') THEN 120
            ELSE 180
          END
        )
        - MOD(GREATEST(0, (p_as_of_date - p_last_service_date)::int), 180)
      )
    END
  FROM normalized n
  CROSS JOIN inferred_type it;
$function$;

comment on function public.calc_all_service_assumed_next_service_date(date, text, date) is
  'Date-typed overload matching all_service_data.last_service_date (converted from timestamptz on 2026-07-07). Same Phase 4 projection rule as the text/timestamptz overloads; no timezone parsing needed since the input is already a plain date.';

-- 3b. Recreate the trigger now that the date-typed overload exists.
create trigger trg_set_all_service_assumed_columns
  before insert or update of last_service_type, last_service_date
  on public.all_service_data
  for each row execute function set_all_service_assumed_columns();

-- 4. refresh_all_service_data_from_job_card_closed_data: write/compare last_service_date as date
create or replace function public.refresh_all_service_data_from_job_card_closed_data(p_chassis_key text DEFAULT NULL::text, p_vehicle_registration_key text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        else (tm.closed_date_time at time zone 'Asia/Kolkata')::date
      end,
      updated_by_closed_job = true,
      updated_by_closed_job_at = now(),
      last_updated_at = now()
    from target_match tm
    where tm.matched_target_id is not null
      and tm.closed_date_time is not null
      and (
        t.last_service_date is null
        or (tm.closed_date_time at time zone 'Asia/Kolkata')::date > t.last_service_date
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
      else (tm.closed_date_time at time zone 'Asia/Kolkata')::date
    end,
    true,
    now(),
    now(),
    now()
  from target_match tm
  where tm.matched_target_id is null;
end;
$function$;

-- 5. refresh_all_service_data_from_service_history: source is a naive local timestamp
--    (timestamp without time zone), so truncate directly with no zone shift.
create or replace function public.refresh_all_service_data_from_service_history(p_chassis_key text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key text;
BEGIN
  v_key := nullif(upper(btrim(coalesce(p_chassis_key, ''))), '');

  IF v_key IS NULL THEN
    RETURN;
  END IF;

  WITH source_union AS (
    SELECT
      h.id,
      upper(btrim(h.chassis_no)) AS chassis_key,
      h.registration_no,
      h.odometer_reading,
      h.serviced_at_dealer,
      h.sr_type,
      h.service_date_time,
      COALESCE(
        NULLIF(btrim(to_jsonb(h) ->> 'contact_full_name'), ''),
        NULLIF(btrim(to_jsonb(h) ->> 'conatct_full_name'), '')
      ) AS contact_full_name,
      h.created_at,
      1::int AS source_rank
    FROM public."EV_service_history_test" h
    WHERE nullif(btrim(h.chassis_no), '') IS NOT NULL
      AND upper(btrim(h.chassis_no)) = v_key

    UNION ALL

    SELECT
      h.id,
      upper(btrim(h.chassis_no)) AS chassis_key,
      h.registration_no,
      h.odometer_reading,
      h.serviced_at_dealer,
      h.sr_type,
      h.service_date_time,
      COALESCE(
        NULLIF(btrim(to_jsonb(h) ->> 'contact_full_name'), ''),
        NULLIF(btrim(to_jsonb(h) ->> 'conatct_full_name'), '')
      ) AS contact_full_name,
      h.created_at,
      2::int AS source_rank
    FROM public."PV_service_history_test" h
    WHERE nullif(btrim(h.chassis_no), '') IS NOT NULL
      AND upper(btrim(h.chassis_no)) = v_key
  ),
  ranked AS (
    SELECT
      su.*,
      CASE
        WHEN lower(coalesce(su.sr_type, '')) LIKE '%service%' THEN 0
        ELSE 1
      END AS service_priority,
      su.service_date_time AS parsed_service_at
    FROM source_union su
  ),
  chosen AS (
    SELECT
      r.chassis_key,
      r.registration_no,
      r.odometer_reading,
      r.serviced_at_dealer,
      r.sr_type,
      r.parsed_service_at,
      r.contact_full_name,
      r.created_at
    FROM ranked r
    ORDER BY
      r.service_priority ASC,
      r.parsed_service_at DESC NULLS LAST,
      r.created_at DESC NULLS LAST,
      r.source_rank ASC,
      r.id DESC
    LIMIT 1
  )
  UPDATE public.all_service_data AS t
  SET
    vehicle_registration_number = COALESCE(c.registration_no, t.vehicle_registration_number),
    updated_by_robot = true,
    updated_by_robot_at = c.created_at,
    last_updated_at = now(),
    last_service_km = COALESCE(c.odometer_reading, t.last_service_km),
    last_service_dealer = COALESCE(c.serviced_at_dealer, t.last_service_dealer),
    last_service_date = COALESCE(c.parsed_service_at::date, t.last_service_date),
    first_name = COALESCE(c.contact_full_name, t.first_name),
    last_service_type = COALESCE(c.sr_type, t.last_service_type)
  FROM chosen c
  WHERE upper(btrim(t.chassis_no)) = c.chassis_key
    AND (
      t.vehicle_registration_number IS DISTINCT FROM COALESCE(c.registration_no, t.vehicle_registration_number)
      OR t.updated_by_robot IS DISTINCT FROM true
      OR t.updated_by_robot_at IS DISTINCT FROM c.created_at
      OR t.last_service_km IS DISTINCT FROM COALESCE(c.odometer_reading, t.last_service_km)
      OR t.last_service_dealer IS DISTINCT FROM COALESCE(c.serviced_at_dealer, t.last_service_dealer)
      OR t.last_service_date IS DISTINCT FROM COALESCE(c.parsed_service_at::date, t.last_service_date)
      OR t.first_name IS DISTINCT FROM COALESCE(c.contact_full_name, t.first_name)
      OR t.last_service_type IS DISTINCT FROM COALESCE(c.sr_type, t.last_service_type)
    );
END;
$function$;

-- 6. upsert_all_service_data_from_booking_source: p_vehicle_sale_date is already a date,
--    assign it directly instead of the previous timestamptz round-trip.
create or replace function public.upsert_all_service_data_from_booking_source(p_chassis_no text, p_vehicle_sale_date date DEFAULT NULL::date, p_engine_no text DEFAULT NULL::text, p_contact_phones text DEFAULT NULL::text, p_first_name text DEFAULT NULL::text, p_last_insurance_comapny text DEFAULT NULL::text, p_last_insurance_expiry_date date DEFAULT NULL::date, p_model text DEFAULT NULL::text, p_product_line text DEFAULT NULL::text, p_source_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_source_row_id text DEFAULT NULL::text)
 RETURNS TABLE(action text, target_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    p_vehicle_sale_date,
    now(),
    now()
  )
  returning id into v_target_id;

  return query select 'inserted'::text, v_target_id;
end;
$function$;

commit;
