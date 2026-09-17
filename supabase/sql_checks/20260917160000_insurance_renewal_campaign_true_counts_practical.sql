-- Practical: a truncated total_leads=10000 write must not persist.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Restores nothing extra: the trigger writes the true COUNT(*) which is the desired state.

CREATE TEMP TABLE _dbl0077_probe (
  step text PRIMARY KEY,
  ok boolean,
  detail jsonb
);

DO $$
DECLARE
  v_id bigint;
  v_true bigint;
  v_after integer;
BEGIN
  SELECT c.id
    INTO v_id
  FROM public.insurance_renewal_campaigns c
  WHERE c.status = 'active'
    AND c.campaign_name ILIKE '%Expiring 30 Days%'
  ORDER BY c.id
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'DBL-0077 practical: no active Expiring 30 Days campaign';
  END IF;

  SELECT count(*) INTO v_true
  FROM public.insurance_renewal_assignments
  WHERE campaign_id = v_id;

  UPDATE public.insurance_renewal_campaigns
  SET total_leads = 10000, pending_count = 1
  WHERE id = v_id
  RETURNING total_leads INTO v_after;

  INSERT INTO _dbl0077_probe VALUES (
    'trigger_blocks_10000_cap',
    v_after = v_true::integer,
    jsonb_build_object(
      'campaign_id', v_id,
      'true_count', v_true,
      'after_fake_10000_write', v_after
    )
  );

  INSERT INTO _dbl0077_probe
  SELECT
    'rpc_recount_matches_count',
    (public.insurance_renewal_recount_campaign(v_id)->>'total_leads')::int = v_true::integer,
    public.insurance_renewal_recount_campaign(v_id);
END $$;

SELECT step, ok, detail FROM _dbl0077_probe ORDER BY step;

SELECT bool_and(ok) AS all_ok FROM _dbl0077_probe;
