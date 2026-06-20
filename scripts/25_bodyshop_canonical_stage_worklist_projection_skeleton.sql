-- BODYSHOP-QUEUE-001
-- Canonical Stage Worklist Backend Projection - Executable Draft
-- Created: 2026-06-20
-- Scope: Phase 2.3 executable migration draft (manual execution only)
--
-- IMPORTANT
-- 1) Review in staging before production run.
-- 2) This draft creates projection infrastructure and conservative trigger logic.
-- 3) Stage-rule computation remains intentionally minimal in this draft and is expected
--    to be refined in Phase 3 implementation.

BEGIN;

-- -----------------------------------------------------------------------------
-- 0) Rule Version Registry
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bodyshop_stage_rule_versions (
	rule_version text PRIMARY KEY,
	is_active boolean NOT NULL DEFAULT false,
	notes text,
	created_at timestamptz NOT NULL DEFAULT now(),
	created_by text
);

INSERT INTO public.bodyshop_stage_rule_versions (rule_version, is_active, notes, created_by)
VALUES ('BODYSHOP-QUEUE-RULES-v1', true, 'Initial projection draft baseline', 'BODYSHOP-QUEUE-001')
ON CONFLICT (rule_version) DO UPDATE
SET is_active = EXCLUDED.is_active,
		notes = EXCLUDED.notes;

