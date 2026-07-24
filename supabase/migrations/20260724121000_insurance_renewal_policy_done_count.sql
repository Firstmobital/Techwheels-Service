-- Campaign counter for policy_done disposition (UI: Policy Done)

ALTER TABLE public.insurance_renewal_campaigns
  ADD COLUMN IF NOT EXISTS policy_done_count integer DEFAULT 0;

COMMENT ON COLUMN public.insurance_renewal_campaigns.policy_done_count IS
  'Assignments with status policy_done (telecaller completed policy; legacy already_renewed_unknown).';

UPDATE public.insurance_renewal_campaigns c
SET policy_done_count = COALESCE(s.n, 0)
FROM (
  SELECT campaign_id, count(*) AS n
  FROM public.insurance_renewal_assignments
  WHERE status IN ('policy_done', 'already_renewed_unknown')
  GROUP BY campaign_id
) s
WHERE c.id = s.campaign_id;
