-- Dashboard-safe manual chunked backfill runner for closed-job winner sync.
-- Execute this file section-by-section in Supabase SQL Editor.
-- Purpose: avoid upstream timeout by processing smaller deduplicated key chunks.

-- 0) Optional reset (run once only if you want to restart from latest source id).
-- delete from public.job_card_closed_backfill_progress
-- where process_name = 'all_service_data_from_job_card_closed_service_winner';

-- 1) Source bounds snapshot.
select
  min(id) as min_service_id,
  max(id) as max_service_id,
  count(*) as total_service_rows
from public.job_card_closed_data
where sr_type ilike '%Service%';

-- 2) Run one timeout-safe chunk.
create table if not exists public.job_card_closed_backfill_progress (
  process_name text primary key,
  next_to_id bigint,
  min_service_id bigint,
  max_service_id bigint,
  updated_at timestamp with time zone not null default now()
);

DO $$
declare
  v_process_name text := 'all_service_data_from_job_card_closed_service_winner';
  v_chunk_size integer := 100;
  v_min_service_id bigint;
  v_max_service_id bigint;
  v_from_id bigint;
  v_to_id bigint;
  r record;
  v_processed_rows integer := 0;
  v_processed_keys integer := 0;
begin
  select
    min(j.id),
    max(j.id)
  into v_min_service_id, v_max_service_id
  from public.job_card_closed_data j
  where j.sr_type ilike '%Service%';

  if v_max_service_id is null then
    raise notice 'No Service source rows found. Nothing to process.';
    return;
  end if;

  insert into public.job_card_closed_backfill_progress (
    process_name,
    next_to_id,
    min_service_id,
    max_service_id,
    updated_at
  ) values (
    v_process_name,
    v_max_service_id,
    v_min_service_id,
    v_max_service_id,
    now()
  )
  on conflict (process_name) do update
    set min_service_id = excluded.min_service_id,
        max_service_id = excluded.max_service_id,
        updated_at = now();

  select p.next_to_id
  into v_to_id
  from public.job_card_closed_backfill_progress p
  where p.process_name = v_process_name;

  if v_to_id is null or v_to_id < v_min_service_id then
    raise notice 'Backfill already complete. next_to_id=%, min_service_id=%', v_to_id, v_min_service_id;
    return;
  end if;

  v_from_id := greatest(v_min_service_id, v_to_id - v_chunk_size + 1);

  select count(*)
  into v_processed_rows
  from public.job_card_closed_data j
  where j.sr_type ilike '%Service%'
    and j.id between v_from_id and v_to_id;

  for r in
    with window_rows as (
      select
        j.id,
        j.chassis_number,
        j.vehicle_registration_number,
        upper(nullif(btrim(j.chassis_number), '')) as chassis_norm,
        upper(nullif(btrim(j.vehicle_registration_number), '')) as vrn_norm
      from public.job_card_closed_data j
      where j.sr_type ilike '%Service%'
        and j.id between v_from_id and v_to_id
    ),
    dedup_keys as (
      select distinct on (chassis_norm, vrn_norm)
        wr.id,
        wr.chassis_number,
        wr.vehicle_registration_number
      from window_rows wr
      where wr.chassis_norm is not null or wr.vrn_norm is not null
      order by wr.chassis_norm, wr.vrn_norm, wr.id desc
    )
    select
      dk.id,
      dk.chassis_number,
      dk.vehicle_registration_number
    from dedup_keys dk
    order by dk.id
  loop
    perform public.refresh_all_service_data_from_job_card_closed_data(
      r.chassis_number,
      r.vehicle_registration_number
    );
    v_processed_keys := v_processed_keys + 1;
  end loop;

  update public.job_card_closed_backfill_progress p
  set
    next_to_id = case
      when v_from_id <= v_min_service_id then v_min_service_id - 1
      else v_from_id - 1
    end,
    updated_at = now()
  where p.process_name = v_process_name;

  raise notice 'Chunk complete. from_id=%, to_id=%, source_rows_in_window=%, unique_keys_processed=%',
    v_from_id, v_to_id, v_processed_rows, v_processed_keys;
end $$;

-- 3) Check progress after each chunk run.
select
  p.process_name,
  p.min_service_id,
  p.max_service_id,
  p.next_to_id,
  case
    when p.next_to_id is null or p.next_to_id < p.min_service_id then true
    else false
  end as backfill_complete,
  p.updated_at as progress_updated_at
