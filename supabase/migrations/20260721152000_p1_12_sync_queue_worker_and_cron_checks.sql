-- Checks for 20260721152000_p1_12_sync_queue_worker_and_cron.sql

select
  p.proname,
  pg_get_functiondef(p.oid) ilike '%default 50%' as default_batch_50,
  pg_get_functiondef(p.oid) ilike '%v_max_ms%' as has_time_budget
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'process_all_service_history_sync_queue';

select
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  j.command ilike '%process_all_service_history_sync_queue(50)%' as uses_batch_50
from cron.job j
where j.command ilike '%process_all_service_history_sync_queue%'
order by j.jobid;

select *
from public.process_all_service_history_sync_queue(p_batch_size => 5);
