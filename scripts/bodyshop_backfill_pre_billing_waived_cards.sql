-- After 20261120140000 + 20261120150000 (S9 guard bypass): re-reconcile + recompute every card with pre-billing waiver.
-- Run in SQL Editor (service role / postgres). Preview first.

SELECT id, job_card_no, current_stage, billed_amount, do_payment_status, customer_payment_status
FROM public.bodyshop_repair_cards
WHERE pre_billing_stages_waived_at IS NOT NULL
  AND overall_status = 'active'
ORDER BY id;

-- Batch (uncomment to execute):
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN
--     SELECT id FROM public.bodyshop_repair_cards
--     WHERE pre_billing_stages_waived_at IS NOT NULL AND overall_status = 'active'
--   LOOP
--     PERFORM public.bodyshop_reconcile_repair_card_current_stage(r.id);
--     PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(r.id, 1, 18, 'waiver_backfill');
--   END LOOP;
-- END $$;