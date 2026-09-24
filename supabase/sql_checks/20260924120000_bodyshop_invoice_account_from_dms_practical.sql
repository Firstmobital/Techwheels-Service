-- Practical verification for DMS bill-to copy into invoice_account.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Updates, if any, are rolled back.

BEGIN;

DO $$
DECLARE
  v_id bigint;
  v_jc text;
  v_policy text;
  v_account text;
  v_filled text;
  v_policy_after text;
  v_blank text;
BEGIN
  SELECT s.id, s.job_card_no, c.insurance_company, latest.account
    INTO v_id, v_jc, v_policy, v_account
  FROM public.bodyshop_settlements s
  JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
  JOIN LATERAL (
    SELECT NULLIF(btrim(p.account), '') AS account
      FROM public.psf_revenue_dms p
     WHERE upper(btrim(p.job_card_number)) = upper(btrim(s.job_card_no))
       AND COALESCE(p.invoice_status, '') <> 'Cancelled'
     ORDER BY p.invoice_date DESC NULLS LAST, p.updated_at DESC NULLS LAST
     LIMIT 1
  ) latest ON latest.account IS NOT NULL
  ORDER BY s.id
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no settlement with a live DMS account to probe';
  END IF;

  UPDATE public.bodyshop_settlements
     SET invoice_account = NULL
   WHERE id = v_id;

  PERFORM public.sync_bodyshop_invoice_account_from_dms(ARRAY[v_jc]);

  SELECT s.invoice_account, c.insurance_company
    INTO v_filled, v_policy_after
  FROM public.bodyshop_settlements s
  JOIN public.bodyshop_repair_cards c ON c.id = s.repair_card_id
  WHERE s.id = v_id;

  IF v_filled IS DISTINCT FROM v_account THEN
    RAISE EXCEPTION 'expected invoice_account %, got %', v_account, v_filled;
  END IF;

  IF v_policy_after IS DISTINCT FROM v_policy THEN
    RAISE EXCEPTION 'insurance_company changed from % to %', v_policy, v_policy_after;
  END IF;

  -- A stored bill-to is left alone.
  UPDATE public.bodyshop_settlements
     SET invoice_account = 'KEEP ME'
   WHERE id = v_id;

  PERFORM public.sync_bodyshop_invoice_account_from_dms(ARRAY[v_jc]);

  SELECT invoice_account INTO v_filled
    FROM public.bodyshop_settlements
   WHERE id = v_id;

  IF v_filled IS DISTINCT FROM 'KEEP ME' THEN
    RAISE EXCEPTION 'sync overwrote a stored bill-to: %', v_filled;
  END IF;

  -- Customer name columns are not the bill-to.
  UPDATE public.psf_revenue_dms p
     SET account = NULL
   WHERE upper(btrim(p.job_card_number)) = upper(btrim(v_jc));

  UPDATE public.bodyshop_settlements
     SET invoice_account = NULL
   WHERE id = v_id;

  PERFORM public.sync_bodyshop_invoice_account_from_dms(ARRAY[v_jc]);

  SELECT invoice_account INTO v_blank
    FROM public.bodyshop_settlements
   WHERE id = v_id;

  IF v_blank IS NOT NULL THEN
    RAISE EXCEPTION 'sync filled a bill-to with no DMS account: %', v_blank;
  END IF;

  RAISE NOTICE 'practical ok jc=% account=% policy_unchanged=%', v_jc, v_account, v_policy IS NOT DISTINCT FROM v_policy_after;
END
$$;

ROLLBACK;
