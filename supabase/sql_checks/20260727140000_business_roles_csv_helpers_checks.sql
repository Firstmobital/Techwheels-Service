-- RBAC-003 post-apply checks (run in Supabase SQL Editor after 20260727140000)
-- All should pass; failures mean migration did not apply fully.

-- 1) Helpers exist
SELECT
  to_regprocedure('public.normalize_business_role_token(text)') IS NOT NULL AS has_normalize,
  to_regprocedure('public.employee_business_roles(text)') IS NOT NULL AS has_parse,
  to_regprocedure('public.employee_has_business_role(text,text)') IS NOT NULL AS has_has_role,
  to_regprocedure('public.employee_has_any_business_role(text,text[])') IS NOT NULL AS has_has_any;

-- 2) Parse vectors (PAINTER,RUBBING test case)
SELECT public.employee_business_roles('PAINTER,RUBBING') AS painter_rubbing;
-- expect: {PAINTER,RUBBING}

SELECT public.employee_business_roles('SA, CRM') AS sa_crm;
-- expect: {CRM,SA} (order may vary)

SELECT public.employee_has_business_role('PAINTER,RUBBING', 'PAINTER') AS painter_match,
       public.employee_has_business_role('PAINTER,RUBBING', 'RUBBING') AS rubbing_match,
       public.employee_has_business_role('PAINTER,RUBBING', 'DENTOR') AS dentor_miss;
-- expect: true, true, false

SELECT public.employee_has_business_role('SA, CRM', 'CRM') AS csv_crm;
-- expect: true

-- 3) Aliases
SELECT public.employee_has_business_role('Service Advisor, CRM', 'SA') AS alias_sa;
-- expect: true

-- 4) Live employee row (adjust code if needed)
SELECT employee_code, role,
       public.employee_business_roles(role) AS parsed
FROM public.employee_master
WHERE employee_code = '3000840_427';
