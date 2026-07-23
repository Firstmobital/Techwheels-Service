-- Run once in Supabase SQL Editor (prod) if RPC 404 / PGRST202 from the admin RC panel.
-- Requires: insurance_renewal_rc_fetch_jobs + insurance_renewal_rc_fetch_pending_counts (20260722193000).

CREATE OR REPLACE FUNCTION public.insurance_renewal_rc_fetch_diagnostics(p_campaign_id bigint)
RETURNS TABLE (
  assignment_total bigint,
  stale_in_campaign bigint,
  attempted_total bigint,
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
    (SELECT count(*)::bigint FROM insurance_renewal_assignments ra WHERE ra.campaign_id = p_campaign_id),
    (SELECT count(*)::bigint
     FROM insurance_renewal_assignments ra
     JOIN all_service_data s ON s.id = ra.customer_id
     WHERE ra.campaign_id = p_campaign_id
       AND (
         s.last_insurance_expiry_date IS NULL
         OR s.last_insurance_expiry_date < (CURRENT_DATE - 365)
       )),
    (SELECT count(*)::bigint FROM insurance_renewal_rc_fetch_attempts a WHERE a.campaign_id = p_campaign_id),
    p.pending_stale,
    p.pending_with_vrn,
    p.pending_missing_vrn
  FROM insurance_renewal_rc_fetch_pending_counts(p_campaign_id) p;
$$;

GRANT EXECUTE ON FUNCTION public.insurance_renewal_rc_fetch_diagnostics(bigint) TO authenticated, service_role;

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

GRANT EXECUTE ON FUNCTION public.insurance_renewal_rc_fetch_campaign_status(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.insurance_renewal_rc_fetch_cancel_admin(
  p_campaign_id bigint DEFAULT NULL,
  p_job_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_cancelled jsonb;
  v_n int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_campaign_id IS NULL AND p_job_id IS NULL THEN
    RAISE EXCEPTION 'Missing campaign_id or job_id';
  END IF;

  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_uid;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  WITH u AS (
    UPDATE public.insurance_renewal_rc_fetch_jobs j
    SET status = 'cancelled',
        completed_at = now(),
        updated_at = now(),
        last_error = 'Cancelled by admin'
    WHERE j.status IN ('queued', 'running')
      AND (p_job_id IS NULL OR j.id = p_job_id)
      AND (p_campaign_id IS NULL OR j.campaign_id = p_campaign_id)
    RETURNING j.id, j.campaign_id, j.status
  )
  SELECT coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb), count(*)::int
  INTO v_cancelled, v_n
  FROM u;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN v_n > 0
      THEN format('Stopped %s RC fetch job(s). No further paid API calls for those jobs.', v_n)
      ELSE 'No queued or running RC fetch job to stop.'
    END,
    'cancelled', v_cancelled
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.insurance_renewal_rc_fetch_cancel_admin(bigint, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
