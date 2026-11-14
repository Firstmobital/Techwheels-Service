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
			OR NEW.doc_survey_approval IS DISTINCT FROM OLD.doc_survey_approval
			OR NEW.bodyshop_survey_manager_verify_status IS DISTINCT FROM OLD.bodyshop_survey_manager_verify_status THEN
			v_from := 9; v_to := 14; v_reason := 'survey_approval_or_manager_verify_change';

		ELSIF NEW.approved_parts IS DISTINCT FROM OLD.approved_parts THEN
			v_from := 10; v_to := 14; v_reason := 'approved_parts_change';

		ELSIF NEW.additional_approval IS DISTINCT FROM OLD.additional_approval THEN
			v_from := 11; v_to := 14; v_reason := 'additional_approval_change';

		ELSIF NEW.bodyshop_floor IS DISTINCT FROM OLD.bodyshop_floor
			OR NEW.floor_status IS DISTINCT FROM OLD.floor_status
			OR NEW.floor_hold_reason IS DISTINCT FROM OLD.floor_hold_reason
			OR NEW.qc_status IS DISTINCT FROM OLD.qc_status
			OR NEW.reinspection_status IS DISTINCT FROM OLD.reinspection_status THEN
			v_from := 9; v_to := 18; v_reason := 'floor_or_qc_change';
		END IF;
	END IF;

	PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(NEW.id, v_from, v_to, v_reason);
	PERFORM public.bodyshop_reconcile_repair_card_current_stage(NEW.id);
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_bodyshop_stage_worklist_projection_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_card_id integer;
  v_job_card text;
BEGIN
  v_card_id := COALESCE(NEW.repair_card_id, OLD.repair_card_id);
  v_job_card := upper(trim(COALESCE(NEW.job_card_number, OLD.job_card_number, '')));

  IF v_card_id IS NULL AND v_job_card <> '' THEN
    SELECT brc.id
    INTO v_card_id
    FROM public.bodyshop_repair_cards brc
    WHERE upper(trim(COALESCE(brc.job_card_no, ''))) = v_job_card
    ORDER BY brc.updated_at DESC, brc.created_at DESC
    LIMIT 1;
  END IF;

  IF v_card_id IS NOT NULL THEN
    PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(v_card_id, 11, 18, 'assignment_change');
    PERFORM public.bodyshop_reconcile_repair_card_current_stage(v_card_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bodyshop_stage_worklist_projection_card_change ON public.bodyshop_repair_cards;
CREATE TRIGGER trg_bodyshop_stage_worklist_projection_card_change
  AFTER INSERT OR UPDATE OF
    overall_status,
    current_stage,
    current_stage_name,
    customer_type,
    doc_claim_form,
    doc_rc,
    doc_insurance,
    doc_dl,
    doc_aadhaar,
    doc_pan,
    doc_kyc,
    doc_gst,
    doc_company_pan,
    doc_bank_detail,
    estimated_amount,
    estimation_approved_by,
    claim_intimation_no,
    survey_date,
    survey_status,
    survey_hold_reason,
    customer_survey_approval_status,
    customer_survey_rejection_reason,
    doc_survey_approval,
    bodyshop_survey_manager_verify_status,
    approved_parts,
    additional_approval,
    bodyshop_floor,
    floor_status,
    floor_hold_reason,
    qc_status,
    reinspection_status
  ON public.bodyshop_repair_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_bodyshop_stage_worklist_projection_card_change();

-- Backfill active cards stuck behind floor/QC/RI reality.
DO $$
DECLARE
  v_id integer;
  v_result jsonb;
BEGIN
  FOR v_id IN
    SELECT id FROM public.bodyshop_repair_cards WHERE overall_status = 'active'
  LOOP
    v_result := public.bodyshop_reconcile_repair_card_current_stage(v_id);
  END LOOP;
END;
$$;