from public.job_card_closed_backfill_progress p
where p.process_name = 'all_service_data_from_job_card_closed_service_winner';

-- 4) Verify missing source winner rows are zero.
with source_base as (
  select
    j.id as source_id,
    upper(nullif(btrim(j.chassis_number), '')) as chassis_norm,
    upper(nullif(btrim(j.vehicle_registration_number), '')) as vrn_norm,
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
)
select
  count(*) as source_winners_missing_in_target
from winners w
where not exists (
  select 1
  from public.all_service_data t
  where (w.chassis_norm is not null and upper(nullif(btrim(t.chassis_no), '')) = w.chassis_norm)
     or (w.chassis_norm is null and w.vrn_norm is not null and upper(nullif(btrim(t.vehicle_registration_number), '')) = w.vrn_norm)
);

-- 5) Verify trigger and cron are active for ongoing sync.
select
  t.tgname as trigger_name,
  c.relname as table_name,
  t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'job_card_closed_data'
  and t.tgname = 'trg_refresh_all_service_data_from_job_card_closed_data'
  and not t.tgisinternal;

select
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  j.command
from cron.job j
where j.jobname = 'all-service-data-closed-job-winner-sync-daily-ist';

-- 6) Detailed unmatched winners + reason classification.
--    Run this only after backfill_complete=true.
with source_base as (
  select
    j.id as source_id,
    nullif(btrim(j.chassis_number), '') as chassis_number_raw,
    nullif(btrim(j.vehicle_registration_number), '') as vehicle_registration_number_raw,
    upper(nullif(btrim(j.chassis_number), '')) as chassis_norm,
    upper(nullif(btrim(j.vehicle_registration_number), '')) as vrn_norm,
    j.sr_type,
    j.closed_date_time,
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
unmatched as (
  select
    w.*
  from winners w
  where not exists (
    select 1
    from public.all_service_data t
    where (w.chassis_norm is not null and upper(nullif(btrim(t.chassis_no), '')) = w.chassis_norm)
       or (w.chassis_norm is null and w.vrn_norm is not null and upper(nullif(btrim(t.vehicle_registration_number), '')) = w.vrn_norm)
  )
)
select
  u.source_id,
  u.chassis_number_raw,
  u.vehicle_registration_number_raw,
  u.sr_type,
  u.closed_date_time,
  u.winner_ts,
  case
    when u.chassis_norm is null and u.vrn_norm is null then 'SOURCE_KEYS_BLANK'
    when u.chassis_norm is null and u.vrn_norm is not null then 'VRN_ONLY_NO_TARGET_MATCH'
    when u.chassis_norm is not null and u.vrn_norm is null then 'CHASSIS_ONLY_NO_TARGET_MATCH'
    else 'CHASSIS_AND_VRN_PRESENT_NO_TARGET_MATCH'
  end as unmatched_reason
from unmatched u
order by u.winner_ts desc nulls last, u.source_id desc;

-- 7) Compact reason summary for unmatched winners.
with source_base as (
  select
    j.id as source_id,
    upper(nullif(btrim(j.chassis_number), '')) as chassis_norm,
    upper(nullif(btrim(j.vehicle_registration_number), '')) as vrn_norm,
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
unmatched as (
  select
    w.*
  from winners w
  where not exists (
    select 1
    from public.all_service_data t
    where (w.chassis_norm is not null and upper(nullif(btrim(t.chassis_no), '')) = w.chassis_norm)
       or (w.chassis_norm is null and w.vrn_norm is not null and upper(nullif(btrim(t.vehicle_registration_number), '')) = w.vrn_norm)
  )
)
select
  case
    when u.chassis_norm is null and u.vrn_norm is null then 'SOURCE_KEYS_BLANK'
    when u.chassis_norm is null and u.vrn_norm is not null then 'VRN_ONLY_NO_TARGET_MATCH'
    when u.chassis_norm is not null and u.vrn_norm is null then 'CHASSIS_ONLY_NO_TARGET_MATCH'
    else 'CHASSIS_AND_VRN_PRESENT_NO_TARGET_MATCH'
  end as unmatched_reason,
  count(*) as rows_count
from unmatched u
group by 1
order by rows_count desc, unmatched_reason;
