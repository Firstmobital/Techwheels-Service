-- Explain RC queue vs campaign size (assignments vs stale vs attempted).

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
