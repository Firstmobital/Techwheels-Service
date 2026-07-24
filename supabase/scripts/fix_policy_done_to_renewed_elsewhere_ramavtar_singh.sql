-- Correct two leads wrongly shown as Policy Done (were already renewed elsewhere).
-- VRNs: RJ45CX4656 (RAMAVTAR CHIPPA), RJ45CM5200 (SINGH SINGH)
-- Run in Supabase SQL Editor, then verify Policy Done tab / campaign tiles.

BEGIN;

WITH targets AS (
  SELECT a.id AS assignment_id, a.campaign_id, a.status AS old_status
  FROM public.insurance_renewal_assignments a
  JOIN public.all_service_data s ON s.id = a.customer_id
  WHERE upper(replace(coalesce(s.vehicle_registration_number, ''), ' ', '')) IN ('RJ45CX4656', 'RJ45CM5200')
    AND a.status IN ('policy_done', 'already_renewed_unknown')
)
UPDATE public.insurance_renewal_assignments a
SET
  status = 'renewed_elsewhere',
  updated_at = now(),
  call_notes = coalesce(a.call_notes, '') || CASE
    WHEN coalesce(a.call_notes, '') = '' THEN 'Corrected: already renewed elsewhere (not Policy Done).'
    ELSE E'\nCorrected: already renewed elsewhere (not Policy Done).'
  END
FROM targets t
WHERE a.id = t.assignment_id;

-- Recalculate campaign counters for affected campaign(s)
WITH affected AS (
  SELECT DISTINCT a.campaign_id
  FROM public.insurance_renewal_assignments a
  JOIN public.all_service_data s ON s.id = a.customer_id
  WHERE upper(replace(coalesce(s.vehicle_registration_number, ''), ' ', '')) IN ('RJ45CX4656', 'RJ45CM5200')
)
UPDATE public.insurance_renewal_campaigns c
SET
  pending_count = s.pending_count,
  in_progress_count = s.in_progress_count,
  callback_later_count = s.callback_later_count,
  quote_needed_count = s.quote_needed_count,
  policy_requested_count = s.policy_requested_count,
  quote_sent_count = s.quote_sent_count,
  renewed_count = s.renewed_count,
  policy_done_count = s.policy_done_count,
  completed_count = s.completed_count,
  out_of_window_count = s.out_of_window_count,
  total_leads = s.total_leads,
  updated_at = now()
FROM (
  SELECT
    campaign_id,
    count(*) AS total_leads,
    count(*) FILTER (WHERE status = 'pending') AS pending_count,
    count(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
    count(*) FILTER (WHERE status = 'callback_later') AS callback_later_count,
    count(*) FILTER (WHERE status = 'quote_needed') AS quote_needed_count,
    count(*) FILTER (WHERE status = 'policy_requested') AS policy_requested_count,
    count(*) FILTER (WHERE status = 'quote_sent') AS quote_sent_count,
    count(*) FILTER (WHERE status = 'renewed_via_us') AS renewed_count,
    count(*) FILTER (WHERE status IN ('policy_done', 'already_renewed_unknown')) AS policy_done_count,
    count(*) FILTER (WHERE status IN (
      'renewed_via_us', 'renewed_elsewhere', 'not_interested', 'wrong_number',
      'not_reachable', 'policy_done', 'already_renewed_unknown'
    )) AS completed_count,
    count(*) FILTER (WHERE status = 'out_of_window') AS out_of_window_count
  FROM public.insurance_renewal_assignments
  GROUP BY campaign_id
) s
JOIN affected af ON af.campaign_id = s.campaign_id
WHERE c.id = s.campaign_id;

-- Verify
SELECT
  s.vehicle_registration_number,
  s.first_name,
  s.last_name,
  a.status,
  a.assigned_to_name,
  a.updated_at
FROM public.insurance_renewal_assignments a
JOIN public.all_service_data s ON s.id = a.customer_id
WHERE upper(replace(coalesce(s.vehicle_registration_number, ''), ' ', '')) IN ('RJ45CX4656', 'RJ45CM5200');

COMMIT;
