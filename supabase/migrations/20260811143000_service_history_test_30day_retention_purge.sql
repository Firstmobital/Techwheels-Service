-- 30-day retention for EV/PV service history test tables.
-- Keeps rows with created_at >= now() - 30 days; purges older rows in batches.
-- Daily pg_cron drain + optional manual catch-up via the same RPC.

-- 1) Indexes for retention deletes (created_at predicate)
CREATE INDEX IF NOT EXISTS idx_ev_service_history_test_created_at
  ON public.ev_service_history_test (created_at);

CREATE INDEX IF NOT EXISTS idx_pv_service_history_test_created_at
  ON public.pv_service_history_test (created_at);

COMMENT ON INDEX public.idx_ev_service_history_test_created_at IS
  'Supports 30-day retention purge on ev_service_history_test.created_at.';

COMMENT ON INDEX public.idx_pv_service_history_test_created_at IS
  'Supports 30-day retention purge on pv_service_history_test.created_at.';

-- 2) Batched purge RPC (SECURITY DEFINER; cron / service_role only)
CREATE OR REPLACE FUNCTION public.purge_service_history_test_older_than(
  p_retention_days integer DEFAULT 30,
  p_batch_size integer DEFAULT 1000,
  p_max_ms integer DEFAULT 55000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_days integer := greatest(coalesce(p_retention_days, 30), 1);
  v_batch integer := greatest(coalesce(p_batch_size, 1000), 1);
  v_cutoff timestamptz := now() - make_interval(days => v_days);
  v_started timestamptz := clock_timestamp();
  v_ev_deleted integer := 0;
  v_pv_deleted integer := 0;
  v_ev_n integer;
  v_pv_n integer;
  v_budget_hit boolean := false;
  v_ev_remaining boolean := true;
  v_pv_remaining boolean := true;
BEGIN
  -- Raise local timeout above wall budget so the function can exit cleanly.
  PERFORM set_config('statement_timeout', '120s', true);

  -- Interleave EV/PV batches so one table cannot starve the other under a time budget.
  WHILE v_ev_remaining OR v_pv_remaining LOOP
    IF p_max_ms IS NOT NULL
       AND (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer >= p_max_ms
    THEN
      v_budget_hit := true;
      EXIT;
    END IF;

    v_ev_n := 0;
    v_pv_n := 0;

    IF v_ev_remaining THEN
      WITH doomed AS (
        SELECT t.id
        FROM public.ev_service_history_test t
        WHERE t.created_at < v_cutoff
        ORDER BY t.created_at ASC, t.id ASC
        LIMIT v_batch
      )
      DELETE FROM public.ev_service_history_test t
      USING doomed d
      WHERE t.id = d.id;

      GET DIAGNOSTICS v_ev_n = ROW_COUNT;
      v_ev_deleted := v_ev_deleted + v_ev_n;
      v_ev_remaining := v_ev_n >= v_batch;
    END IF;

    IF p_max_ms IS NOT NULL
       AND (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer >= p_max_ms
    THEN
      v_budget_hit := true;
      EXIT;
    END IF;

    IF v_pv_remaining THEN
      WITH doomed AS (
        SELECT t.id
        FROM public.pv_service_history_test t
        WHERE t.created_at < v_cutoff
        ORDER BY t.created_at ASC, t.id ASC
        LIMIT v_batch
      )
      DELETE FROM public.pv_service_history_test t
      USING doomed d
      WHERE t.id = d.id;

      GET DIAGNOSTICS v_pv_n = ROW_COUNT;
      v_pv_deleted := v_pv_deleted + v_pv_n;
      v_pv_remaining := v_pv_n >= v_batch;
    END IF;

    -- Both returned partial/empty batches → nothing left in this run window.
    EXIT WHEN (NOT v_ev_remaining) AND (NOT v_pv_remaining);
  END LOOP;

  -- Re-check remaining after budgeted exit (partial last batch may still leave rows).
  SELECT EXISTS (
    SELECT 1
    FROM public.ev_service_history_test t
    WHERE t.created_at < v_cutoff
    LIMIT 1
  )
  INTO v_ev_remaining;

  SELECT EXISTS (
    SELECT 1
    FROM public.pv_service_history_test t
    WHERE t.created_at < v_cutoff
    LIMIT 1
  )
  INTO v_pv_remaining;

  RETURN jsonb_build_object(
    'ok', true,
    'retention_days', v_days,
    'cutoff', v_cutoff,
    'batch_size', v_batch,
    'ev_deleted', v_ev_deleted,
    'pv_deleted', v_pv_deleted,
    'ev_remaining', v_ev_remaining,
    'pv_remaining', v_pv_remaining,
    'budget_hit', v_budget_hit,
    'elapsed_ms', (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer,
    'ran_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.purge_service_history_test_older_than(integer, integer, integer) IS
  'Deletes EV/PV service_history_test rows older than p_retention_days (created_at). '
  'Batched with optional wall-clock budget (p_max_ms; NULL = drain until empty). '
  'Internal use only (pg_cron / service_role).';

REVOKE ALL ON FUNCTION public.purge_service_history_test_older_than(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_service_history_test_older_than(integer, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.purge_service_history_test_older_than(integer, integer, integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.purge_service_history_test_older_than(integer, integer, integer)
  TO postgres, service_role;

-- 3) Daily cron at 02:00 IST (20:30 UTC)
DO $cron$
DECLARE
  v_new_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping service-history-test-30d-purge schedule';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job j
    WHERE j.jobname = 'service-history-test-30d-purge'
       OR j.command ILIKE '%purge_service_history_test_older_than%'
  ) THEN
    RAISE NOTICE 'service-history-test-30d-purge cron already registered';
    RETURN;
  END IF;

  SELECT cron.schedule(
    'service-history-test-30d-purge',
    '30 20 * * *',
    $cmd$SELECT public.purge_service_history_test_older_than(30, 1000, 55000);$cmd$
  )
  INTO v_new_job_id;

  RAISE NOTICE 'Scheduled service-history-test-30d-purge (jobid %)', v_new_job_id;
END;
$cron$;

-- 4) Start draining backlog immediately (budgeted; re-run manually if remaining=true)
DO $drain$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.purge_service_history_test_older_than(30, 1000, 55000);
  RAISE NOTICE 'Initial service_history_test purge: %', v_result::text;
END;
$drain$;
