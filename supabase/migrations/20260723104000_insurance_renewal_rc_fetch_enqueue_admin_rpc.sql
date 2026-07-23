-- Queue RC fetch from admin UI without Edge (cron/worker still processes via pg_net).

CREATE OR REPLACE FUNCTION public.insurance_renewal_rc_fetch_enqueue_admin(p_campaign_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_email text;
  v_pending_stale bigint;
  v_pending_with_vrn bigint;
  v_pending_missing_vrn bigint;
  v_active_id uuid;
  v_job_id uuid;
  v_job_status text;
  v_job_created timestamptz;
  v_kick bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Missing campaign_id';
  END IF;

  SELECT u.role, u.email INTO v_role, v_email FROM public.users u WHERE u.id = v_uid;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT p.pending_stale, p.pending_with_vrn, p.pending_missing_vrn
  INTO v_pending_stale, v_pending_with_vrn, v_pending_missing_vrn
  FROM public.insurance_renewal_rc_fetch_pending_counts(p_campaign_id) p;

  IF coalesce(v_pending_with_vrn, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No new stale leads with registration numbers to fetch.',
      'job', null,
      'pending_stale', coalesce(v_pending_stale, 0),
      'pending_with_vrn', coalesce(v_pending_with_vrn, 0),
      'pending_missing_vrn', coalesce(v_pending_missing_vrn, 0)
    );
  END IF;

  SELECT j.id INTO v_active_id
  FROM public.insurance_renewal_rc_fetch_jobs j
  WHERE j.campaign_id = p_campaign_id
    AND j.status IN ('queued', 'running')
  LIMIT 1;

  IF v_active_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'RC fetch job already queued or running.',
      'job', jsonb_build_object('id', v_active_id),
      'pending_stale', v_pending_stale,
      'pending_with_vrn', v_pending_with_vrn,
      'pending_missing_vrn', v_pending_missing_vrn
    );
  END IF;

  INSERT INTO public.insurance_renewal_rc_fetch_jobs (campaign_id, status, created_by, stats)
  VALUES (
    p_campaign_id,
    'queued',
    coalesce(v_email, v_uid::text),
    '{}'::jsonb
  )
  RETURNING id, status, created_at INTO v_job_id, v_job_status, v_job_created;

  BEGIN
    SELECT public.invoke_insurance_renewal_rc_fetch_worker() INTO v_kick;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', format(
      'Queued background RC fetch for %s new lead(s). Worker runs every ~2 minutes (or when Edge is healthy).',
      v_pending_with_vrn
    ),
    'job', jsonb_build_object('id', v_job_id, 'status', v_job_status, 'created_at', v_job_created),
    'pending_stale', v_pending_stale,
    'pending_with_vrn', v_pending_with_vrn,
    'pending_missing_vrn', v_pending_missing_vrn,
    'worker_kick_request_id', v_kick
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.insurance_renewal_rc_fetch_enqueue_admin(bigint) TO authenticated;
