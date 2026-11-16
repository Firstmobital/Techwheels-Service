-- BODYSHOP-STAGE-002 Phase 2: stage pointer follows billing data + stage history.
-- Requires 20261116120000 (lockdown) to be applied first.
--
-- 1) bodyshop_repair_card_stage_history: every current_stage change is recorded (who/source/from/to).
-- 2) Reconcile now also raises the pointer from billing data, same rules as the UI
--    (src/lib/bodyshopBillingStage.ts), only for cards already past Re-Inspection (pointer >= 15):
--       DO received OR any payment posted  -> 18
--       billed                             -> 16
--    Pointer 17 (explicit Delivery) is never changed. Pointer only moves up. Fully paid cars stay at 18 in
--    the pointer; the UI shows them in Delivery (stage 17) from the data.
-- 3) Card trigger also fires on billing/settlement column changes.
-- 4) Baseline history row per active card, then reconcile once for active cards with pointer >= 15.
--
-- Apply per DB_CHANGE_PROTOCOL. Ledger: DBL-0095. Preview: scripts/bodyshop_stage_pointer_billing_preview.sql
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_bodyshop_stage_history ON public.bodyshop_repair_cards;
--   DROP FUNCTION IF EXISTS public.trg_bodyshop_stage_history();
--   re-run function body from 20261116120000_bodyshop_stage_reconcile_lockdown.sql
--   re-create trigger trg_bodyshop_stage_worklist_projection_card_change from 20261114120000 (without billing columns)
--   Pointer values changed by step 4 can be restored from the history table:
--     UPDATE public.bodyshop_repair_cards b SET current_stage = h.from_stage
--     FROM public.bodyshop_repair_card_stage_history h
--     WHERE h.repair_card_id = b.id AND h.source = 'reconcile' AND h.reason = 'backfill_2026-11-16';
--   (set bodyshop.stage_reconcile_active = '1' in the session first if you do not want reconcile to re-run)

-- 1) History table -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bodyshop_repair_card_stage_history (
  id bigserial PRIMARY KEY,
  repair_card_id integer NOT NULL,
  from_stage integer,
  to_stage integer NOT NULL,
  source text NOT NULL,
  reason text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bodyshop_stage_history_card
  ON public.bodyshop_repair_card_stage_history (repair_card_id, created_at DESC);

ALTER TABLE public.bodyshop_repair_card_stage_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bodyshop_repair_card_stage_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.bodyshop_repair_card_stage_history_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bodyshop_repair_card_stage_history TO authenticated;

DROP POLICY IF EXISTS bodyshop_stage_history_admin_select ON public.bodyshop_repair_card_stage_history;
CREATE POLICY bodyshop_stage_history_admin_select
  ON public.bodyshop_repair_card_stage_history
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.trg_bodyshop_stage_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN
    INSERT INTO public.bodyshop_repair_card_stage_history (repair_card_id, from_stage, to_stage, source, reason, actor)
    VALUES (
      NEW.id,
      OLD.current_stage,
      NEW.current_stage,
      CASE WHEN coalesce(current_setting('bodyshop.stage_reconcile_active', true), '0') = '1'
           THEN 'reconcile' ELSE 'direct_update' END,
      nullif(current_setting('bodyshop.stage_change_reason', true), ''),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_bodyshop_stage_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bodyshop_stage_history ON public.bodyshop_repair_cards;
CREATE TRIGGER trg_bodyshop_stage_history
  AFTER UPDATE OF current_stage ON public.bodyshop_repair_cards
  FOR EACH ROW EXECUTE FUNCTION public.trg_bodyshop_stage_history();

-- 2) Reconcile: lockdown version + billing step ---------------------------------------------------
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
  v_billed boolean := false;
  v_do_received boolean := false;
  v_any_payment boolean := false;
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
          OR (ba.repair_card_id IS NULL AND v_jc <> '' AND upper(btrim(ba.job_card_number)) = v_jc)
        )
    ),
    EXISTS (
      SELECT 1
      FROM public.bodyshop_assignments ba
      WHERE ba.is_active = true
        AND (
          ba.repair_card_id = v_card.id
          OR (ba.repair_card_id IS NULL AND v_jc <> '' AND upper(btrim(ba.job_card_number)) = v_jc)
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
          OR (ba.repair_card_id IS NULL AND v_jc <> '' AND upper(btrim(ba.job_card_number)) = v_jc)
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

  -- Billing / payment: only for cards already past Re-Inspection. Pointer 17 (explicit Delivery) is kept.
  IF v_min >= 15 AND v_min <> 17 THEN
    v_billed := lower(btrim(COALESCE(v_card.parts_entry_status, ''))) = 'billed' AND v_card.billed_amount IS NOT NULL;
    v_do_received := lower(btrim(COALESCE(v_card.do_status, ''))) = 'received' AND v_card.do_amount IS NOT NULL;
    v_any_payment :=
      lower(btrim(COALESCE(v_card.do_payment_status, ''))) IN ('partial', 'received')
      OR lower(btrim(COALESCE(v_card.customer_payment_status, ''))) IN ('partial', 'received');
    IF v_do_received OR v_any_payment THEN
      v_min := GREATEST(v_min, 18);
    ELSIF v_billed THEN
      v_min := GREATEST(v_min, 16);
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

  PERFORM set_config('bodyshop.stage_reconcile_active', '1', true);

  UPDATE public.bodyshop_repair_cards
  SET
    current_stage = v_new,
    current_stage_name = public.customer_bodyshop_stage_label(v_new),
    updated_at = now()
  WHERE id = v_card.id;

  PERFORM set_config('bodyshop.stage_reconcile_active', '0', true);
  PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(v_card.id, 1, 18, 'stage_pointer_reconcile');

  RETURN jsonb_build_object(
    'ok', true,
    'advanced', true,
    'previous_stage', v_prev,
    'current_stage', v_new
  );
END;
$$;

-- 3) Card trigger also fires on billing / settlement columns ---------------------------------------
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
    reinspection_status,
    parts_entry_status,
    billed_amount,
    do_status,
    do_amount,
    do_payment_status,
    customer_payment_status
  ON public.bodyshop_repair_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_bodyshop_stage_worklist_projection_card_change();

-- 4) Baseline history, then reconcile once for active cards with pointer >= 15 ---------------------
INSERT INTO public.bodyshop_repair_card_stage_history (repair_card_id, from_stage, to_stage, source, reason)
SELECT b.id, NULL, b.current_stage, 'baseline', 'baseline_2026-11-16'
FROM public.bodyshop_repair_cards b
WHERE b.overall_status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.bodyshop_repair_card_stage_history h
    WHERE h.repair_card_id = b.id AND h.source = 'baseline'
  );

DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('bodyshop.stage_change_reason', 'backfill_2026-11-16', true);
  FOR r IN
    SELECT id FROM public.bodyshop_repair_cards
    WHERE overall_status = 'active' AND current_stage >= 15
    ORDER BY id
  LOOP
    PERFORM public.bodyshop_reconcile_repair_card_current_stage(r.id);
  END LOOP;
  PERFORM set_config('bodyshop.stage_change_reason', '', true);
END;
$$;
