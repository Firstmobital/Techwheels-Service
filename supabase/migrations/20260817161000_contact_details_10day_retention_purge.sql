-- SUPABASE-002 Phase 8.6: keep only last 10 days of contact_details.
-- Daily pg_cron drain + optional manual catch-up via the same RPC.
-- Fill-null Customer phones first so a purge cannot drop an uncopied phone.

CREATE INDEX IF NOT EXISTS idx_contact_details_created_at
  ON public.contact_details (created_at);

COMMENT ON INDEX public.idx_contact_details_created_at IS
  'Supports 10-day retention purge on contact_details.created_at.';

CREATE OR REPLACE FUNCTION public.purge_contact_details_older_than(
  p_retention_days integer DEFAULT 10,
  p_batch_size integer DEFAULT 1000,
  p_max_ms integer DEFAULT 55000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_retention_days, 10), 1);
  v_batch integer := GREATEST(COALESCE(p_batch_size, 1000), 1);
  v_cutoff timestamptz := now() - make_interval(days => v_days);
  v_started timestamptz := clock_timestamp();
  v_deleted integer := 0;
  v_n integer := 0;
  v_budget_hit boolean := false;
  v_remaining boolean := true;
  v_filled integer := 0;
  v_trigger_disabled boolean := false;
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  -- Copy any remaining Customer phones before rows age out.
  v_filled := public.reconcile_all_service_data_from_contact_details_chunked(5000);

  ALTER TABLE public.contact_details
    DISABLE TRIGGER trg_refresh_all_service_data_from_contact_details;
  v_trigger_disabled := true;

  BEGIN
    WHILE v_remaining LOOP
      IF p_max_ms IS NOT NULL
         AND (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer >= p_max_ms
      THEN
        v_budget_hit := true;
        EXIT;
      END IF;

      WITH doomed AS (
        SELECT t.id
        FROM public.contact_details t
        WHERE t.created_at IS NULL
           OR t.created_at < v_cutoff
        ORDER BY t.created_at ASC NULLS FIRST, t.id ASC
        LIMIT v_batch
      )
      DELETE FROM public.contact_details t
      USING doomed d
      WHERE t.id = d.id;

      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_deleted := v_deleted + v_n;
      v_remaining := v_n >= v_batch;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.contact_details
      ENABLE TRIGGER trg_refresh_all_service_data_from_contact_details;
    v_trigger_disabled := false;
    RAISE;
  END;

  IF v_trigger_disabled THEN
    ALTER TABLE public.contact_details
      ENABLE TRIGGER trg_refresh_all_service_data_from_contact_details;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.contact_details t
    WHERE t.created_at IS NULL
       OR t.created_at < v_cutoff
    LIMIT 1
  )
  INTO v_remaining;

  RETURN jsonb_build_object(
    'ok', true,
    'retention_days', v_days,
    'cutoff', v_cutoff,
    'batch_size', v_batch,
    'filled_phones', v_filled,
    'deleted', v_deleted,
    'remaining', v_remaining,
    'budget_hit', v_budget_hit,
    'elapsed_ms', (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer,
    'ran_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.purge_contact_details_older_than(integer, integer, integer) IS
  'Deletes contact_details rows older than p_retention_days (created_at; NULL created_at is purged). '
  'Fills remaining Customer phones first. Batched with optional wall-clock budget (p_max_ms; NULL = drain until empty). '
  'Internal use only (pg_cron / service_role).';

REVOKE ALL ON FUNCTION public.purge_contact_details_older_than(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_contact_details_older_than(integer, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.purge_contact_details_older_than(integer, integer, integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.purge_contact_details_older_than(integer, integer, integer)
  TO postgres, service_role;

-- Daily cron at 02:15 IST (20:45 UTC), offset from service-history-test-30d-purge at 02:00 IST.
DO $cron$
DECLARE
  v_new_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping contact-details-10d-purge schedule';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job j
    WHERE j.jobname = 'contact-details-10d-purge'
       OR j.command ILIKE '%purge_contact_details_older_than%'
  ) THEN
    RAISE NOTICE 'contact-details-10d-purge cron already registered';
    RETURN;
  END IF;

  SELECT cron.schedule(
    'contact-details-10d-purge',
    '45 20 * * *',
    $cmd$SELECT public.purge_contact_details_older_than(10, 1000, 55000);$cmd$
  )
  INTO v_new_job_id;

  RAISE NOTICE 'Scheduled contact-details-10d-purge (jobid %)', v_new_job_id;
END;
$cron$;

-- Start draining backlog immediately (budgeted; re-run manually if remaining=true)
DO $drain$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.purge_contact_details_older_than(10, 1000, 55000);
  RAISE NOTICE 'Initial contact_details purge: %', v_result::text;
END;
$drain$;
