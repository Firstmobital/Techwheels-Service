CREATE OR REPLACE FUNCTION public.bodyshop_reconcile_repair_card_current_stage(p_repair_card_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
SET row_security TO off
AS $$
DECLARE
  v_card public.bodyshop_repair_cards%ROWTYPE;
  v_prev integer;
  v_min integer;
  v_new integer;
  v_survey_status text;
  v_survey_hold_reason text;
  v_floor_assigned boolean;
  v_manager_ok boolean;
  v_survey_approved boolean;
  v_survey_evidence boolean;
  v_approved_parts_finalized boolean := false;
  v_stage9_done boolean;
  v_stage10_done boolean;
  v_floor_completed boolean := false;
  v_has_open_assignment boolean := false;
  v_has_any_assignment boolean := false;
  v_additional_status text := 'none';
  v_additional_part_count integer := 0;
  v_additional_pending integer := 0;
  v_additional_requested boolean := false;
  v_stage12_done boolean := false;
  v_qc text;
  v_ri text;
  v_jc text;
BEGIN
  SELECT * INTO v_card FROM public.bodyshop_repair_cards WHERE id = p_repair_card_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'repair_card_not_found');
  END IF;

  IF lower(btrim(COALESCE(v_card.overall_status, 'active'))) <> 'active' THEN
    RETURN jsonb_build_object('ok', true, 'advanced', false, 'current_stage', v_card.current_stage);
  END IF;

  v_prev := GREATEST(1, LEAST(18, COALESCE(v_card.current_stage, 1)));
  v_min := v_prev;

  IF COALESCE(v_card.estimated_amount, 0) > 0 THEN
    v_min := GREATEST(v_min, 6);
  END IF;
  IF btrim(COALESCE(v_card.estimation_approved_by, '')) <> '' THEN
    v_min := GREATEST(v_min, 7);
  END IF;
  IF btrim(COALESCE(v_card.claim_intimation_no, '')) <> '' THEN
    v_min := GREATEST(v_min, 8);
  END IF;

  v_survey_status := lower(btrim(COALESCE(v_card.survey_status, '')));
  v_survey_hold_reason := btrim(COALESCE(v_card.survey_hold_reason, ''));
  v_floor_assigned := lower(btrim(COALESCE(v_card.bodyshop_floor, ''))) IN ('floor 2', 'floor 3');
  v_manager_ok :=
    lower(btrim(COALESCE(v_card.bodyshop_survey_manager_verify_status, ''))) = 'verified'
    OR v_floor_assigned;
  v_survey_approved := (v_survey_status = 'approved');
  v_survey_evidence :=
    COALESCE(v_card.doc_survey_approval, false)
    OR lower(btrim(COALESCE(v_card.customer_survey_approval_status, ''))) = 'approved'
    OR EXISTS (
      SELECT 1 FROM public.bodyshop_repair_card_documents d
      WHERE d.repair_card_id = v_card.id AND d.doc_key = 'doc_survey_approval'
    )
    OR v_prev >= 10;

  BEGIN
    IF btrim(COALESCE(v_card.approved_parts, '')) <> '' THEN
      v_approved_parts_finalized := (btrim(COALESCE((v_card.approved_parts::jsonb)->>'finalized_at', '')) <> '');
    END IF;
  EXCEPTION WHEN others THEN
    v_approved_parts_finalized := false;
  END;

  v_stage9_done :=
    v_card.survey_date IS NOT NULL
    AND v_survey_status IN ('hold', 'approved')
    AND (v_survey_status <> 'hold' OR v_survey_hold_reason <> '')
    AND v_manager_ok
    AND v_floor_assigned;

  v_stage10_done := v_survey_approved AND v_survey_evidence AND v_approved_parts_finalized;

  IF v_stage9_done THEN
    v_min := GREATEST(v_min, 10);
  END IF;

  v_jc := upper(btrim(COALESCE(v_card.job_card_no, '')));

  SELECT
    EXISTS (
      SELECT 1
      FROM public.bodyshop_assignments ba
      WHERE ba.is_active = true
        AND ba.bs_floor_completed_at IS NULL
        AND (
          ba.repair_card_id = v_card.id
          OR (v_jc <> '' AND upper(btrim(ba.job_card_number)) = v_jc)
        )
    ),
    EXISTS (
      SELECT 1
      FROM public.bodyshop_assignments ba
      WHERE ba.is_active = true
        AND (
          ba.repair_card_id = v_card.id
          OR (v_jc <> '' AND upper(btrim(ba.job_card_number)) = v_jc)
        )
    )
  INTO v_has_open_assignment, v_has_any_assignment;

  IF v_stage10_done AND (v_floor_assigned OR v_has_open_assignment OR v_has_any_assignment) THEN
    v_min := GREATEST(v_min, 11);
  END IF;

  v_floor_completed :=
    lower(btrim(COALESCE(v_card.floor_status, ''))) = 'completed'
    OR EXISTS (
      SELECT 1
      FROM public.bodyshop_assignments ba
      WHERE ba.is_active = true
        AND ba.bs_floor_completed_at IS NOT NULL
        AND (
          ba.repair_card_id = v_card.id
          OR (v_jc <> '' AND upper(btrim(ba.job_card_number)) = v_jc)
        )
    );

  IF btrim(COALESCE(v_card.additional_approval, '')) <> '' THEN
    BEGIN
      v_additional_status := lower(btrim(COALESCE((v_card.additional_approval::jsonb) #>> '{decision,status}', 'pending')));
      IF jsonb_typeof((v_card.additional_approval::jsonb) #> '{decision,parts}') = 'array' THEN
        v_additional_part_count := jsonb_array_length((v_card.additional_approval::jsonb) #> '{decision,parts}');
      ELSIF jsonb_typeof((v_card.additional_approval::jsonb) #> '{request,parts}') = 'array' THEN
        v_additional_part_count := jsonb_array_length((v_card.additional_approval::jsonb) #> '{request,parts}');
      END IF;
      IF v_additional_part_count = 0 AND (
        btrim(COALESCE((v_card.additional_approval::jsonb) #>> '{request,part_no}', '')) <> ''
        OR btrim(COALESCE((v_card.additional_approval::jsonb) #>> '{request,part_description}', '')) <> ''
      ) THEN
        v_additional_part_count := 1;
      END IF;
      IF v_additional_part_count > 0 AND jsonb_typeof((v_card.additional_approval::jsonb) #> '{decision,parts}') = 'array' THEN
        SELECT count(*)::int INTO v_additional_pending
        FROM jsonb_array_elements((v_card.additional_approval::jsonb) #> '{decision,parts}') elem
        WHERE lower(btrim(COALESCE(elem->>'status', v_additional_status))) = 'pending';
      ELSIF v_additional_part_count > 0 AND v_additional_status = 'pending' THEN
        v_additional_pending := v_additional_part_count;
      END IF;
      IF v_additional_status NOT IN ('none', '') OR v_additional_part_count > 0 THEN
        v_additional_requested := true;
      END IF;
      v_stage12_done :=
        (v_additional_part_count > 0 AND v_additional_pending = 0)
        OR (v_additional_part_count = 0 AND v_additional_status IN ('approved', 'rejected'))
        OR v_prev > 12;
    EXCEPTION WHEN others THEN
      v_additional_requested := true;
      v_additional_status := 'pending';
      v_additional_part_count := 1;
      v_additional_pending := 1;
    END;
  END IF;

  IF v_floor_completed THEN
    IF v_additional_requested AND NOT v_stage12_done THEN
      v_min := GREATEST(v_min, 12);
    ELSE
      v_min := GREATEST(v_min, 13);
    END IF;
  END IF;

  v_qc := lower(btrim(COALESCE(v_card.qc_status, '')));
  v_ri := lower(btrim(COALESCE(v_card.reinspection_status, '')));
  IF v_floor_completed THEN
    IF v_qc = 'pass' THEN
      IF v_ri = 'completed' THEN
        v_min := GREATEST(v_min, 15);
      ELSE
        v_min := GREATEST(v_min, 14);
      END IF;
    END IF;
  END IF;

  v_new := GREATEST(v_prev, LEAST(18, v_min));

  IF v_new = v_prev THEN
    RETURN jsonb_build_object(
      'ok', true,
      'advanced', false,
      'previous_stage', v_prev,
      'current_stage', v_prev
    );
  END IF;

  UPDATE public.bodyshop_repair_cards
  SET
    current_stage = v_new,
    current_stage_name = public.customer_bodyshop_stage_label(v_new),
    updated_at = now()
  WHERE id = v_card.id;

  PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(v_card.id, 1, 18, 'stage_pointer_reconcile');

  RETURN jsonb_build_object(
    'ok', true,
    'advanced', true,
    'previous_stage', v_prev,
    'current_stage', v_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bodyshop_reconcile_repair_card_current_stage(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bodyshop_reconcile_repair_card_current_stage(integer) TO anon, authenticated, service_role;