-- -----------------------------------------------------------------------------
-- 1) Canonical Projection (row-per-card-per-stage)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bodyshop_stage_worklist_projection (
	repair_card_id integer NOT NULL,
	stage_no integer NOT NULL,
	is_ready boolean NOT NULL DEFAULT false,
	is_done boolean NOT NULL DEFAULT false,
	is_pending boolean NOT NULL DEFAULT false,
	reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
	rule_version text NOT NULL,
	computed_at timestamptz NOT NULL DEFAULT now(),
	source_hash text,
	dealer_code text,
	branch text,
	advisor_key text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT bodyshop_stage_worklist_projection_pkey PRIMARY KEY (repair_card_id, stage_no),
	CONSTRAINT bodyshop_stage_worklist_projection_stage_check CHECK (stage_no BETWEEN 1 AND 18),
	CONSTRAINT bodyshop_stage_worklist_projection_reason_codes_array CHECK (jsonb_typeof(reason_codes) = 'array'),
	CONSTRAINT bodyshop_stage_worklist_projection_card_fk FOREIGN KEY (repair_card_id)
		REFERENCES public.bodyshop_repair_cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bswp_stage_pending
	ON public.bodyshop_stage_worklist_projection (stage_no, is_pending);

CREATE INDEX IF NOT EXISTS idx_bswp_scope_pending
	ON public.bodyshop_stage_worklist_projection (dealer_code, branch, advisor_key, stage_no, is_pending);

CREATE INDEX IF NOT EXISTS idx_bswp_rule_version
	ON public.bodyshop_stage_worklist_projection (rule_version);

CREATE INDEX IF NOT EXISTS idx_bswp_computed_at_desc
	ON public.bodyshop_stage_worklist_projection (computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_bswp_repair_card
	ON public.bodyshop_stage_worklist_projection (repair_card_id);

-- Canonical stage logic implementation for S9-S12 with compatibility fallback
-- for S1-S8 and S13-S18.
CREATE OR REPLACE FUNCTION public.recompute_bodyshop_stage_worklist_projection_for_card(
	p_repair_card_id integer,
	p_stage_from integer DEFAULT 1,
	p_stage_to integer DEFAULT 18,
	p_reason text DEFAULT NULL
) RETURNS void
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
	v_floor_completed := lower(btrim(COALESCE(v_card.floor_status, ''))) = 'completed';

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

	v_stage11_done := (v_floor_completed AND v_stage10_done AND (NOT v_additional_requested OR v_stage12_done));

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
				v_pending := v_stage11_ready AND NOT v_stage11_done;

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

CREATE OR REPLACE FUNCTION public.recompute_bodyshop_stage_worklist_projection_for_all_cards()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_card_id integer;
BEGIN
	FOR v_card_id IN
		SELECT id FROM public.bodyshop_repair_cards
	LOOP
		PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(v_card_id, 1, 18, 'reconcile_full');
	END LOOP;
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

CREATE OR REPLACE FUNCTION public.enforce_bodyshop_stage_pointer_s9_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	v_survey_status text;
	v_survey_hold_reason text;
	v_floor_assigned boolean;
	v_stage9_done boolean;
BEGIN
	IF COALESCE(NEW.overall_status, 'active') <> 'active' THEN
		RETURN NEW;
	END IF;

	v_survey_status := lower(btrim(COALESCE(NEW.survey_status, '')));
	v_survey_hold_reason := btrim(COALESCE(NEW.survey_hold_reason, ''));
	v_floor_assigned := lower(btrim(COALESCE(NEW.bodyshop_floor, ''))) IN ('floor 2', 'floor 3');

	v_stage9_done := (
		NEW.survey_date IS NOT NULL
		AND (v_survey_status IN ('hold', 'approved'))
		AND (v_survey_status <> 'hold' OR v_survey_hold_reason <> '')
		AND v_floor_assigned
	);

	IF COALESCE(NEW.current_stage, 1) > 9 AND NOT v_stage9_done THEN
		NEW.current_stage := 9;
		NEW.current_stage_name := 'Survey';
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bodyshop_repair_cards_s9_pointer_guard ON public.bodyshop_repair_cards;
CREATE TRIGGER trg_bodyshop_repair_cards_s9_pointer_guard
BEFORE INSERT OR UPDATE OF
	overall_status,
	current_stage,
	current_stage_name,
	survey_date,
	survey_status,
	survey_hold_reason,
	bodyshop_floor
ON public.bodyshop_repair_cards
FOR EACH ROW
EXECUTE FUNCTION public.enforce_bodyshop_stage_pointer_s9_guard();

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
	approved_parts,
	additional_approval,
	bodyshop_floor,
	floor_status,
	floor_hold_reason
ON public.bodyshop_repair_cards
FOR EACH ROW
EXECUTE FUNCTION public.trg_bodyshop_stage_worklist_projection_card_change();

CREATE OR REPLACE FUNCTION public.trg_bodyshop_stage_worklist_projection_doc_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	v_repair_card_id integer;
	v_doc_key text;
BEGIN
	IF TG_OP = 'DELETE' THEN
		v_repair_card_id := OLD.repair_card_id;
		v_doc_key := OLD.doc_key;
	ELSE
		v_repair_card_id := NEW.repair_card_id;
		v_doc_key := NEW.doc_key;
	END IF;

	IF v_repair_card_id IS NULL THEN
		RETURN COALESCE(NEW, OLD);
	END IF;

	IF v_doc_key = 'doc_survey_approval' THEN
		PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(
			v_repair_card_id,
			10,
			12,
			'doc_survey_approval_change'
		);
	END IF;

	RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bodyshop_stage_worklist_projection_doc_change ON public.bodyshop_repair_card_documents;
CREATE TRIGGER trg_bodyshop_stage_worklist_projection_doc_change
AFTER INSERT OR UPDATE OF doc_key OR DELETE
ON public.bodyshop_repair_card_documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_bodyshop_stage_worklist_projection_doc_change();

-- Seed projection rows for existing cards.
SELECT public.recompute_bodyshop_stage_worklist_projection_for_all_cards();

-- -----------------------------------------------------------------------------
-- 2) Queue Count Aggregation Surface
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_bodyshop_stage_queue_counts AS
SELECT
	stage_no,
	count(*) FILTER (WHERE is_pending) AS pending_count,
	count(*) FILTER (WHERE is_ready) AS ready_count,
	count(*) FILTER (WHERE is_done) AS done_count,
	count(DISTINCT repair_card_id) AS card_count,
	min(rule_version) AS rule_version,
	max(computed_at) AS computed_at
FROM public.bodyshop_stage_worklist_projection
GROUP BY stage_no
ORDER BY stage_no;

-- -----------------------------------------------------------------------------
-- 3) Reason-Code Dictionary (optional, useful for UI explainability)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bodyshop_stage_reason_codes (
	code text PRIMARY KEY,
	label text NOT NULL,
	description text,
	active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bodyshop_stage_reason_codes (code, label, description) VALUES
	('survey_date_missing', 'Survey Date Missing', 'Survey date is required for stage 9 completion'),
	('survey_status_invalid', 'Survey Status Invalid', 'Survey status must be hold or approved'),
	('survey_hold_reason_missing', 'Survey Hold Reason Missing', 'Hold reason is required when survey status is hold'),
	('survey_floor_not_assigned', 'Survey Floor Not Assigned', 'Send To Floor 2 or Send To Floor 3 is required to complete stage 9'),
	('survey_not_approved', 'Survey Not Approved', 'Stage requires approved survey state'),
	('survey_approval_evidence_missing', 'Survey Approval Evidence Missing', 'Survey approval document evidence is missing'),
	('approved_parts_not_finalized', 'Approved Parts Not Finalized', 'Approved parts list is not finalized'),
	('floor_not_completed', 'Floor Not Completed', 'Floor completion criteria are not met'),
	('stage10_not_done', 'Stage 10 Not Done', 'Stage 11 blocked because stage 10 is not complete'),
	('additional_approval_pending', 'Additional Approval Pending', 'Additional approval request is unresolved'),
	('additional_approval_part_pending', 'Additional Approval Part Pending', 'At least one additional approval part is pending'),
	('additional_approval_decision_missing', 'Additional Approval Decision Missing', 'Decision is missing for additional approval request')
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label,
		description = EXCLUDED.description,
		active = true;

-- -----------------------------------------------------------------------------
-- 4) Indexing Guidance
-- -----------------------------------------------------------------------------
-- Indexes are created above with table DDL.

-- -----------------------------------------------------------------------------
-- 5) Access Control
-- -----------------------------------------------------------------------------
-- NOTE: Keep grants and RLS aligned with existing bodyshop access policies.
-- This draft intentionally does not introduce new RLS policies automatically.

-- -----------------------------------------------------------------------------
-- 6) Validation Hooks
-- -----------------------------------------------------------------------------
-- Validation helper views for parity harness.
CREATE OR REPLACE VIEW public.vw_bodyshop_stage_worklist_snapshot AS
SELECT
	p.repair_card_id,
	c.job_card_no,
	c.reg_number,
	p.stage_no,
	p.is_ready,
	p.is_done,
	p.is_pending,
	p.reason_codes,
	p.rule_version,
	p.computed_at
FROM public.bodyshop_stage_worklist_projection p
JOIN public.bodyshop_repair_cards c ON c.id = p.repair_card_id;

CREATE OR REPLACE VIEW public.vw_bodyshop_stage_worklist_mismatch_export AS
SELECT
	repair_card_id,
	stage_no,
	is_pending,
	reason_codes,
	rule_version,
	computed_at
FROM public.bodyshop_stage_worklist_projection;

COMMIT;
