-- Admin RC fetch panel: read job + pending counts via PostgREST (avoids Edge polling/CORS when gateway is sick).

CREATE OR REPLACE FUNCTION public.insurance_renewal_rc_fetch_campaign_status(p_campaign_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_pending_stale bigint;
  v_pending_with_vrn bigint;
  v_pending_missing_vrn bigint;
  v_active_job jsonb;
  v_last_job jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_uid;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT p.pending_stale, p.pending_with_vrn, p.pending_missing_vrn
  INTO v_pending_stale, v_pending_with_vrn, v_pending_missing_vrn
  FROM public.insurance_renewal_rc_fetch_pending_counts(p_campaign_id) p;

  SELECT to_jsonb(j) INTO v_active_job
  FROM public.insurance_renewal_rc_fetch_jobs j
  WHERE j.campaign_id = p_campaign_id
    AND j.status IN ('queued', 'running')
  ORDER BY j.created_at DESC
  LIMIT 1;

  SELECT to_jsonb(j) INTO v_last_job
  FROM public.insurance_renewal_rc_fetch_jobs j
  WHERE j.campaign_id = p_campaign_id
    AND j.status IN ('completed', 'failed', 'cancelled')
  ORDER BY j.completed_at DESC NULLS LAST
  LIMIT 1;

  RETURN jsonb_build_object(
    'pending_stale', coalesce(v_pending_stale, 0),
    'pending_with_vrn', coalesce(v_pending_with_vrn, 0),
    'pending_missing_vrn', coalesce(v_pending_missing_vrn, 0),
    'stale_cutoff_before', (CURRENT_DATE - 365),
    'fetch_enabled', (coalesce(v_pending_with_vrn, 0) > 0 AND v_active_job IS NULL),
    'active_job', v_active_job,
    'last_job', v_last_job
  );
END;
$$;

COMMENT ON FUNCTION public.insurance_renewal_rc_fetch_campaign_status(bigint) IS
  'Admin-only RC fetch UI status (pending counts + active/last job) without Edge.';

GRANT EXECUTE ON FUNCTION public.insurance_renewal_rc_fetch_campaign_status(bigint) TO authenticated;
