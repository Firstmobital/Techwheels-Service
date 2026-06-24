-- Schedule daily reconciliation for robot-flag freshness at IST day boundary.
-- IST midnight equals 18:30 UTC on the previous UTC day.
-- pg_cron uses server-side cron scheduling; this job runs once daily at 18:30 UTC,
-- which maps to 00:00 IST.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    RAISE EXCEPTION 'pg_cron extension is not installed; cannot schedule reconcile job';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'all-service-data-robot-flag-freshness-daily-ist'
  ) THEN
    PERFORM cron.unschedule('all-service-data-robot-flag-freshness-daily-ist');
  END IF;
END;
$$;

SELECT cron.schedule(
  'all-service-data-robot-flag-freshness-daily-ist',
  '30 18 * * *',
  $$SELECT public.reconcile_all_service_data_robot_flag_freshness_for_plus2_due();$$
);
