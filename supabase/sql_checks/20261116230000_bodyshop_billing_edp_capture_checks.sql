-- Read-only checks for 20261116230000_bodyshop_billing_edp_capture.sql
-- Execution: This file can be run in one go.
-- Note: the SQL editor shows only the last result when run in one go; run each SELECT separately there.

-- Expect: true
SELECT to_regprocedure('public.bodyshop_settlement_can_capture_billing(integer)') IS NOT NULL AS helper_exists_should_be_true;

-- Expect: false / true / true
SELECT has_function_privilege('anon', p.oid, 'execute') AS anon_should_be_false,
       has_function_privilege('authenticated', p.oid, 'execute') AS authenticated_should_be_true,
       has_function_privilege('service_role', p.oid, 'execute') AS service_role_should_be_true
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'bodyshop_settlement_can_capture_billing';

-- Expect: true (header upsert uses the new helper) / 1 overload / 13 args
SELECT pg_get_functiondef(p.oid) LIKE '%bodyshop_settlement_can_capture_billing%' AS upsert_uses_helper_should_be_true,
       (SELECT count(*) FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
         WHERE n2.nspname = 'public' AND p2.proname = 'upsert_bodyshop_settlement_header') AS overloads_should_be_1,
       p.pronargs AS args_should_be_13
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upsert_bodyshop_settlement_header';

-- Expect: true (DMS guard from DBL-0096 preserved)
SELECT pg_get_functiondef(p.oid) LIKE '%differs from the DMS invoice amount%' AS guard_present_should_be_true
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upsert_bodyshop_settlement_header';

-- Expect: false, false (receipt posting still does not use the EDP helper)
SELECT pg_get_functiondef(p.oid) LIKE '%can_capture_billing%' AS should_be_false, p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('bodyshop_settlement_can_post_do', 'bodyshop_settlement_can_post_customer');

-- Informational: active Bodyshop EDP users who gain capture access
SELECT uel.employee_code, em.role
FROM public.user_employee_links uel JOIN public.employee_master em ON em.employee_code = uel.employee_code
WHERE uel.is_active AND public.employee_has_any_business_role(em.role, ARRAY['EDP'])
  AND upper(replace(btrim(COALESCE(em.department, '')), ' ', '')) = 'BODYSHOP';
