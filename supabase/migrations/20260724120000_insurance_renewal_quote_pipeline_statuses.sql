-- Quote pipeline statuses on insurance renewal assignments (quote_needed, policy_requested, quote_sent)

ALTER TABLE public.insurance_renewal_campaigns
  ADD COLUMN IF NOT EXISTS quote_needed_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS policy_requested_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_sent_count integer DEFAULT 0;

COMMENT ON COLUMN public.insurance_renewal_campaigns.quote_needed_count IS
  'Assignments with status quote_needed (customer wants quotation).';
COMMENT ON COLUMN public.insurance_renewal_campaigns.policy_requested_count IS
  'Assignments with status policy_requested (waiting on customer old policy).';
COMMENT ON COLUMN public.insurance_renewal_campaigns.quote_sent_count IS
  'Assignments with status quote_sent (quote shared; follow up for decision).';

-- Backfill campaign counters from current assignments
UPDATE public.insurance_renewal_campaigns c
SET
  quote_needed_count = COALESCE(s.quote_needed_count, 0),
  policy_requested_count = COALESCE(s.policy_requested_count, 0),
  quote_sent_count = COALESCE(s.quote_sent_count, 0)
FROM (
  SELECT
    campaign_id,
    count(*) FILTER (WHERE status = 'quote_needed') AS quote_needed_count,
    count(*) FILTER (WHERE status = 'policy_requested') AS policy_requested_count,
    count(*) FILTER (WHERE status = 'quote_sent') AS quote_sent_count
  FROM public.insurance_renewal_assignments
  GROUP BY campaign_id
) s
WHERE c.id = s.campaign_id;
