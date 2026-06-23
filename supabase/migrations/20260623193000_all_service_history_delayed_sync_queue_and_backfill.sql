-- Delayed realtime sync durability:
-- 1) Debounce chassis-level sync requests through a queue table.
-- 2) Replace immediate refresh calls in triggers with queue-enqueue calls.
-- 3) Process queue by pg_cron worker every minute.
-- 4) Seed + process backlog once for old cases.

BEGIN;

CREATE TABLE IF NOT EXISTS public.all_service_history_sync_queue (
  chassis_key text PRIMARY KEY,
  last_event_at timestamp with time zone NOT NULL DEFAULT now(),
  not_before timestamp with time zone NOT NULL DEFAULT now(),
  enqueue_count integer NOT NULL DEFAULT 1,
  source_tag text
);

COMMENT ON TABLE public.all_service_history_sync_queue IS
'Debounce queue for chassis-level all_service_data refresh from service history.';

CREATE INDEX IF NOT EXISTS idx_all_service_history_sync_queue_not_before
  ON public.all_service_history_sync_queue (not_before);

CREATE OR REPLACE FUNCTION public.enqueue_all_service_history_sync(
  p_chassis_no text,
  p_delay interval DEFAULT interval '45 seconds'
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
  v_delay interval;
BEGIN
  v_key := nullif(upper(btrim(coalesce(p_chassis_no, ''))), '');
  v_delay := COALESCE(p_delay, interval '45 seconds');

  IF v_key IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.all_service_history_sync_queue (
    chassis_key,
    last_event_at,
    not_before,
    enqueue_count,
    source_tag
  )
  VALUES (
    v_key,
    now(),
    now() + v_delay,
    1,
    'trigger'
  )
  ON CONFLICT (chassis_key) DO UPDATE
  SET
    last_event_at = EXCLUDED.last_event_at,
    not_before = GREATEST(public.all_service_history_sync_queue.not_before, EXCLUDED.not_before),
    enqueue_count = public.all_service_history_sync_queue.enqueue_count + 1,
    source_tag = EXCLUDED.source_tag;
END;
$$;

COMMENT ON FUNCTION public.enqueue_all_service_history_sync(text, interval) IS
'Enqueues or extends delayed chassis-level refresh requests for all_service_data history sync.';

CREATE OR REPLACE FUNCTION public.process_all_service_history_sync_queue(
  p_batch_size integer DEFAULT 500
)
RETURNS TABLE(processed_count integer, remaining_due_count integer)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec record;
  v_processed integer := 0;
  v_batch integer := GREATEST(COALESCE(p_batch_size, 500), 1);
BEGIN
  FOR v_rec IN
    SELECT q.chassis_key
    FROM public.all_service_history_sync_queue q
    WHERE q.not_before <= now()
    ORDER BY q.not_before ASC, q.chassis_key ASC
    LIMIT v_batch
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.refresh_all_service_data_from_service_history(v_rec.chassis_key);
    DELETE FROM public.all_service_history_sync_queue
    WHERE chassis_key = v_rec.chassis_key;
    v_processed := v_processed + 1;
  END LOOP;

  RETURN QUERY
  SELECT
    v_processed,
    (
      SELECT COUNT(*)::integer
      FROM public.all_service_history_sync_queue q
      WHERE q.not_before <= now()
    ) AS remaining_due_count;
END;
$$;

COMMENT ON FUNCTION public.process_all_service_history_sync_queue(integer) IS
'Processes due chassis refresh requests from queue with bounded batch size.';

CREATE OR REPLACE FUNCTION public.trg_sync_all_service_data_from_service_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_all_service_history_sync(OLD.chassis_no, interval '45 seconds');
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND upper(btrim(coalesce(OLD.chassis_no, ''))) IS DISTINCT FROM upper(btrim(coalesce(NEW.chassis_no, '')))
  THEN
    PERFORM public.enqueue_all_service_history_sync(OLD.chassis_no, interval '45 seconds');
  END IF;

  PERFORM public.enqueue_all_service_history_sync(NEW.chassis_no, interval '45 seconds');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_sync_all_service_data_from_service_history() IS
'Queues delayed refresh for affected chassis on EV/PV service-history changes.';

CREATE OR REPLACE FUNCTION public.trg_refresh_all_service_data_from_history_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.enqueue_all_service_history_sync(NEW.chassis_no, interval '45 seconds');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_refresh_all_service_data_from_history_on_insert() IS
'After INSERT on all_service_data, queues delayed service-history replay for NEW.chassis_no.';

-- Seed old cases into queue and process immediately once.
INSERT INTO public.all_service_history_sync_queue (
  chassis_key,
  last_event_at,
  not_before,
  enqueue_count,
  source_tag
)
SELECT DISTINCT
  upper(btrim(a.chassis_no)) AS chassis_key,
  now() AS last_event_at,
  now() AS not_before,
  1 AS enqueue_count,
  'migration-backfill' AS source_tag
FROM public.all_service_data a
WHERE nullif(btrim(a.chassis_no), '') IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM public."EV_service_history_test" e
      WHERE upper(btrim(e.chassis_no)) = upper(btrim(a.chassis_no))
    )
    OR EXISTS (
      SELECT 1
      FROM public."PV_service_history_test" p
      WHERE upper(btrim(p.chassis_no)) = upper(btrim(a.chassis_no))
    )
  )
ON CONFLICT (chassis_key) DO UPDATE
SET
  last_event_at = EXCLUDED.last_event_at,
  not_before = LEAST(public.all_service_history_sync_queue.not_before, EXCLUDED.not_before),
  source_tag = EXCLUDED.source_tag;

SELECT * FROM public.process_all_service_history_sync_queue(20000);

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE jobname = 'all-service-history-sync-queue-worker';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'all-service-history-sync-queue-worker',
    '* * * * *',
    'SELECT public.process_all_service_history_sync_queue(500);'
  );
END;
$$;

COMMIT;
