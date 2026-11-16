-- BODYSHOP-STAGE-002 Phase 3 PREVIEW (read-only, SELECT only). Changes nothing.
-- Classifies the cards touched by migration 20261114140000 (marker:
-- bodyshop_survey_manager_verified_by = 'historical_backfill_survey_gates').
--
-- genuine  : on Floor 2/3, or has an assignment row, or pointer >= 11.
--            Floor placement already required customer approval (trigger 20261007220000),
--            so the approval is real; only the backfill label is cosmetic.
-- forged   : no floor, no assignment, pointer <= 10. Approval + manager verify were invented.
-- Run QUERY 1 first, then QUERY 2 (the SQL editor shows only the last result).

-- ===== QUERY 1: summary =====
WITH marked AS (
  SELECT b.id, b.job_card_no, b.current_stage, b.bodyshop_floor, b.created_at,
         b.survay_info_updated_at, b.survey_date, b.survey_status,
         b.customer_survey_approval_status, b.bodyshop_survey_manager_verify_status,
         EXISTS (SELECT 1 FROM public.bodyshop_assignments a
                 WHERE a.repair_card_id = b.id
                    OR (a.repair_card_id IS NULL AND upper(btrim(a.job_card_number)) = upper(btrim(b.job_card_no)))) AS has_assignment,
         EXISTS (SELECT 1 FROM public.bodyshop_repair_card_documents d
                 WHERE d.repair_card_id = b.id AND d.doc_key = 'doc_survey_approval') AS has_survey_doc
  FROM public.bodyshop_repair_cards b
  WHERE b.bodyshop_survey_manager_verified_by = 'historical_backfill_survey_gates'
),
classed AS (
  SELECT *,
    CASE WHEN lower(btrim(COALESCE(bodyshop_floor,''))) IN ('floor 2','floor 3')
           OR has_assignment OR COALESCE(current_stage,1) >= 11
         THEN 'genuine' ELSE 'forged' END AS class
  FROM marked
)
SELECT class,
       count(*)                                              AS cards,
       count(*) FILTER (WHERE survay_info_updated_at IS NULL) AS survey_never_entered,
       count(*) FILTER (WHERE has_survey_doc)                 AS has_survey_doc_row,
       min(created_at)::date                                  AS oldest,
       max(created_at)::date                                  AS newest
FROM classed
GROUP BY class
ORDER BY class;

-- ===== QUERY 2: forged cards detail (these are the rows Phase 3 would reset) =====
WITH marked AS (
  SELECT b.*,
         EXISTS (SELECT 1 FROM public.bodyshop_assignments a
                 WHERE a.repair_card_id = b.id
                    OR (a.repair_card_id IS NULL AND upper(btrim(a.job_card_number)) = upper(btrim(b.job_card_no)))) AS has_assignment,
         EXISTS (SELECT 1 FROM public.bodyshop_repair_card_documents d
                 WHERE d.repair_card_id = b.id AND d.doc_key = 'doc_survey_approval') AS has_survey_doc
  FROM public.bodyshop_repair_cards b
  WHERE b.bodyshop_survey_manager_verified_by = 'historical_backfill_survey_gates'
)
SELECT id, job_card_no, current_stage, bodyshop_floor, created_at::date AS created,
       survey_date, survey_status, survay_info_updated_at IS NOT NULL AS survey_info_entered,
       customer_survey_approval_status, bodyshop_survey_manager_verify_status, has_survey_doc
FROM marked
WHERE NOT (lower(btrim(COALESCE(bodyshop_floor,''))) IN ('floor 2','floor 3')
           OR has_assignment OR COALESCE(current_stage,1) >= 11)
ORDER BY created_at;
