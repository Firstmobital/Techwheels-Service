-- Read-only verification checks for:
-- supabase/migrations/20260904140000_employee_master_active_and_salary_type_save.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Lifecycle column
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employee_master'
  AND column_name = 'is_active';
-- Expect 1 row: boolean, NO, default true

-- 2) Existing employees remain active
SELECT count(*) FILTER (WHERE is_active IS NOT TRUE) AS inactive_count,
       count(*) FILTER (WHERE is_active IS TRUE) AS active_count
FROM public.employee_master;
-- Expect inactive_count = 0 immediately after apply

-- 3) RPCs exist
SELECT to_regprocedure('public.payroll_save_salary_type_master(text,text,text,text,text,text,numeric,text)') IS NOT NULL
  AS has_save_rpc,
       to_regprocedure('public.payroll_set_employee_active(text,boolean)') IS NOT NULL
  AS has_lifecycle_rpc;

-- 4) Functions are SECURITY DEFINER and check is_admin
SELECT p.proname, prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('payroll_save_salary_type_master', 'payroll_set_employee_active')
ORDER BY p.proname;
-- Expect security_definer = true

SELECT pg_get_functiondef(p.oid) LIKE '%is_admin()%' AS mentions_is_admin
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'payroll_save_salary_type_master';

-- 5) employee_master UPDATE RLS still admin-only (no payroll-modify widening)
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'employee_master'
  AND cmd = 'UPDATE';

-- 6) account_number remains text
SELECT data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employee_master'
  AND column_name = 'account_number';
-- Expect text

-- 7) Payroll snapshot columns still present (Implementation A)
SELECT count(*) AS snapshot_column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_entries'
  AND column_name IN (
    'employee_name_snapshot', 'department_snapshot', 'branch_snapshot',
    'role_snapshot', 'bank_name_snapshot', 'account_number_snapshot', 'ifsc_snapshot'
  );
-- Expect 7
