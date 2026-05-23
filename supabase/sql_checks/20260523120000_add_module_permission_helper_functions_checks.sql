-- Read-only verification checks for:
-- supabase/migrations/20260523120000_add_module_permission_helper_functions.sql
--
-- Run in Supabase SQL Editor after migration apply.
-- This script is SELECT-only and safe for verification.

-- 1) Function existence and signatures
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_catalog.format_type(p.prorettype, NULL) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('has_module_view', 'has_module_modify', 'has_module_delete')
ORDER BY p.proname;

-- Expected: 3 rows (text -> boolean)

-- 2) Security and volatility flags
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.prosecdef AS is_security_definer,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
    ELSE p.provolatile::text
  END AS volatility,
  pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('has_module_view', 'has_module_modify', 'has_module_delete')
ORDER BY p.proname;

-- Expected: is_security_definer=true and volatility=STABLE for all 3

-- 3) Execute grants to authenticated role
SELECT
  routine_schema,
  routine_name,
  grantee,
  privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN ('has_module_view', 'has_module_modify', 'has_module_delete')
  AND grantee = 'authenticated'
ORDER BY routine_name, privilege_type;

-- Expected: EXECUTE privilege rows for all 3 functions

-- 4) Dependency helpers exist
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin', 'get_my_permissions')
ORDER BY p.proname;

-- Expected: both helper functions present

-- 5) Smoke-call checks (result value depends on caller permissions)
SELECT public.has_module_view('reports') AS can_view_reports;
SELECT public.has_module_modify('reports') AS can_modify_reports;
SELECT public.has_module_delete('reports') AS can_delete_reports;

-- Expected: queries run without errors and return boolean values
