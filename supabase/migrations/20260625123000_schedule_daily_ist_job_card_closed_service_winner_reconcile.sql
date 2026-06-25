-- Schedule daily IST reconcile for job_card_closed_data -> all_service_data winner sync.
-- Requires migration:
--   20260625113000_all_service_data_sync_from_job_card_closed_data_service_winner.sql

begin;

-- Keep function ACL aligned with default invoker requirements in scheduled context.
grant execute on function public.refresh_all_service_data_from_job_card_closed_data(text, text)
  to postgres, service_role;

grant execute on function public.reconcile_all_service_data_from_job_card_closed_data_chunked(integer, bigint)
  to postgres, service_role;

do $$
declare
  v_existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid
    into v_existing_job_id
    from cron.job
    where jobname = 'all-service-data-closed-job-winner-sync-daily-ist'
    limit 1;

    if v_existing_job_id is not null then
      perform cron.unschedule(v_existing_job_id);
    end if;

    -- 18:30 UTC = 00:00 IST (daily)
    perform cron.schedule(
      'all-service-data-closed-job-winner-sync-daily-ist',
      '30 18 * * *',
      $job$select public.reconcile_all_service_data_from_job_card_closed_data_chunked(1000, null);$job$
    );
  end if;
end $$;

commit;
