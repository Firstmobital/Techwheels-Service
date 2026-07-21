-- Post-migration read-only checks for 20260721110000_fix_technician_tracker_rls_and_platform_admin.sql
-- Run in Supabase SQL editor after applying the migration.

-- 1) Bad policy must not exist
SELECT policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'service_reception_entries'
  AND policyname = 'service_reception_select_bodyshop_card_sa_v1';
-- expect 0 rows

-- 2) Helper exists
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'user_sa_owns_job_card_number';
-- expect 1 row, prosecdef = true

-- 3) is_admin() definition includes super_admin (inspect source)
SELECT pg_get_functiondef('public.is_admin()'::regprocedure);

-- 4) Smoke: income view is queryable as postgres (no RLS); run as authenticated in app
SELECT count(*) AS income_view_rows FROM public.vw_technician_income_assignments LIMIT 1;
