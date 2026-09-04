-- Read-only verification checks for:
-- supabase/migrations/20260904160000_payroll_create_salary_type_employee.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) RPC exists
SELECT to_regprocedure(
  'public.payroll_create_salary_type_employee(text,text,text,text,text,text,text,text,text,numeric,text)'
) IS NOT NULL AS has_create_rpc;
-- Expect true

-- 2) SECURITY DEFINER + is_admin gate
SELECT p.proname, prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'payroll_create_salary_type_employee';
-- Expect security_definer = true

SELECT pg_get_functiondef(p.oid) LIKE '%is_admin()%' AS mentions_is_admin
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'payroll_create_salary_type_employee';
-- Expect true

-- 3) employee_master INSERT RLS still admin-only (no payroll-modify widening)
SELECT policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'employee_master'
  AND cmd = 'INSERT';

-- 4) Save RPC remains update-only (not overloaded for create)
SELECT pg_get_functiondef(p.oid) LIKE '%Employee not found%' AS save_rpc_still_requires_existing
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'payroll_save_salary_type_master';
-- Expect true

-- 5) New employees still default active
SELECT column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employee_master'
  AND column_name = 'is_active';
-- Expect true (boolean default)
