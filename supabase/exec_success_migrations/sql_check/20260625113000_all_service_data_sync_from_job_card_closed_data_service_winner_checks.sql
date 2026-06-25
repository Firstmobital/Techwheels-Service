-- Read-only validation checks for:
--   supabase/migrations/20260625113000_all_service_data_sync_from_job_card_closed_data_service_winner.sql
-- Behavior note:
--   Matched-row updates apply only when source last_service_date is newer than target last_service_date
--   (or target last_service_date is NULL).
--   This flow stamps last_service_dealer = 'FIRST MOBITAL PVT. LTD.' on write.
--   Dealer backfill exception: matched rows with NULL last_service_dealer are eligible for update
--   so the dealer stamp can be repaired even when source date is not newer.

-- 1) Audit columns exist on target.
select
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'all_service_data'
  and c.column_name in ('updated_by_closed_job', 'updated_by_closed_job_at')
order by c.column_name;

-- 2) Functions and trigger exist.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'refresh_all_service_data_from_job_card_closed_data',
    'reconcile_all_service_data_from_job_card_closed_data_chunked',
    'trg_refresh_all_service_data_from_job_card_closed_data'
  )
order by p.proname;

select
  t.tgname as trigger_name,
  c.relname as table_name,
  pg_get_triggerdef(t.oid) as trigger_def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'job_card_closed_data'
  and t.tgname = 'trg_refresh_all_service_data_from_job_card_closed_data'
  and not t.tgisinternal;

-- 3) Service-only winner smoke preview (ultra-fast mode).
--    Uses only latest 2000 source IDs and classifies latest 200 winners.
with recent_source as (
  select
    j.id,
    upper(nullif(btrim(j.chassis_number), '')) as chassis_norm,
    upper(nullif(btrim(j.vehicle_registration_number), '')) as vrn_norm,
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
),
winner_sample as (
  select *
  from winners
  order by id desc
  limit 200
),
classified as (
  select
    w.id,
    exists (
      select 1
      from public.all_service_data t
      where w.chassis_norm is not null
        and upper(nullif(btrim(t.chassis_no), '')) = w.chassis_norm
    ) as has_chassis_match,
    exists (
      select 1
      from public.all_service_data t
      where w.vrn_norm is not null
        and upper(nullif(btrim(t.vehicle_registration_number), '')) = w.vrn_norm
    ) as has_vrn_match
  from winner_sample w
)
select
  (select min(id) from recent_source) as source_min_id_in_window,
  (select max(id) from recent_source) as source_max_id_in_window,
  (select count(*) from recent_source) as source_rows_in_window,
  count(*) as sampled_winner_rows,
  count(*) filter (where has_chassis_match) as winners_with_chassis_match,
  count(*) filter (where not has_chassis_match and has_vrn_match) as winners_with_vrn_fallback_match,
  count(*) filter (where not has_chassis_match and not has_vrn_match) as winners_requiring_insert
from classified;

-- 4) Sanity sample of recently touched rows by the migration's audit marker.
select
  t.id,
  t.chassis_no,
  t.vehicle_registration_number,
  t.last_service_dealer,
  t.last_service_type,
  t.updated_by_closed_job,
  t.updated_by_closed_job_at,
  t.last_updated_at
from public.all_service_data t
where t.updated_by_closed_job is true
order by t.updated_by_closed_job_at desc nulls last, t.id desc
limit 25;

-- 5) Row-count drift diagnostics (exact vs estimated + mutation counters).
--    Use this to explain apparent drops in estimated row count (UI estimate can change after analyze/autovacuum).
select
  count(*) as exact_rows
from public.all_service_data;

select
  c.reltuples::bigint as estimated_rows,
  s.n_live_tup,
  s.n_dead_tup,
  s.n_tup_ins,
  s.n_tup_upd,
  s.n_tup_del,
  s.last_analyze,
  s.last_autoanalyze,
  s.last_vacuum,
  s.last_autovacuum
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public'
  and c.relname = 'all_service_data';

-- 6) Timeout-safe unmatched probe (recent winner window).
--    If this returns has_unmatched_recent_winners = false repeatedly over time,
--    your backfill/reconcile is effectively caught up for recent data.
with recent_source as (
  select
    j.id,
    upper(nullif(btrim(j.chassis_number), '')) as chassis_norm,
    upper(nullif(btrim(j.vehicle_registration_number), '')) as vrn_norm,
    coalesce(j.closed_date_time, j.created_date_time, j.updated_at, j.created_at) as winner_ts
  from public.job_card_closed_data j
  where j.sr_type ilike '%Service%'
  order by j.id desc
  limit 50000
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
),
unmatched as (
  select 1
  from winners w
  where not exists (
    select 1
    from public.all_service_data t
    where (w.chassis_norm is not null and upper(nullif(btrim(t.chassis_no), '')) = w.chassis_norm)
       or (w.vrn_norm is not null and upper(nullif(btrim(t.vehicle_registration_number), '')) = w.vrn_norm)
  )
  limit 1
)
select
  (select min(id) from recent_source) as probe_min_source_id,
  (select max(id) from recent_source) as probe_max_source_id,
  exists (select 1 from unmatched) as has_unmatched_recent_winners;
