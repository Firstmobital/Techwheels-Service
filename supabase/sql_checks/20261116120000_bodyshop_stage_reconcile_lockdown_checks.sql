-- Read-only checks for 20261116120000_bodyshop_stage_reconcile_lockdown.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

SELECT has_function_privilege('anon', 'public.bodyshop_reconcile_repair_card_current_stage(integer)', 'execute')
  AS anon_can_execute_should_be_false;

SELECT has_function_privilege('authenticated', 'public.bodyshop_reconcile_repair_card_current_stage(integer)', 'execute')
  AS authenticated_can_execute_should_be_false;

SELECT has_function_privilege('service_role', 'public.bodyshop_reconcile_repair_card_current_stage(integer)', 'execute')
  AS service_role_can_execute_should_be_true;

SELECT p.prosecdef AS card_trigger_fn_security_definer_should_be_true
FROM pg_proc p
WHERE p.oid = 'public.trg_bodyshop_stage_worklist_projection_card_change()'::regprocedure;

SELECT p.prosecdef AS assignment_trigger_fn_security_definer_should_be_true
FROM pg_proc p
WHERE p.oid = 'public.trg_bodyshop_stage_worklist_projection_assignment_change()'::regprocedure;

SELECT (pg_get_functiondef('public.bodyshop_reconcile_repair_card_current_stage(integer)'::regprocedure)
        LIKE '%ba.repair_card_id IS NULL AND v_jc%')
  AS reconcile_matches_job_card_only_when_card_id_null_should_be_true;

SELECT count(*) AS card_change_trigger_present_should_be_1
FROM pg_trigger
WHERE tgname = 'trg_bodyshop_stage_worklist_projection_card_change'
  AND NOT tgisinternal;
