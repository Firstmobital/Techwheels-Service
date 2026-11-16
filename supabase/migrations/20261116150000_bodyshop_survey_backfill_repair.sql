-- BODYSHOP-STAGE-002 Phase 3: repair the 2026-11-14 historical survey backfill (20261114140000).
-- Backup-free: uses evidence that still exists on the row. No pointer (current_stage) is changed
-- by this file; the card trigger's reconcile only ever raises pointers.
--
-- Marker: bodyshop_survey_manager_verified_by = 'historical_backfill_survey_gates'.
-- genuine : on Floor 2/3, or has a bodyshop_assignments row, or current_stage >= 11.
--           A trigger (20261007220000) already required customer approval before floor placement,
--           so the approval is real. Only the backfill label is replaced.
-- forged  : not genuine (no floor, no assignment, stage <= 10).
--   * forged WITHOUT a doc_survey_approval document row -> reset (approval, manager verify,
--     and survey fields that were never entered).
--   * forged WITH a document row -> LEFT UNTOUCHED (cannot tell if the customer really approved);
--     still carries the marker so it can be reviewed by hand.
-- Every change is logged in bodyshop_survey_backfill_repair_log (before/after).
--
-- Apply per DB_CHANGE_PROTOCOL. Ledger: DBL-0094. Preview: scripts/bodyshop_survey_backfill_repair_preview.sql
--
-- ROLLBACK: restore each card from the log, e.g.
--   UPDATE public.bodyshop_repair_cards b SET
--     customer_survey_approval_status = l.before_state->>'customer_survey_approval_status',
--     customer_survey_rejection_reason = l.before_state->>'customer_survey_rejection_reason',
--     customer_survey_decided_at = (l.before_state->>'customer_survey_decided_at')::timestamptz,
--     doc_survey_approval = (l.before_state->>'doc_survey_approval')::boolean,
--     survey_status = l.before_state->>'survey_status',
--     survey_date = (l.before_state->>'survey_date')::date,
--     bodyshop_survey_manager_verify_status = l.before_state->>'bodyshop_survey_manager_verify_status',
--     bodyshop_survey_manager_verified_by = l.before_state->>'bodyshop_survey_manager_verified_by',
--     bodyshop_survey_manager_verified_at = (l.before_state->>'bodyshop_survey_manager_verified_at')::timestamptz,
--     bodyshop_survey_manager_verify_remark = l.before_state->>'bodyshop_survey_manager_verify_remark'
--   FROM public.bodyshop_survey_backfill_repair_log l
--   WHERE l.repair_card_id = b.id AND l.action IN ('reset_forged', 'relabel_genuine');

CREATE TABLE IF NOT EXISTS public.bodyshop_survey_backfill_repair_log (
  id bigserial PRIMARY KEY,
  repair_card_id integer NOT NULL,
  action text NOT NULL,
  repaired_at timestamptz NOT NULL DEFAULT now(),
  before_state jsonb,
  after_state jsonb
);

ALTER TABLE public.bodyshop_survey_backfill_repair_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bodyshop_survey_backfill_repair_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.bodyshop_survey_backfill_repair_log_id_seq FROM PUBLIC, anon, authenticated;

