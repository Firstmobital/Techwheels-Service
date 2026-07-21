-- P1-12 / SUPABASE-003: smaller default batch, 60s wall-clock budget, pg_cron command (50).

create or replace function public.process_all_service_history_sync_queue(p_batch_size integer default 50)
 returns table(processed_count integer, remaining_due_count integer)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $$
declare
  v_rec record;
  v_processed integer := 0;
  v_batch integer := greatest(coalesce(p_batch_size, 50), 1);
  v_started timestamptz := clock_timestamp();
  v_max_ms constant integer := 60000;
begin
  for v_rec in
    select q.chassis_key
    from public.all_service_history_sync_queue q
    where q.not_before <= now()
    order by q.not_before asc, q.chassis_key asc
    limit v_batch
    for update skip locked
  loop
    if (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer >= v_max_ms then
      exit;
    end if;

    perform public.refresh_all_service_data_from_service_history(v_rec.chassis_key);
    delete from public.all_service_history_sync_queue
    where chassis_key = v_rec.chassis_key;
    v_processed := v_processed + 1;
  end loop;

  return query
  select
    v_processed,
    (
      select count(*)::integer
      from public.all_service_history_sync_queue q
      where q.not_before <= now()
    ) as remaining_due_count;
end;
$$;

comment on function public.process_all_service_history_sync_queue(integer) is
  'Processes due chassis refresh requests from queue with bounded batch size (default 50) '
  'and 60s wall-clock budget per invocation. Internal use only (pg_cron / service_role).';

-- Re-register pg_cron job preserving existing schedule; only change batch argument.
do $cron$
declare
  v_job record;
  v_new_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skipping cron update';
    return;
  end if;

  select j.jobid, j.schedule, j.jobname, j.active
  into v_job
  from cron.job j
  where j.command ilike '%process_all_service_history_sync_queue%'
  order by j.jobid
  limit 1;

  if v_job.jobid is null then
    raise notice 'No pg_cron job found for process_all_service_history_sync_queue';
    return;
  end if;

  perform cron.unschedule(v_job.jobid);

  select cron.schedule(
    coalesce(nullif(btrim(v_job.jobname), ''), 'all-service-history-sync-queue'),
    v_job.schedule,
    $cmd$select public.process_all_service_history_sync_queue(50);$cmd$
  )
  into v_new_job_id;

  raise notice 'Rescheduled service history sync queue cron (jobid % -> %, schedule %)',
    v_job.jobid, v_new_job_id, v_job.schedule;
end;
$cron$;
