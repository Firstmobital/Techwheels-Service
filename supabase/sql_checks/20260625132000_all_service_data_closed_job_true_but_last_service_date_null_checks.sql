-- Read-only diagnostic check:
-- Find all rows in public.all_service_data where closed-job audit says updated,
-- but target last_service_date is still NULL.
-- Context: closed-job winner sync/backfill flow from:
--   supabase/migrations/20260625113000_all_service_data_sync_from_job_card_closed_data_service_winner.sql

-- 1) Quick summary count.
select
  count(*) as rows_with_closed_job_true_and_null_last_service_date
from public.all_service_data t
where t.updated_by_closed_job is true
  and t.last_service_date is null;

-- 2) Detailed rows from target table.
select
  t.id,
  t.chassis_no,
  t.vehicle_registration_number,
  t.last_service_type,
  t.last_service_date,
  t.last_service_km,
  t.last_service_dealer,
  t.updated_by_closed_job,
  t.updated_by_closed_job_at,
  t.last_updated_at
from public.all_service_data t
where t.updated_by_closed_job is true
  and t.last_service_date is null
order by t.updated_by_closed_job_at desc nulls last, t.id desc;

-- 3) Source-context diagnostics for the same target rows.
--    Helps explain whether source Service rows exist and if their date is NULL/non-NULL.
with target_rows as (
  select
    t.id,
    upper(nullif(btrim(t.chassis_no), '')) as chassis_norm,
    upper(nullif(btrim(t.vehicle_registration_number), '')) as vrn_norm,
    t.chassis_no,
    t.vehicle_registration_number,
    t.updated_by_closed_job_at,
    t.last_updated_at
  from public.all_service_data t
  where t.updated_by_closed_job is true
    and t.last_service_date is null
),
source_match as (
  select
    tr.id as target_id,
    count(*) filter (where j.sr_type ilike '%Service%') as service_source_rows,
    count(*) filter (where j.sr_type ilike '%Service%' and j.last_service_date is not null) as service_source_rows_with_date,
    count(*) filter (where j.sr_type ilike '%Service%' and j.last_service_date is null) as service_source_rows_with_null_date,
    max(j.last_service_date) filter (where j.sr_type ilike '%Service%') as max_service_source_date,
    max(coalesce(j.closed_date_time, j.created_date_time, j.updated_at, j.created_at)) filter (where j.sr_type ilike '%Service%') as latest_service_source_event_at
  from target_rows tr
  left join public.job_card_closed_data j
    on (
      tr.chassis_norm is not null
      and upper(nullif(btrim(j.chassis_number), '')) = tr.chassis_norm
    )
    or (
      tr.chassis_norm is null
      and tr.vrn_norm is not null
      and upper(nullif(btrim(j.vehicle_registration_number), '')) = tr.vrn_norm
    )
  group by tr.id
)
select
  tr.id,
  tr.chassis_no,
  tr.vehicle_registration_number,
  sm.service_source_rows,
  sm.service_source_rows_with_date,
  sm.service_source_rows_with_null_date,
  sm.max_service_source_date,
  sm.latest_service_source_event_at,
  tr.updated_by_closed_job_at,
  tr.last_updated_at
from target_rows tr
left join source_match sm
  on sm.target_id = tr.id
order by tr.updated_by_closed_job_at desc nulls last, tr.id desc;

-- 4) Source-to-target existence check (winner logic parity with migration).
--    Finds Service winners in job_card_closed_data that currently have no match in all_service_data.
with source_base as (
  select
    j.id as source_id,
    nullif(btrim(j.chassis_number), '') as chassis_number_raw,
    nullif(btrim(j.vehicle_registration_number), '') as vehicle_registration_number_raw,
    upper(nullif(btrim(j.chassis_number), '')) as chassis_norm,
    upper(nullif(btrim(j.vehicle_registration_number), '')) as vrn_norm,
    j.sr_type,
    j.last_service_date,
    coalesce(j.closed_date_time, j.created_date_time, j.updated_at, j.created_at) as winner_ts
  from public.job_card_closed_data j
  where j.sr_type ilike '%Service%'
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
    w.source_id,
    w.chassis_number_raw,
    w.vehicle_registration_number_raw,
    w.chassis_norm,
    w.vrn_norm,
    w.sr_type,
    w.last_service_date,
    w.winner_ts,
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
)
select
  count(*) as source_winners_missing_in_target,
  count(*) filter (where last_service_date is not null) as source_winners_missing_in_target_with_non_null_date,
  count(*) filter (where last_service_date is null) as source_winners_missing_in_target_with_null_date
from target_match
where matched_target_id is null;

-- 5) Detailed missing source winners (if any).
with source_base as (
  select
    j.id as source_id,
    nullif(btrim(j.chassis_number), '') as chassis_number_raw,
    nullif(btrim(j.vehicle_registration_number), '') as vehicle_registration_number_raw,
    upper(nullif(btrim(j.chassis_number), '')) as chassis_norm,
    upper(nullif(btrim(j.vehicle_registration_number), '')) as vrn_norm,
    j.sr_type,
    j.last_service_date,
    coalesce(j.closed_date_time, j.created_date_time, j.updated_at, j.created_at) as winner_ts
  from public.job_card_closed_data j
  where j.sr_type ilike '%Service%'
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
    w.source_id,
    w.chassis_number_raw,
    w.vehicle_registration_number_raw,
    w.sr_type,
    w.last_service_date,
    w.winner_ts,
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
)
select
  source_id,
  chassis_number_raw as source_chassis_number,
  vehicle_registration_number_raw as source_vehicle_registration_number,
  sr_type,
  last_service_date,
  winner_ts
from target_match
where matched_target_id is null
order by winner_ts desc nulls last, source_id desc
limit 200;
