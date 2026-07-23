-- Stop RC fetch from admin UI without Edge (matches apply_insurance_rc_fetch_ui_rpcs.sql).

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
