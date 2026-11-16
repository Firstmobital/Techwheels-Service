-- Read-only checks for 20261116170000_bodyshop_stage_pointer_follows_billing.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Note: the SQL editor shows only the last result when run in one go; run each SELECT separately there.

-- Expect: true
SELECT to_regclass('public.bodyshop_repair_card_stage_history') IS NOT NULL AS history_table_exists_should_be_true;

-- Expect: 1
SELECT count(*) AS history_trigger_present_should_be_1 FROM pg_trigger
WHERE tgname = 'trg_bodyshop_stage_history' AND NOT tgisinternal;

-- Expect: true (billing columns are in the card trigger column list)
SELECT pg_get_triggerdef(t.oid) LIKE '%customer_payment_status%' AS card_trigger_has_billing_cols_should_be_true
FROM pg_trigger t WHERE t.tgname = 'trg_bodyshop_stage_worklist_projection_card_change' AND NOT t.tgisinternal;

-- Expect: true
SELECT pg_get_functiondef('public.bodyshop_reconcile_repair_card_current_stage(integer)'::regprocedure) LIKE '%v_do_received%'
  AS reconcile_has_billing_step_should_be_true;

-- Expect: false / false / true (lockdown from 20261116120000 still in force)
SELECT has_function_privilege('anon', 'public.bodyshop_reconcile_repair_card_current_stage(integer)', 'execute') AS anon_should_be_false,
       has_function_privilege('authenticated', 'public.bodyshop_reconcile_repair_card_current_stage(integer)', 'execute') AS authenticated_should_be_false,
       has_function_privilege('service_role', 'public.bodyshop_reconcile_repair_card_current_stage(integer)', 'execute') AS service_role_should_be_true;

-- Expect: one baseline row per active card (should equal the active card count), none missing.
SELECT (SELECT count(*) FROM public.bodyshop_repair_cards WHERE overall_status = 'active') AS active_cards,
       (SELECT count(*) FROM public.bodyshop_repair_card_stage_history WHERE source = 'baseline') AS baseline_rows;

-- Expect: matches preview QUERY 1 "would_change" total.
SELECT count(*) AS pointers_moved_by_backfill FROM public.bodyshop_repair_card_stage_history
WHERE source = 'reconcile' AND reason = 'backfill_2026-11-16';

-- Expect: 0 rows. No active card with pointer >= 15 and billing/payment data should still sit below its rule.
SELECT b.id, b.current_stage FROM public.bodyshop_repair_cards b
WHERE b.overall_status = 'active' AND b.current_stage >= 15 AND b.current_stage <> 17
  AND (
    ((lower(btrim(COALESCE(b.do_status,''))) = 'received' AND b.do_amount IS NOT NULL)
      OR lower(btrim(COALESCE(b.do_payment_status,''))) IN ('partial','received')
      OR lower(btrim(COALESCE(b.customer_payment_status,''))) IN ('partial','received')) AND b.current_stage < 18
    OR (lower(btrim(COALESCE(b.parts_entry_status,''))) = 'billed' AND b.billed_amount IS NOT NULL AND b.current_stage < 16)
  );
