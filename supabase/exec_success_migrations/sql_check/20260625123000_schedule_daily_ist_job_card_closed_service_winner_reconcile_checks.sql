-- Read-only checks for:
--   supabase/migrations/20260625123000_schedule_daily_ist_job_card_closed_service_winner_reconcile.sql

-- 1) pg_cron extension presence.
select
  extname,
  extversion
from pg_extension
where extname = 'pg_cron';

-- 2) Daily IST schedule presence and shape.
select
  j.jobid,
  j.jobname,
  j.schedule,
  j.command,
  j.active
from cron.job j
where j.jobname = 'all-service-data-closed-job-winner-sync-daily-ist';

-- 3) Ensure only one active job exists with this name.
select
  count(*) as matching_job_rows,
  count(*) filter (where active) as active_matching_job_rows
from cron.job
where jobname = 'all-service-data-closed-job-winner-sync-daily-ist';

-- 4) Function existence sanity.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'refresh_all_service_data_from_job_card_closed_data',
    'reconcile_all_service_data_from_job_card_closed_data_chunked'
  )
order by p.proname;

-- 4b) Cron command should use chunked reconcile helper.
select
  j.jobname,
  (j.command ilike '%reconcile_all_service_data_from_job_card_closed_data_chunked%') as uses_chunked_reconcile
from cron.job j
where j.jobname = 'all-service-data-closed-job-winner-sync-daily-ist';

-- 5) Audit marker sanity sample (recent writes by this flow).
select
  t.id,
  t.chassis_no,
  t.vehicle_registration_number,
  t.last_service_type,
  t.updated_by_closed_job,
  t.updated_by_closed_job_at,
  t.last_updated_at
from public.all_service_data t
where t.updated_by_closed_job is true
order by t.updated_by_closed_job_at desc nulls last, t.id desc
limit 25;
