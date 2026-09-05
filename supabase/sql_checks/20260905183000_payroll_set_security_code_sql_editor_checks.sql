-- Read-only / structural verification for:
-- supabase/migrations/20260905183000_payroll_set_security_code_sql_editor.sql
-- Execution: This file can be run in one go.

SELECT
  pg_get_functiondef('public.payroll_set_security_code(text)'::regprocedure)
    LIKE '%is_admin()%' AS still_checks_app_admin,
  pg_get_functiondef('public.payroll_set_security_code(text)'::regprocedure)
    LIKE '%NOT v_has_jwt%' AS allows_sql_editor_no_jwt,
  pg_get_functiondef('public.payroll_set_security_code(text)'::regprocedure)
    LIKE '%service_role%' AS allows_service_role,
  pg_get_functiondef('public.payroll_set_security_code(text)'::regprocedure)
    NOT LIKE '%IF NOT public.is_admin() THEN%' AS no_admin_only_gate;
