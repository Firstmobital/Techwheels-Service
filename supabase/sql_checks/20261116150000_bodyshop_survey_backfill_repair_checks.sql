-- Read-only checks for 20261116150000_bodyshop_survey_backfill_repair.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Note: the SQL editor shows only the last result when run in one go; run each SELECT separately there.

-- Expect: reset_forged = 18 (the preview's forged cards without a survey document),
--         relabel_genuine = number of genuine marked cards from preview QUERY 1.
SELECT action, count(*) AS rows FROM public.bodyshop_survey_backfill_repair_log GROUP BY action ORDER BY action;

-- Expect: only the 2 cards held back for manual review (ids 1198 and 1253).
SELECT id, job_card_no, current_stage FROM public.bodyshop_repair_cards
WHERE bodyshop_survey_manager_verified_by = 'historical_backfill_survey_gates' ORDER BY id;

-- Expect: 0 rows. Reset cards must no longer look approved or verified.
SELECT b.id FROM public.bodyshop_repair_cards b
JOIN public.bodyshop_survey_backfill_repair_log l ON l.repair_card_id = b.id AND l.action = 'reset_forged'
WHERE b.customer_survey_approval_status IS NOT NULL
   OR b.bodyshop_survey_manager_verify_status IS NOT NULL
   OR COALESCE(b.doc_survey_approval, false) = true;

-- Pointers: this migration never writes current_stage and reconcile only raises it. Spot check the 20 cards
-- from the preview (524,1076,1165,1169,1170,1172,1176,1180,1192,1198,1200,1206,1216,1226,1229,1233,1252,1253,1289,1306):
-- their current_stage should equal the preview values (9,4,9,9,1,1,1,9,6,9,8,9,1,9,1,1,9,9,9,9) or higher.
SELECT id, current_stage FROM public.bodyshop_repair_cards
WHERE id IN (524,1076,1165,1169,1170,1172,1176,1180,1192,1198,1200,1206,1216,1226,1229,1233,1252,1253,1289,1306)
ORDER BY id;
