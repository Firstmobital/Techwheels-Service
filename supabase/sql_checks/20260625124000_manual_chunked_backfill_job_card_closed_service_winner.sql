-- Manual chunked backfill runner for:
--   public.refresh_all_service_data_from_job_card_closed_data(text, text)
--
-- Use this only after deploying:
--   20260625113000_all_service_data_sync_from_job_card_closed_data_service_winner.sql
--
-- Why this exists:
-- - Full backfill in one statement may hit SQL editor statement timeout.
-- - This runner auto-advances older ID windows across repeated runs.

-- 1) Find source ID bounds.
select
  min(id) as min_service_id,
  max(id) as max_service_id,
  count(*) as total_service_rows
from public.job_card_closed_data
where sr_type ilike '%Service%';

-- 2) Run one chunk (auto-advancing).
--    Re-run this same script repeatedly; it will continue from where previous run stopped.
--    You can tune v_chunk_size if needed.
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
  v_chunk_size integer := 2000;
  v_min_service_id bigint;
  v_max_service_id bigint;
  v_from_id bigint;
  v_to_id bigint;
  r record;
  v_processed integer := 0;
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

  for r in
    select
      j.id,
      j.chassis_number,
      j.vehicle_registration_number
    from public.job_card_closed_data j
    where j.sr_type ilike '%Service%'
      and j.id between v_from_id and v_to_id
    order by j.id
  loop
    perform public.refresh_all_service_data_from_job_card_closed_data(
      r.chassis_number,
      r.vehicle_registration_number
    );
    v_processed := v_processed + 1;
  end loop;

  update public.job_card_closed_backfill_progress p
  set
    next_to_id = case
      when v_from_id <= v_min_service_id then v_min_service_id - 1
      else v_from_id - 1
    end,
    updated_at = now()
  where p.process_name = v_process_name;

  raise notice 'Chunk complete. from_id=%, to_id=%, processed=%', v_from_id, v_to_id, v_processed;
end $$;

-- 3) Progress + sanity snapshot after any chunk.
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

select
  count(*) filter (where updated_by_closed_job is true) as touched_rows,
  max(updated_by_closed_job_at) as latest_touch_ts
from public.all_service_data;
