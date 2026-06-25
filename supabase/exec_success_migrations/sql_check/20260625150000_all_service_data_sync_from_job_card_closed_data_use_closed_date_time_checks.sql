-- Read-only validation checks for:
--   supabase/migrations/20260625150000_all_service_data_sync_from_job_card_closed_data_use_closed_date_time.sql
-- Behavior note:
--   Matched-row updates apply only when source closed_date_time is newer than target last_service_date
--   (or target last_service_date is NULL).
--   Dealer backfill exception remains active when target dealer is NULL.

-- 1) Function existence sanity.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'refresh_all_service_data_from_job_card_closed_data';

-- 2) Function-definition assertions for mapping switch.
with fn as (
  select pg_get_functiondef(p.oid) as fn_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'refresh_all_service_data_from_job_card_closed_data'
)
select
  (fn_def ilike '%j.closed_date_time%') as uses_closed_date_time_source,
  (fn_def ilike '%tm.closed_date_time is not null%') as freshness_gate_uses_closed_date_time,
  (fn_def ilike '%tm.last_service_date%') as still_uses_tm_last_service_date,
  (fn_def ilike '%j.last_service_date%') as still_reads_j_last_service_date
from fn;

-- 3) Source winner quick profile (latest 2000 rows window).
with recent_source as (
  select
    j.id,
    upper(nullif(btrim(j.chassis_number), '')) as chassis_norm,
    upper(nullif(btrim(j.vehicle_registration_number), '')) as vrn_norm,
    j.closed_date_time,
    coalesce(j.closed_date_time, j.created_date_time, j.updated_at, j.created_at) as winner_ts
  from public.job_card_closed_data j
  where j.sr_type ilike '%Service%'
  order by j.id desc
  limit 2000
),
winners_by_chassis as (
  select x.*
  from (
    select
      rs.*,
      row_number() over (
        partition by rs.chassis_norm
        order by rs.winner_ts desc nulls last, rs.id desc
      ) as rn
    from recent_source rs
    where rs.chassis_norm is not null
  ) x
  where x.rn = 1
),
winners_by_vrn as (
  select x.*
  from (
    select
      rs.*,
      row_number() over (
        partition by rs.vrn_norm
        order by rs.winner_ts desc nulls last, rs.id desc
      ) as rn
    from recent_source rs
    where rs.chassis_norm is null
      and rs.vrn_norm is not null
  ) x
  where x.rn = 1
),
winners as (
  select * from winners_by_chassis
  union all
  select * from winners_by_vrn
)
select
  count(*) as sampled_winners,
  count(*) filter (where closed_date_time is not null) as sampled_winners_with_closed_date_time,
  count(*) filter (where closed_date_time is null) as sampled_winners_with_null_closed_date_time
from winners;

-- 4) Recently touched target rows.
select
  t.id,
  t.chassis_no,
  t.vehicle_registration_number,
  t.last_service_dealer,
  t.last_service_type,
  t.last_service_date,
  t.updated_by_closed_job,
  t.updated_by_closed_job_at,
  t.last_updated_at
from public.all_service_data t
where t.updated_by_closed_job is true
order by t.updated_by_closed_job_at desc nulls last, t.id desc
limit 25;
