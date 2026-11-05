-- Customer survey approval must advance the workshop stage pointer and refresh stage 9–12 projection.
-- Root cause: customer_set_survey_approval_decision only flipped approval columns; current_stage
-- moved 9→10 only via Send To Floor, so the 18-stage tracker stayed on Survey after VO approval.

CREATE OR REPLACE FUNCTION public.bodyshop_card_survey_approval_evidence_ok(p_card public.bodyshop_repair_cards)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(p_card.doc_survey_approval, false)
    OR lower(btrim(COALESCE(p_card.customer_survey_approval_status, ''))) = 'approved'
    OR (
      lower(btrim(COALESCE(p_card.customer_survey_approval_status, ''))) NOT IN ('pending', 'rejected')
      AND EXISTS (
        SELECT 1
        FROM public.bodyshop_repair_card_documents d
        WHERE d.repair_card_id = p_card.id
          AND d.doc_key = 'doc_survey_approval'
      )
    )
    OR COALESCE(p_card.current_stage, 1) >= 10;
$$;

CREATE OR REPLACE FUNCTION public.bodyshop_should_advance_stage_after_survey_customer_approve(
  p_card public.bodyshop_repair_cards
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(p_card.current_stage, 1) <= 9
    AND lower(btrim(COALESCE(p_card.bodyshop_floor, ''))) IN ('floor 2', 'floor 3')
    AND p_card.survey_date IS NOT NULL
    AND lower(btrim(COALESCE(p_card.survey_status, ''))) IN ('hold', 'approved')
    AND (
      lower(btrim(COALESCE(p_card.survey_status, ''))) <> 'hold'
      OR btrim(COALESCE(p_card.survey_hold_reason, '')) <> ''
    );
$$;

CREATE OR REPLACE FUNCTION public.customer_set_survey_approval_decision(
  p_session_token text,
  p_reg_number text,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
SET row_security TO off
AS $$
DECLARE
  v_sess record;
  v_reg text;
  v_regs text[];
  v_card public.bodyshop_repair_cards%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_has_doc boolean := false;
  v_now timestamptz := now();
  v_advance_stage boolean := false;
BEGIN
  SELECT * INTO v_sess FROM public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  IF v_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject';
  END IF;

  IF v_decision = 'reject' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  SELECT b.*
  INTO v_card
  FROM public.bodyshop_repair_cards b
  WHERE public.customer_norm_reg(b.reg_number) = ANY (v_regs)
    AND public.customer_norm_reg(b.reg_number) = v_reg
    AND b.overall_status = 'active'
  ORDER BY b.updated_at DESC, b.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active repair card not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.bodyshop_repair_card_documents d
    WHERE d.repair_card_id = v_card.id
      AND d.doc_key = 'doc_survey_approval'
  ) INTO v_has_doc;

  IF NOT v_has_doc THEN
    RAISE EXCEPTION 'Survey approval document is not available yet';
  END IF;

  IF coalesce(v_card.customer_survey_approval_status, 'pending') NOT IN ('pending', 'rejected') THEN
    IF v_decision = 'approve' AND v_card.customer_survey_approval_status = 'approved' THEN
      RETURN jsonb_build_object('ok', true, 'status', 'approved', 'already', true);
    END IF;
    IF v_card.customer_survey_approval_status = 'approved' AND v_decision = 'reject' THEN
      RAISE EXCEPTION 'Survey approval is already accepted';
    END IF;
  END IF;

  IF v_decision = 'approve' THEN
    v_advance_stage := public.bodyshop_should_advance_stage_after_survey_customer_approve(v_card);

    UPDATE public.bodyshop_repair_cards
    SET
      customer_survey_approval_status = 'approved',
      customer_survey_rejection_reason = NULL,
      customer_survey_decided_at = v_now,
      doc_survey_approval = true,
      updated_at = v_now,
      current_stage = CASE
        WHEN v_advance_stage THEN GREATEST(COALESCE(current_stage, 1), 10)
        ELSE current_stage
      END,
      current_stage_name = CASE
        WHEN v_advance_stage THEN public.customer_bodyshop_stage_label(10)
        ELSE current_stage_name
      END
    WHERE id = v_card.id;
  ELSE
    UPDATE public.bodyshop_repair_cards
    SET
      customer_survey_approval_status = 'rejected',
      customer_survey_rejection_reason = v_reason,
      customer_survey_decided_at = v_now,
      doc_survey_approval = false,
      updated_at = v_now
    WHERE id = v_card.id;
  END IF;

  PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(
    v_card.id,
    9,
    12,
    'customer_survey_approval'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', CASE WHEN v_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
    'reason', CASE WHEN v_decision = 'reject' THEN v_reason ELSE NULL END,
    'advanced_to_stage', CASE WHEN v_decision = 'approve' AND v_advance_stage THEN 10 ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_bodyshop_stage_worklist_projection_card_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	v_from integer := 1;
	v_to integer := 18;
	v_reason text := 'fallback_full_recompute';
BEGIN
	IF TG_OP = 'INSERT' THEN
		v_from := 1;
		v_to := 18;
		v_reason := 'card_insert';
	ELSE
		IF NEW.overall_status IS DISTINCT FROM OLD.overall_status
			OR NEW.current_stage IS DISTINCT FROM OLD.current_stage
			OR NEW.current_stage_name IS DISTINCT FROM OLD.current_stage_name THEN
			v_from := 1; v_to := 18; v_reason := 'card_status_or_pointer_change';

		ELSIF NEW.customer_type IS DISTINCT FROM OLD.customer_type
			OR NEW.doc_claim_form IS DISTINCT FROM OLD.doc_claim_form
			OR NEW.doc_rc IS DISTINCT FROM OLD.doc_rc
			OR NEW.doc_insurance IS DISTINCT FROM OLD.doc_insurance
			OR NEW.doc_dl IS DISTINCT FROM OLD.doc_dl
			OR NEW.doc_aadhaar IS DISTINCT FROM OLD.doc_aadhaar
			OR NEW.doc_pan IS DISTINCT FROM OLD.doc_pan
			OR NEW.doc_kyc IS DISTINCT FROM OLD.doc_kyc
			OR NEW.doc_gst IS DISTINCT FROM OLD.doc_gst
			OR NEW.doc_company_pan IS DISTINCT FROM OLD.doc_company_pan
			OR NEW.doc_bank_detail IS DISTINCT FROM OLD.doc_bank_detail THEN
			v_from := 5; v_to := 12; v_reason := 'customer_type_or_docs_change';

		ELSIF NEW.estimated_amount IS DISTINCT FROM OLD.estimated_amount THEN
			v_from := 6; v_to := 12; v_reason := 'estimated_amount_change';

		ELSIF NEW.estimation_approved_by IS DISTINCT FROM OLD.estimation_approved_by THEN
			v_from := 7; v_to := 12; v_reason := 'estimation_approved_by_change';

		ELSIF NEW.claim_intimation_no IS DISTINCT FROM OLD.claim_intimation_no THEN
			v_from := 8; v_to := 12; v_reason := 'claim_intimation_change';

		ELSIF NEW.survey_date IS DISTINCT FROM OLD.survey_date
			OR NEW.survey_status IS DISTINCT FROM OLD.survey_status
			OR NEW.survey_hold_reason IS DISTINCT FROM OLD.survey_hold_reason THEN
			v_from := 9; v_to := 12; v_reason := 'survey_fields_change';

		ELSIF NEW.customer_survey_approval_status IS DISTINCT FROM OLD.customer_survey_approval_status
			OR NEW.customer_survey_rejection_reason IS DISTINCT FROM OLD.customer_survey_rejection_reason
			OR NEW.doc_survey_approval IS DISTINCT FROM OLD.doc_survey_approval THEN
			v_from := 9; v_to := 12; v_reason := 'customer_survey_approval_change';

		ELSIF NEW.approved_parts IS DISTINCT FROM OLD.approved_parts THEN
			v_from := 10; v_to := 12; v_reason := 'approved_parts_change';

		ELSIF NEW.additional_approval IS DISTINCT FROM OLD.additional_approval THEN
			v_from := 11; v_to := 12; v_reason := 'additional_approval_change';

		ELSIF NEW.bodyshop_floor IS DISTINCT FROM OLD.bodyshop_floor
			OR NEW.floor_status IS DISTINCT FROM OLD.floor_status
			OR NEW.floor_hold_reason IS DISTINCT FROM OLD.floor_hold_reason THEN
			v_from := 9; v_to := 12; v_reason := 'floor_assignment_change';
		END IF;
	END IF;

	PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(NEW.id, v_from, v_to, v_reason);
	RETURN NEW;
END;
$$;

-- Backfill: customer already approved + floor assigned but pointer still on Survey (9).
UPDATE public.bodyshop_repair_cards b
SET
  current_stage = 10,
  current_stage_name = public.customer_bodyshop_stage_label(10),
  updated_at = now()
WHERE b.overall_status = 'active'
  AND lower(btrim(COALESCE(b.customer_survey_approval_status, ''))) = 'approved'
  AND COALESCE(b.current_stage, 1) <= 9
  AND public.bodyshop_should_advance_stage_after_survey_customer_approve(b);

-- Refresh projection for affected cards (stage 9–12 rules include customer evidence).
DO $$
DECLARE
  v_id integer;
BEGIN
  FOR v_id IN
    SELECT b.id
    FROM public.bodyshop_repair_cards b
    WHERE b.overall_status = 'active'
      AND (
        lower(btrim(COALESCE(b.customer_survey_approval_status, ''))) IN ('approved', 'rejected', 'pending')
        OR COALESCE(b.doc_survey_approval, false)
      )
  LOOP
    PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(v_id, 9, 12, 'customer_survey_approval_reconcile');
  END LOOP;
END;
$$;
