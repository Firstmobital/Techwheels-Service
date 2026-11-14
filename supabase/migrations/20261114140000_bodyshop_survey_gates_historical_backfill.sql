-- Historical backfill: customer survey approval + manager verify for active bodyshop cards
-- created before the start of the current calendar month (Asia/Kolkata).
-- Run once so legacy pipeline cars are not blocked on manual app/manager steps.

DO $$
DECLARE
  v_cutoff timestamptz;
  v_now timestamptz := now();
  v_id bigint;
BEGIN
  v_cutoff := date_trunc(
    'month',
    (v_now AT TIME ZONE 'Asia/Kolkata')::timestamp
  ) AT TIME ZONE 'Asia/Kolkata';

  CREATE TEMP TABLE IF NOT EXISTS _bodyshop_survey_backfill_ids (id bigint PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _bodyshop_survey_backfill_ids;

  WITH touched AS (
  UPDATE public.bodyshop_repair_cards b
  SET
    customer_survey_approval_status = 'approved',
    customer_survey_rejection_reason = NULL,
    customer_survey_decided_at = COALESCE(
      b.customer_survey_decided_at,
      b.survay_info_updated_at,
      b.created_at,
      v_now
    ),
    doc_survey_approval = true,
    survey_status = CASE
      WHEN lower(btrim(COALESCE(b.survey_status, ''))) = 'hold' THEN b.survey_status
      WHEN lower(btrim(COALESCE(b.survey_status, ''))) IN ('approved', 'hold') THEN b.survey_status
      ELSE 'approved'
    END,
    survey_date = COALESCE(
      b.survey_date,
      ((COALESCE(b.survay_info_updated_at, b.created_at, v_now) AT TIME ZONE 'Asia/Kolkata')::date)
    ),
    bodyshop_survey_manager_verify_status = CASE
      WHEN b.bodyshop_floor IS NOT NULL AND btrim(COALESCE(b.bodyshop_floor, '')) <> '' THEN
        COALESCE(b.bodyshop_survey_manager_verify_status, 'verified')
      ELSE 'verified'
    END,
    bodyshop_survey_manager_verified_by = COALESCE(
      b.bodyshop_survey_manager_verified_by,
      'historical_backfill_survey_gates'
    ),
    bodyshop_survey_manager_verified_at = COALESCE(
      b.bodyshop_survey_manager_verified_at,
      b.survay_info_updated_at,
      b.created_at,
      v_now
    ),
    bodyshop_survey_manager_verify_remark = COALESCE(
      NULLIF(btrim(COALESCE(b.bodyshop_survey_manager_verify_remark, '')), ''),
      'Historical backfill through prior month (customer approve + manager verify).'
    ),
  updated_at = v_now
  WHERE b.overall_status = 'active'
    AND b.created_at < v_cutoff
    AND (
      lower(btrim(COALESCE(b.customer_survey_approval_status, ''))) <> 'approved'
      OR COALESCE(b.doc_survey_approval, false) = false
      OR (
        b.bodyshop_floor IS NULL
        AND lower(btrim(COALESCE(b.bodyshop_survey_manager_verify_status, ''))) <> 'verified'
      )
    )
  RETURNING b.id
  )
  INSERT INTO _bodyshop_survey_backfill_ids (id)
  SELECT id FROM touched;

  FOR v_id IN SELECT id FROM _bodyshop_survey_backfill_ids ORDER BY id LOOP
    PERFORM public.bodyshop_reconcile_repair_card_current_stage(v_id::integer);
  END LOOP;
END;
$$;