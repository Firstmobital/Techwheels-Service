-- Background IDSPay RC fetch for insurance renewal campaigns: job queue + per-lead
-- attempt log so each campaign only calls the API for new stale leads (null or
-- insurance expiry older than 365 days) that were never fetched before.
-- Deploy insurance-renewal-telecalling with verify_jwt=false or cron gets HTTP 401.
-- attempt log so each campaign only calls the API for new stale leads (null or
-- insurance expiry older than 365 days) that were never fetched before.

CREATE TABLE public.insurance_renewal_rc_fetch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id bigint NOT NULL REFERENCES public.insurance_renewal_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_customer_id bigint NOT NULL DEFAULT 0,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text
);

CREATE INDEX idx_insurance_renewal_rc_fetch_jobs_campaign_status
  ON public.insurance_renewal_rc_fetch_jobs (campaign_id, status);

CREATE INDEX idx_insurance_renewal_rc_fetch_jobs_status_created
  ON public.insurance_renewal_rc_fetch_jobs (status, created_at);

CREATE TABLE public.insurance_renewal_rc_fetch_attempts (
  campaign_id bigint NOT NULL REFERENCES public.insurance_renewal_campaigns(id) ON DELETE CASCADE,
  customer_id bigint NOT NULL REFERENCES public.all_service_data(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.insurance_renewal_rc_fetch_jobs(id) ON DELETE SET NULL,
  outcome text NOT NULL
    CHECK (outcome IN ('success', 'failed', 'skipped_no_vrn', 'skipped_fresh')),
  from_cache boolean NOT NULL DEFAULT false,
  error_text text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, customer_id)
);

CREATE INDEX idx_insurance_renewal_rc_fetch_attempts_job
  ON public.insurance_renewal_rc_fetch_attempts (job_id);

COMMENT ON TABLE public.insurance_renewal_rc_fetch_jobs IS
  'Queued background RC (IDSPay) refresh jobs per insurance renewal campaign.';
COMMENT ON TABLE public.insurance_renewal_rc_fetch_attempts IS
  'One row per campaign lead after RC fetch was attempted; prevents duplicate API calls.';

-- Pending = assignment in campaign, stale insurance on all_service_data, no attempt row.
CREATE OR REPLACE FUNCTION public.insurance_renewal_rc_fetch_pending_counts(p_campaign_id bigint)
RETURNS TABLE (
  pending_stale bigint,
  pending_with_vrn bigint,
  pending_missing_vrn bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint AS pending_stale,
    count(*) FILTER (
      WHERE coalesce(nullif(trim(s.vehicle_registration_number), ''), '') <> ''
    )::bigint AS pending_with_vrn,
    count(*) FILTER (
      WHERE coalesce(nullif(trim(s.vehicle_registration_number), ''), '') = ''
    )::bigint AS pending_missing_vrn
  FROM public.insurance_renewal_assignments ra
  JOIN public.all_service_data s ON s.id = ra.customer_id
  LEFT JOIN public.insurance_renewal_rc_fetch_attempts a
    ON a.campaign_id = ra.campaign_id AND a.customer_id = ra.customer_id
  WHERE ra.campaign_id = p_campaign_id
    AND a.customer_id IS NULL
    AND (
      s.last_insurance_expiry_date IS NULL
      OR s.last_insurance_expiry_date < (CURRENT_DATE - 365)
    );
$$;

COMMENT ON FUNCTION public.insurance_renewal_rc_fetch_pending_counts(bigint) IS
  'Counts campaign leads eligible for first-time RC fetch (stale/null insurance, no prior attempt).';

CREATE OR REPLACE FUNCTION public.insurance_renewal_rc_fetch_next_candidates(
  p_campaign_id bigint,
  p_after_customer_id bigint,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  customer_id bigint,
  vehicle_registration_number text,
  last_insurance_expiry_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id AS customer_id,
    s.vehicle_registration_number,
    s.last_insurance_expiry_date
  FROM public.insurance_renewal_assignments ra
  JOIN public.all_service_data s ON s.id = ra.customer_id
  LEFT JOIN public.insurance_renewal_rc_fetch_attempts a
    ON a.campaign_id = ra.campaign_id AND a.customer_id = ra.customer_id
  WHERE ra.campaign_id = p_campaign_id
    AND ra.customer_id > coalesce(p_after_customer_id, 0)
    AND a.customer_id IS NULL
    AND (
      s.last_insurance_expiry_date IS NULL
      OR s.last_insurance_expiry_date < (CURRENT_DATE - 365)
    )
  ORDER BY ra.customer_id ASC
  LIMIT greatest(coalesce(p_limit, 50), 1);
$$;

COMMENT ON FUNCTION public.insurance_renewal_rc_fetch_next_candidates(bigint, bigint, integer) IS
  'Next unscanned stale campaign leads for background RC worker (ordered by customer_id).';

CREATE OR REPLACE FUNCTION public.invoke_insurance_renewal_rc_fetch_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/insurance-renewal-telecalling',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'd4738d9a19012e96922a7e9d53959c0b8169ba573743e08f5609a9a601986511'
    ),
    body := '{"action":"process_rc_fetch_jobs"}'::jsonb,
    timeout_milliseconds := 120000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.invoke_insurance_renewal_rc_fetch_worker() IS
  'pg_cron/pg_net wrapper: processes queued insurance renewal RC fetch jobs (2 min schedule).';

GRANT EXECUTE ON FUNCTION public.insurance_renewal_rc_fetch_pending_counts(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insurance_renewal_rc_fetch_next_candidates(bigint, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoke_insurance_renewal_rc_fetch_worker() TO postgres, service_role;

DO $cron$
DECLARE
  v_new_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping insurance renewal RC fetch worker schedule';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM cron.job j
    WHERE j.command ILIKE '%invoke_insurance_renewal_rc_fetch_worker%'
  ) THEN
    RAISE NOTICE 'insurance renewal RC fetch cron already registered';
    RETURN;
  END IF;

  SELECT cron.schedule(
    'insurance-renewal-rc-fetch-worker',
    '*/2 * * * *',
    $cmd$SELECT public.invoke_insurance_renewal_rc_fetch_worker();$cmd$
  )
  INTO v_new_job_id;

  RAISE NOTICE 'Scheduled insurance-renewal-rc-fetch-worker (jobid %)', v_new_job_id;
END;
$cron$;
