-- Paired checks for 20261120110000_bodyshop_admin_pre_billing_stage_waiver.sql

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bodyshop_repair_cards'
  AND column_name IN ('pre_billing_stages_waived_at', 'pre_billing_stages_waived_by');

SELECT has_function_privilege(
  'authenticated',
  'public.bodyshop_admin_waive_pre_billing_stages(integer)',
  'execute'
) AS authenticated_may_execute;

SELECT pg_get_functiondef('public.recompute_bodyshop_stage_worklist_projection_for_card(integer, integer, integer, text)'::regprocedure)
  LIKE '%v_pre_billing_waived%'
  AS recompute_has_waiver_logic;