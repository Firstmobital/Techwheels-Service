-- Admin waiver: close stages 1-14 in worklist projection when billing is done (historical / DMS-import cards).
-- Plan: BODYSHOP-STAGE-002 follow-on. Allowed caller: admin@firstmobital.com (enforced in RPC).

ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS pre_billing_stages_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS pre_billing_stages_waived_by text;

COMMENT ON COLUMN public.bodyshop_repair_cards.pre_billing_stages_waived_at IS
  'Admin waiver: stages 1-14 marked done in worklist projection; does not forge survey/floor data.';
COMMENT ON COLUMN public.bodyshop_repair_cards.pre_billing_stages_waived_by IS
  'Email of admin who applied pre-billing stage waiver.';

CREATE OR REPLACE FUNCTION public.recompute_bodyshop_stage_worklist_projection_for_card(p_repair_card_id integer, p_stage_from integer DEFAULT 1, p_stage_to integer DEFAULT 18, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
	v_card public.bodyshop_repair_cards%ROWTYPE;
	v_stage integer;
	v_rule_version text;
	v_is_active boolean;
	v_effective_current_stage integer;
	v_customer_type text;
	v_no_docs_required boolean;
	v_stage1_done boolean;
	v_stage2_done boolean;
	v_stage3_done boolean;
	v_stage4_done boolean;
	v_stage5_done boolean;
	v_stage6_done boolean;
	v_stage7_done boolean;
	v_stage8_done boolean;
	v_survey_status text;
	v_survey_hold_reason text;
	v_survey_approved boolean;
	v_survey_approval_evidence boolean;
	v_floor_assigned boolean;
	v_floor_completed boolean;
	v_stage9_done boolean;
	v_stage10_done boolean;
	v_stage11_done boolean;
	v_stage12_done boolean;
	v_stage10_ready boolean;
	v_stage11_ready boolean;
	v_approved_parts_finalized boolean := false;
	v_approved_parts_payload jsonb;
	v_additional_approval_text text;
	v_additional_approval_payload jsonb;
	v_additional_parse_ok boolean := false;
	v_additional_status text := 'none';
	v_additional_requested boolean := false;
	v_additional_part_states_count integer := 0;
	v_additional_pending_count integer := 0;
	v_additional_approved_count integer := 0;
	v_additional_rejected_count integer := 0;
	v_decision_parts jsonb := '[]'::jsonb;
	v_legacy_decision_status text := 'pending';
	v_request_parts_count integer := 0;
	v_request_fallback_present boolean := false;
	v_idx integer;
	v_part_status text;
	v_done boolean;
	v_pending boolean;
	v_ready boolean;
	v_reason_codes text[];
	v_pre_billing_waived boolean;
BEGIN
	SELECT * INTO v_card
	FROM public.bodyshop_repair_cards
	WHERE id = p_repair_card_id;

	IF NOT FOUND THEN
		DELETE FROM public.bodyshop_stage_worklist_projection
		WHERE repair_card_id = p_repair_card_id;
		RETURN;
	END IF;

	SELECT rule_version INTO v_rule_version
	FROM public.bodyshop_stage_rule_versions
	WHERE is_active = true
	ORDER BY created_at DESC
	LIMIT 1;

	IF v_rule_version IS NULL THEN
		v_rule_version := 'BODYSHOP-QUEUE-RULES-v1';
	END IF;

	v_is_active := (COALESCE(v_card.overall_status, 'active') = 'active');
	v_pre_billing_waived := (
		v_card.pre_billing_stages_waived_at IS NOT NULL
		AND COALESCE(v_card.billed_amount, 0) > 0
	);
	v_effective_current_stage := COALESCE(v_card.current_stage, 1);
	v_customer_type := lower(btrim(COALESCE(v_card.customer_type, '')));
	v_no_docs_required := v_customer_type IN ('cash', 'foc');

	v_stage1_done := (v_effective_current_stage > 1);
	v_stage2_done := (v_effective_current_stage > 2);
	v_stage3_done := (v_effective_current_stage > 3);
	v_stage4_done := (v_effective_current_stage > 4);

	v_stage5_done := (
		v_no_docs_required
		OR (
			v_customer_type = 'individual'
			AND COALESCE(v_card.doc_claim_form, false)
			AND COALESCE(v_card.doc_rc, false)
			AND COALESCE(v_card.doc_insurance, false)
			AND COALESCE(v_card.doc_dl, false)
			AND COALESCE(v_card.doc_aadhaar, false)
			AND COALESCE(v_card.doc_pan, false)
		)
		OR (
			v_customer_type = 'firm'
			AND COALESCE(v_card.doc_claim_form, false)
			AND COALESCE(v_card.doc_rc, false)
			AND COALESCE(v_card.doc_insurance, false)
			AND COALESCE(v_card.doc_dl, false)
			AND COALESCE(v_card.doc_aadhaar, false)
			AND COALESCE(v_card.doc_pan, false)
			AND COALESCE(v_card.doc_gst, false)
			AND COALESCE(v_card.doc_company_pan, false)
			AND COALESCE(v_card.doc_bank_detail, false)
		)
		OR v_effective_current_stage > 5
	);

	v_stage6_done := (COALESCE(v_card.estimated_amount, 0) > 0 OR v_effective_current_stage > 6);
	v_stage7_done := (btrim(COALESCE(v_card.estimation_approved_by, '')) <> '' OR v_effective_current_stage > 7);
	v_stage8_done := (btrim(COALESCE(v_card.claim_intimation_no, '')) <> '' OR v_effective_current_stage > 8);

	v_survey_status := lower(btrim(COALESCE(v_card.survey_status, '')));
	v_survey_hold_reason := btrim(COALESCE(v_card.survey_hold_reason, ''));
	v_survey_approved := (v_survey_status = 'approved');
	v_floor_assigned := lower(btrim(COALESCE(v_card.bodyshop_floor, ''))) IN ('floor 2', 'floor 3');
	v_floor_completed := (lower(btrim(COALESCE(v_card.floor_status, ''))) = 'completed' OR EXISTS (SELECT 1 FROM public.bodyshop_assignments ba WHERE ba.is_active = true AND ba.bs_floor_completed_at IS NOT NULL AND (ba.repair_card_id = v_card.id OR upper(trim(COALESCE(ba.job_card_number, ''))) = upper(trim(COALESCE(v_card.job_card_no, ''))))));

	SELECT EXISTS (
		SELECT 1
		FROM public.bodyshop_repair_card_documents d
		WHERE d.repair_card_id = v_card.id
			AND d.doc_key = 'doc_survey_approval'
	) INTO v_survey_approval_evidence;
	v_survey_approval_evidence := (v_survey_approval_evidence OR v_effective_current_stage >= 10);

	BEGIN
		IF btrim(COALESCE(v_card.approved_parts, '')) <> '' THEN
			v_approved_parts_payload := v_card.approved_parts::jsonb;
			v_approved_parts_finalized := (btrim(COALESCE(v_approved_parts_payload->>'finalized_at', '')) <> '');
		END IF;
	EXCEPTION WHEN others THEN
		v_approved_parts_finalized := false;
	END;

	v_additional_approval_text := btrim(COALESCE(v_card.additional_approval, ''));
	IF v_additional_approval_text <> '' THEN
		BEGIN
			v_additional_approval_payload := v_additional_approval_text::jsonb;
			v_additional_parse_ok := true;
		EXCEPTION WHEN others THEN
			v_additional_parse_ok := false;
		END;

		IF v_additional_parse_ok THEN
			v_legacy_decision_status := lower(btrim(COALESCE(v_additional_approval_payload #>> '{decision,status}', 'pending')));
			IF v_legacy_decision_status NOT IN ('pending', 'approved', 'rejected') THEN
				v_legacy_decision_status := 'pending';
			END IF;

			IF jsonb_typeof(v_additional_approval_payload #> '{request,parts}') = 'array' THEN
				v_request_parts_count := jsonb_array_length(v_additional_approval_payload #> '{request,parts}');
			END IF;

			v_request_fallback_present := (
				btrim(COALESCE(v_additional_approval_payload #>> '{request,part_no}', '')) <> ''
				OR btrim(COALESCE(v_additional_approval_payload #>> '{request,part_description}', '')) <> ''
				OR btrim(COALESCE(v_additional_approval_payload #>> '{request,reason}', '')) <> ''
				OR btrim(COALESCE(v_additional_approval_payload #>> '{request,part_image_path}', '')) <> ''
			);

			v_additional_part_states_count := CASE
				WHEN v_request_parts_count > 0 THEN v_request_parts_count
				WHEN v_request_fallback_present THEN 1
				ELSE 0
			END;

			IF jsonb_typeof(v_additional_approval_payload #> '{decision,parts}') = 'array' THEN
				v_decision_parts := (v_additional_approval_payload #> '{decision,parts}');
			ELSE
				v_decision_parts := '[]'::jsonb;
			END IF;

			IF v_additional_part_states_count > 0 THEN
				FOR v_idx IN 0..(v_additional_part_states_count - 1) LOOP
					v_part_status := lower(btrim(COALESCE(v_decision_parts -> v_idx ->> 'status', v_legacy_decision_status)));
					IF v_part_status NOT IN ('pending', 'approved', 'rejected') THEN
						v_part_status := 'pending';
					END IF;

					IF v_part_status = 'pending' THEN
						v_additional_pending_count := v_additional_pending_count + 1;
					ELSIF v_part_status = 'approved' THEN
						v_additional_approved_count := v_additional_approved_count + 1;
					ELSIF v_part_status = 'rejected' THEN
						v_additional_rejected_count := v_additional_rejected_count + 1;
					END IF;
				END LOOP;

				IF v_additional_pending_count > 0 THEN
					v_additional_status := 'pending';
				ELSIF v_additional_approved_count > 0 AND v_additional_rejected_count > 0 THEN
					v_additional_status := 'mixed';
				ELSIF v_additional_approved_count = v_additional_part_states_count THEN
					v_additional_status := 'approved';
				ELSIF v_additional_rejected_count = v_additional_part_states_count THEN
					v_additional_status := 'rejected';
				ELSE
					v_additional_status := 'pending';
				END IF;
			ELSE
				v_additional_status := v_legacy_decision_status;
				v_additional_pending_count := CASE WHEN v_additional_status = 'pending' THEN 1 ELSE 0 END;
			END IF;
		ELSE
			v_additional_status := 'pending';
			v_additional_part_states_count := 1;
			v_additional_pending_count := 1;
		END IF;
	END IF;

	v_additional_requested := (v_additional_status <> 'none');

	v_stage9_done := (
		(v_card.survey_date IS NOT NULL)
		AND (v_survey_status IN ('hold', 'approved'))
		AND (v_survey_status <> 'hold' OR v_survey_hold_reason <> '')
		AND v_floor_assigned
	);

	v_stage10_done := (v_survey_approved AND v_survey_approval_evidence AND v_approved_parts_finalized);
	v_stage10_ready := (
		v_stage1_done
		AND v_stage2_done
		AND v_stage3_done
		AND v_stage4_done
		AND v_stage5_done
		AND v_stage6_done
		AND v_stage7_done
		AND v_stage8_done
		AND v_survey_approved
		AND v_survey_approval_evidence
	);
	v_stage11_ready := (v_stage10_ready AND v_stage9_done);

	v_stage12_done := (
		(v_additional_part_states_count > 0 AND v_additional_pending_count = 0)
		OR (v_additional_part_states_count = 0 AND v_additional_status IN ('approved', 'rejected'))
		OR v_effective_current_stage > 12
	);

	v_stage11_done := (v_floor_completed AND (NOT v_additional_requested OR v_stage12_done));

	p_stage_from := GREATEST(1, COALESCE(p_stage_from, 1));
	p_stage_to := LEAST(18, COALESCE(p_stage_to, 18));

	IF p_stage_from > p_stage_to THEN
		p_stage_from := 1;
		p_stage_to := 18;
	END IF;

	FOR v_stage IN p_stage_from..p_stage_to LOOP
		v_ready := v_is_active;
		v_done := false;
		v_pending := false;
		v_reason_codes := ARRAY[]::text[];

		IF p_reason IS NOT NULL THEN
			v_reason_codes := array_append(v_reason_codes, p_reason);
		END IF;

		IF NOT v_is_active THEN
			v_done := false;
			v_pending := false;
		ELSE
			IF v_stage = 1 THEN
				v_done := v_stage1_done;
				v_pending := NOT v_stage1_done;
			ELSIF v_stage = 2 THEN
				v_done := v_stage2_done;
				v_pending := NOT v_stage2_done;
			ELSIF v_stage = 3 THEN
				v_done := v_stage3_done;
				v_pending := NOT v_stage3_done;
			ELSIF v_stage = 4 THEN
				v_done := v_stage4_done;
				v_pending := NOT v_stage4_done;
			ELSIF v_stage = 5 THEN
				v_done := v_stage5_done;
				v_pending := v_stage1_done AND v_stage2_done AND v_stage3_done AND v_stage4_done AND NOT v_stage5_done;
			ELSIF v_stage = 6 THEN
				v_done := v_stage6_done;
				v_pending := v_stage1_done AND v_stage2_done AND v_stage3_done AND v_stage4_done AND v_stage5_done AND NOT v_stage6_done;
			ELSIF v_stage = 7 THEN
				v_done := v_stage7_done;
				v_pending := v_stage1_done AND v_stage2_done AND v_stage3_done AND v_stage4_done AND v_stage5_done AND v_stage6_done AND NOT v_stage7_done;
			ELSIF v_stage = 8 THEN
				v_done := v_stage8_done;
				v_pending := v_stage1_done AND v_stage2_done AND v_stage3_done AND v_stage4_done AND v_stage5_done AND v_stage6_done AND v_stage7_done AND NOT v_stage8_done;
			ELSIF v_stage = 9 THEN
				v_done := v_stage9_done;
				v_pending := v_stage1_done AND v_stage2_done AND v_stage3_done AND v_stage4_done AND v_stage5_done AND v_stage6_done AND v_stage7_done AND v_stage8_done AND NOT v_stage9_done;

				IF v_pending AND v_card.survey_date IS NULL THEN
					v_reason_codes := array_append(v_reason_codes, 'survey_date_missing');
				END IF;
				IF v_pending AND v_survey_status NOT IN ('hold', 'approved') THEN
					v_reason_codes := array_append(v_reason_codes, 'survey_status_invalid');
				END IF;
				IF v_pending AND v_survey_status = 'hold' AND v_survey_hold_reason = '' THEN
					v_reason_codes := array_append(v_reason_codes, 'survey_hold_reason_missing');
				END IF;
				IF v_pending AND NOT v_floor_assigned THEN
					v_reason_codes := array_append(v_reason_codes, 'survey_floor_not_assigned');
				END IF;
			ELSIF v_stage = 10 THEN
				v_done := v_stage10_done;
				v_pending := v_stage10_ready AND NOT v_stage10_done;

				IF v_pending AND NOT v_survey_approved THEN
					v_reason_codes := array_append(v_reason_codes, 'survey_not_approved');
				END IF;
				IF v_pending AND NOT v_survey_approval_evidence THEN
					v_reason_codes := array_append(v_reason_codes, 'survey_approval_evidence_missing');
				END IF;
				IF v_pending AND NOT v_approved_parts_finalized THEN
					v_reason_codes := array_append(v_reason_codes, 'approved_parts_not_finalized');
				END IF;
			ELSIF v_stage = 11 THEN
				v_done := v_stage11_done;
				v_pending := NOT v_stage11_done;

				IF v_pending AND NOT v_stage10_done THEN
					v_reason_codes := array_append(v_reason_codes, 'stage10_not_done');
				END IF;
				IF v_pending AND NOT v_floor_completed THEN
					v_reason_codes := array_append(v_reason_codes, 'floor_not_completed');
				END IF;
				IF v_pending AND v_additional_requested AND NOT v_stage12_done THEN
					v_reason_codes := array_append(v_reason_codes, 'additional_approval_pending');
				END IF;
			ELSIF v_stage = 12 THEN
				v_done := v_stage12_done;
				v_pending := v_stage11_ready AND v_additional_requested AND NOT v_stage12_done;

				IF v_pending AND v_additional_part_states_count > 0 AND v_additional_pending_count > 0 THEN
					v_reason_codes := array_append(v_reason_codes, 'additional_approval_part_pending');
				END IF;
				IF v_pending AND v_additional_part_states_count = 0 AND v_additional_status NOT IN ('approved', 'rejected') THEN
					v_reason_codes := array_append(v_reason_codes, 'additional_approval_decision_missing');
				END IF;
			ELSIF v_stage BETWEEN 13 AND 18 THEN
				v_done := (v_effective_current_stage > v_stage);
				v_pending := (v_effective_current_stage = v_stage);
			ELSE
				v_done := (v_stage < v_effective_current_stage);
				v_pending := (v_stage = v_effective_current_stage);
			END IF;

			IF v_pre_billing_waived AND v_stage BETWEEN 1 AND 14 THEN
				v_done := true;
				v_pending := false;
				IF NOT ('admin_waived_pre_billing' = ANY(v_reason_codes)) THEN
					v_reason_codes := array_append(v_reason_codes, 'admin_waived_pre_billing');
				END IF;
			END IF;
		END IF;

		INSERT INTO public.bodyshop_stage_worklist_projection (
			repair_card_id,
			stage_no,
			is_ready,
			is_done,
			is_pending,
			reason_codes,
			rule_version,
			computed_at,
			source_hash,
			dealer_code,
			branch,
			advisor_key,
			updated_at
		) VALUES (
			v_card.id,
			v_stage,
			v_ready,
			v_done,
			v_pending,
			to_jsonb(v_reason_codes),
			v_rule_version,
			now(),
			md5(
				COALESCE(v_card.id::text, '') || ':' ||
				COALESCE(v_card.current_stage::text, '') || ':' ||
				COALESCE(v_card.survey_date::text, '') || ':' ||
				COALESCE(v_card.survey_status, '') || ':' ||
				COALESCE(v_card.bodyshop_floor, '') || ':' ||
				COALESCE(v_card.floor_status, '') || ':' ||
				COALESCE(v_card.approved_parts, '') || ':' ||
				COALESCE(v_card.additional_approval, '') || ':' ||
				COALESCE(v_card.overall_status, '') || ':' ||
				COALESCE(array_to_string(v_reason_codes, ','), '') || ':' ||
				COALESCE(v_rule_version, '')
			),
			split_part(COALESCE(v_card.sa_employee_code, ''), '_', 1),
			v_card.branch,
			COALESCE(v_card.sa_employee_code, ''),
			now()
		)
		ON CONFLICT (repair_card_id, stage_no)
		DO UPDATE SET
			is_ready = EXCLUDED.is_ready,
			is_done = EXCLUDED.is_done,
			is_pending = EXCLUDED.is_pending,
			reason_codes = EXCLUDED.reason_codes,
			rule_version = EXCLUDED.rule_version,
			computed_at = EXCLUDED.computed_at,
			source_hash = EXCLUDED.source_hash,
			dealer_code = EXCLUDED.dealer_code,
			branch = EXCLUDED.branch,
			advisor_key = EXCLUDED.advisor_key,
			updated_at = now();
	END LOOP;
END;
$$;


--
-- TOC entry 2206 (class 1255 OID 50272)
-- Name: reconcile_all_service_data_from_contact_details_chunked(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.bodyshop_admin_waive_pre_billing_stages(p_repair_card_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
SET row_security TO off
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_card public.bodyshop_repair_cards%ROWTYPE;
  v_reconcile jsonb;
  v_open_floor boolean;
BEGIN
  IF v_email <> 'admin@firstmobital.com' THEN
    RAISE EXCEPTION 'permission denied: admin waiver restricted'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_card FROM public.bodyshop_repair_cards WHERE id = p_repair_card_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'repair_card_not_found');
  END IF;

  IF lower(btrim(coalesce(v_card.overall_status, ''))) <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'card_not_active');
  END IF;

  IF COALESCE(v_card.billed_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'billing_amount_missing');
  END IF;

  IF v_card.pre_billing_stages_waived_at IS NOT NULL THEN
    PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(
      v_card.id, 1, 18, 'admin_waive_pre_billing_refresh'
    );
    RETURN jsonb_build_object(
      'ok', true,
      'already_waived', true,
      'waived_at', v_card.pre_billing_stages_waived_at,
      'waived_by', v_card.pre_billing_stages_waived_by
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.bodyshop_assignments ba
    WHERE ba.is_active = true
      AND ba.bs_floor_completed_at IS NULL
      AND (
        ba.repair_card_id = v_card.id
        OR upper(btrim(coalesce(ba.job_card_number, ''))) = upper(btrim(coalesce(v_card.job_card_no, '')))
      )
  ) INTO v_open_floor;

  IF v_open_floor AND lower(btrim(coalesce(v_card.floor_status, ''))) <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'open_floor_assignment');
  END IF;

  UPDATE public.bodyshop_repair_cards
  SET
    pre_billing_stages_waived_at = now(),
    pre_billing_stages_waived_by = v_email,
    updated_at = now()
  WHERE id = v_card.id;

  INSERT INTO public.bodyshop_repair_card_stage_history (
    repair_card_id, from_stage, to_stage, source, reason, actor
  ) VALUES (
    v_card.id,
    v_card.current_stage,
    v_card.current_stage,
    'admin_waive_pre_billing',
    'pre_billing_stages_waiver_projection_only',
    auth.uid()
  );

  PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(
    v_card.id, 1, 18, 'admin_waive_pre_billing'
  );

  PERFORM set_config('bodyshop.stage_change_reason', 'admin_waive_pre_billing', true);
  v_reconcile := public.bodyshop_reconcile_repair_card_current_stage(v_card.id);

  RETURN jsonb_build_object(
    'ok', true,
    'repair_card_id', v_card.id,
    'reconcile', v_reconcile,
    'waived_by', v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bodyshop_admin_waive_pre_billing_stages(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bodyshop_admin_waive_pre_billing_stages(integer) TO authenticated;

COMMENT ON FUNCTION public.bodyshop_admin_waive_pre_billing_stages(integer) IS
  'admin@firstmobital.com only: waiver flag + recompute stages 1-14 done when billing entered; then pointer reconcile.';
