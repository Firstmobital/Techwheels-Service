-- Migration: Sync all_service_data from job_card_closed_data using Service-only latest-winner logic
-- Authority baseline: local_folder/backups/full_database.sql (and chunk mirror)
-- Overlay note: supabase/evidence/post_dump_verified_promotions.md has no additional promoted entries in current window.

begin;

-- 1) Add closed-job audit columns on target table.
alter table public.all_service_data
  add column if not exists updated_by_closed_job boolean;

alter table public.all_service_data
  add column if not exists updated_by_closed_job_at timestamp with time zone;

comment on column public.all_service_data.updated_by_closed_job is
  'True when row was updated or inserted by job_card_closed_data service-winner sync flow.';

comment on column public.all_service_data.updated_by_closed_job_at is
  'Timestamp of last update/insert by job_card_closed_data service-winner sync flow.';

-- 2) Add lookup indexes for normalized matching keys.
create index if not exists idx_all_service_data_chassis_no_norm
  on public.all_service_data ((upper(btrim(chassis_no))));

create index if not exists idx_all_service_data_vrn_norm
  on public.all_service_data ((upper(btrim(vehicle_registration_number))));

create index if not exists idx_job_card_closed_data_chassis_number_norm
  on public.job_card_closed_data ((upper(btrim(chassis_number))));

create index if not exists idx_job_card_closed_data_vrn_norm
  on public.job_card_closed_data ((upper(btrim(vehicle_registration_number))));

create index if not exists idx_job_card_closed_data_service_winner_sort
  on public.job_card_closed_data ((coalesce(closed_date_time, created_date_time, updated_at, created_at)) desc, id desc);

-- 3) Core refresh function:
--    - Process only sr_type rows containing "Service".
--    - Winner selection: latest row per normalized chassis_number,
--      else (if chassis is blank/null) latest row per normalized vehicle_registration_number.
--    - Match target by chassis first, then fallback to vehicle_registration_number.
--    - Update matched row only when source last_service_date is newer than target last_service_date
--      (or target last_service_date is NULL); else skip update.
--    - For this flow, always stamp last_service_dealer = 'FIRST MOBITAL PVT. LTD.' on write.
--    - Dealer backfill exception: if target last_service_dealer is NULL, allow update to stamp dealer
--      even when source last_service_date is not newer.
--    - Insert when no matched target row exists.
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
      j.last_service_date,
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
        when tm.last_service_date is null then null
        else (tm.last_service_date::timestamp at time zone 'Asia/Kolkata')
      end,
      updated_by_closed_job = true,
      updated_by_closed_job_at = now(),
      last_updated_at = now()
    from target_match tm
    where tm.matched_target_id is not null
      and tm.last_service_date is not null
      and (
        t.last_service_date is null
        or (tm.last_service_date::timestamp at time zone 'Asia/Kolkata') > t.last_service_date
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
      when tm.last_service_date is null then null
      else (tm.last_service_date::timestamp at time zone 'Asia/Kolkata')
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
  'Service-only latest-winner sync from job_card_closed_data to all_service_data. Match by chassis first, fallback by vehicle_registration_number.';

-- 4) Chunked reconcile helper for timeout-safe batch processing.
create or replace function public.reconcile_all_service_data_from_job_card_closed_data_chunked(
  p_chunk_size integer default 1000,
  p_max_source_id bigint default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_chunk_size integer := greatest(1, coalesce(p_chunk_size, 1000));
  v_max_source_id bigint;
  v_processed integer := 0;
begin
  select coalesce(p_max_source_id, max(j.id))
  into v_max_source_id
  from public.job_card_closed_data j
  where j.sr_type ilike '%Service%';

  if v_max_source_id is null then
    return 0;
  end if;

  for r in
    select
      j.chassis_number,
      j.vehicle_registration_number
    from public.job_card_closed_data j
    where j.sr_type ilike '%Service%'
      and j.id <= v_max_source_id
    order by j.id desc
    limit v_chunk_size
  loop
    perform public.refresh_all_service_data_from_job_card_closed_data(
      r.chassis_number,
      r.vehicle_registration_number
    );
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

comment on function public.reconcile_all_service_data_from_job_card_closed_data_chunked(integer, bigint) is
  'Timeout-safe chunked reconcile for job_card_closed_data winner sync. Processes most-recent eligible source keys first.';

grant execute on function public.refresh_all_service_data_from_job_card_closed_data(text, text)
  to postgres, service_role;

grant execute on function public.reconcile_all_service_data_from_job_card_closed_data_chunked(integer, bigint)
  to postgres, service_role;

-- 5) Trigger function to keep target in sync after source mutations.
create or replace function public.trg_refresh_all_service_data_from_job_card_closed_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_all_service_data_from_job_card_closed_data(OLD.chassis_number, OLD.vehicle_registration_number);
    return OLD;
  end if;

  if tg_op = 'UPDATE' then
    perform public.refresh_all_service_data_from_job_card_closed_data(OLD.chassis_number, OLD.vehicle_registration_number);
    perform public.refresh_all_service_data_from_job_card_closed_data(NEW.chassis_number, NEW.vehicle_registration_number);
    return NEW;
  end if;

  perform public.refresh_all_service_data_from_job_card_closed_data(NEW.chassis_number, NEW.vehicle_registration_number);
  return NEW;
end;
$$;

comment on function public.trg_refresh_all_service_data_from_job_card_closed_data() is
  'Row trigger wrapper for refresh_all_service_data_from_job_card_closed_data.';

-- 6) Attach trigger on source table.
drop trigger if exists trg_refresh_all_service_data_from_job_card_closed_data
  on public.job_card_closed_data;

create trigger trg_refresh_all_service_data_from_job_card_closed_data
after insert or update or delete
on public.job_card_closed_data
for each row
execute function public.trg_refresh_all_service_data_from_job_card_closed_data();

commit;