-- 1) Reset forged cards that have no survey-approval document.
WITH marked AS (
  SELECT b.*,
         (
           lower(btrim(COALESCE(b.bodyshop_floor, ''))) IN ('floor 2', 'floor 3')
           OR COALESCE(b.current_stage, 1) >= 11
           OR EXISTS (
             SELECT 1 FROM public.bodyshop_assignments a
             WHERE a.repair_card_id = b.id
                OR (a.repair_card_id IS NULL AND upper(btrim(a.job_card_number)) = upper(btrim(b.job_card_no)))
           )
         ) AS is_genuine,
         EXISTS (
           SELECT 1 FROM public.bodyshop_repair_card_documents d
           WHERE d.repair_card_id = b.id AND d.doc_key = 'doc_survey_approval'
         ) AS has_survey_doc
  FROM public.bodyshop_repair_cards b
  WHERE b.bodyshop_survey_manager_verified_by = 'historical_backfill_survey_gates'
),
target AS (
  SELECT * FROM marked WHERE NOT is_genuine AND NOT has_survey_doc
),
upd AS (
  UPDATE public.bodyshop_repair_cards b
  SET
    customer_survey_approval_status = NULL,
    customer_survey_rejection_reason = NULL,
    customer_survey_decided_at = NULL,
    doc_survey_approval = false,
    survey_status = CASE WHEN t.survay_info_updated_at IS NULL THEN 'pending' ELSE b.survey_status END,
    survey_date = CASE WHEN t.survay_info_updated_at IS NULL THEN NULL ELSE b.survey_date END,
    bodyshop_survey_manager_verify_status = NULL,
    bodyshop_survey_manager_verified_by = NULL,
    bodyshop_survey_manager_verified_at = NULL,
    bodyshop_survey_manager_verify_remark = NULL,
    updated_at = now()
  FROM target t
  WHERE b.id = t.id
  RETURNING b.id, b.customer_survey_approval_status, b.doc_survey_approval, b.survey_status,
            b.survey_date, b.bodyshop_survey_manager_verify_status, b.bodyshop_survey_manager_verified_by
)
INSERT INTO public.bodyshop_survey_backfill_repair_log (repair_card_id, action, before_state, after_state)
SELECT t.id,
       'reset_forged',
       jsonb_build_object(
         'customer_survey_approval_status', t.customer_survey_approval_status,
         'customer_survey_rejection_reason', t.customer_survey_rejection_reason,
         'customer_survey_decided_at', t.customer_survey_decided_at,
         'doc_survey_approval', t.doc_survey_approval,
         'survey_status', t.survey_status,
         'survey_date', t.survey_date,
         'bodyshop_survey_manager_verify_status', t.bodyshop_survey_manager_verify_status,
         'bodyshop_survey_manager_verified_by', t.bodyshop_survey_manager_verified_by,
         'bodyshop_survey_manager_verified_at', t.bodyshop_survey_manager_verified_at,
         'bodyshop_survey_manager_verify_remark', t.bodyshop_survey_manager_verify_remark
       ),
       to_jsonb(u)
FROM target t
JOIN upd u ON u.id = t.id;

-- 2) Genuine cards keep their approval; replace the misleading backfill label only.
WITH marked AS (
  SELECT b.*
  FROM public.bodyshop_repair_cards b
  WHERE b.bodyshop_survey_manager_verified_by = 'historical_backfill_survey_gates'
    AND (
      lower(btrim(COALESCE(b.bodyshop_floor, ''))) IN ('floor 2', 'floor 3')
      OR COALESCE(b.current_stage, 1) >= 11
      OR EXISTS (
        SELECT 1 FROM public.bodyshop_assignments a
        WHERE a.repair_card_id = b.id
           OR (a.repair_card_id IS NULL AND upper(btrim(a.job_card_number)) = upper(btrim(b.job_card_no)))
      )
    )
),
upd AS (
  UPDATE public.bodyshop_repair_cards b
  SET
    bodyshop_survey_manager_verified_by = 'legacy_label_2026-11-14',
    bodyshop_survey_manager_verify_remark =
      'Legacy card already on the floor / past stage 10: approval label completed 2026-11-14.',
    updated_at = now()
  FROM marked m
  WHERE b.id = m.id
  RETURNING b.id, b.bodyshop_survey_manager_verified_by, b.bodyshop_survey_manager_verify_remark
)
INSERT INTO public.bodyshop_survey_backfill_repair_log (repair_card_id, action, before_state, after_state)
SELECT m.id,
       'relabel_genuine',
       jsonb_build_object(
         'customer_survey_approval_status', m.customer_survey_approval_status,
         'customer_survey_rejection_reason', m.customer_survey_rejection_reason,
         'customer_survey_decided_at', m.customer_survey_decided_at,
         'doc_survey_approval', m.doc_survey_approval,
         'survey_status', m.survey_status,
         'survey_date', m.survey_date,
         'bodyshop_survey_manager_verify_status', m.bodyshop_survey_manager_verify_status,
         'bodyshop_survey_manager_verified_by', m.bodyshop_survey_manager_verified_by,
         'bodyshop_survey_manager_verified_at', m.bodyshop_survey_manager_verified_at,
         'bodyshop_survey_manager_verify_remark', m.bodyshop_survey_manager_verify_remark
       ),
       to_jsonb(u)
FROM marked m
JOIN upd u ON u.id = m.id;
