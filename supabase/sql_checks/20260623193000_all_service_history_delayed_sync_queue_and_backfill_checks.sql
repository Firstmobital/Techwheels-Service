-- Read-only verification checks for:
-- supabase/migrations/20260623193000_all_service_history_delayed_sync_queue_and_backfill.sql

-- 1) Queue table exists.
SELECT
  table_schema,
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'all_service_history_sync_queue';

-- 2) Enqueue/processor functions exist.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'enqueue_all_service_history_sync',
    'process_all_service_history_sync_queue'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- 3) Service-history trigger function now queues delayed sync and no longer calls direct refresh.
SELECT
  position('enqueue_all_service_history_sync' in pg_get_functiondef(p.oid)) > 0 AS uses_queue_enqueue,
  position('refresh_all_service_data_from_service_history(' in pg_get_functiondef(p.oid)) > 0 AS still_calls_direct_refresh
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'trg_sync_all_service_data_from_service_history'
  AND pg_get_function_identity_arguments(p.oid) = '';

-- 4) all_service_data AFTER INSERT trigger function now queues delayed sync.
SELECT
  position('enqueue_all_service_history_sync(NEW.chassis_no' in pg_get_functiondef(p.oid)) > 0 AS insert_trigger_uses_queue,
  position('refresh_all_service_data_from_service_history(NEW.chassis_no)' in pg_get_functiondef(p.oid)) > 0 AS insert_trigger_still_direct_refresh
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'trg_refresh_all_service_data_from_history_on_insert'
  AND pg_get_function_identity_arguments(p.oid) = '';

-- 5) Worker cron job exists.
SELECT
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname = 'all-service-history-sync-queue-worker';

-- 6) Queue backlog snapshot.
SELECT
  COUNT(*) AS queued_total,
  COUNT(*) FILTER (WHERE not_before <= now()) AS queued_due_now,
  MIN(not_before) AS earliest_not_before,
  MAX(not_before) AS latest_not_before
FROM public.all_service_history_sync_queue;

-- 7) Known case parity after queue processing.
WITH chosen AS (
  SELECT
    h.id,
    h.sr_type,
    h.service_date_time,
    h.created_at,
    h.odometer_reading
  FROM public."PV_service_history_test" h
  WHERE upper(btrim(h.chassis_no)) = 'MAT627165JLJ40356'
  ORDER BY
    CASE WHEN lower(coalesce(h.sr_type, '')) LIKE '%service%' THEN 0 ELSE 1 END ASC,
    h.service_date_time DESC NULLS LAST,
    h.created_at DESC NULLS LAST,
    h.id DESC
  LIMIT 1
)
SELECT
  a.id AS target_id,
  a.chassis_no,
  a.last_service_type,
  a.last_service_date,
  a.last_service_km,
  c.id AS chosen_id,
  c.sr_type AS chosen_sr_type,
  c.service_date_time AS chosen_service_date_time,
  c.odometer_reading AS chosen_odometer,
  (
    a.last_service_type IS NOT DISTINCT FROM c.sr_type
    AND a.last_service_date IS NOT DISTINCT FROM c.service_date_time
    AND a.last_service_km IS NOT DISTINCT FROM c.odometer_reading
  ) AS target_matches_chosen
FROM public.all_service_data a
CROSS JOIN chosen c
WHERE upper(btrim(a.chassis_no)) = 'MAT627165JLJ40356';
