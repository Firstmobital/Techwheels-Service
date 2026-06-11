-- SUPABASE-002 Phase 3 checks: bodyshop RBAC + grant hardening

-- 1) Policy expression snapshot for bodyshop tables
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  p.polname AS policy_name,
  p.polcmd AS policy_cmd,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('bodyshop_assignments', 'bodyshop_repair_cards')
ORDER BY c.relname, p.polname;

-- 2) Guard check: no permissive true predicates remain on targeted assignment policies
SELECT
  c.relname AS table_name,
  p.polname AS policy_name,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'bodyshop_assignments'
  AND p.polname IN ('bodyshop_assignments_read', 'bodyshop_assignments_insert', 'bodyshop_assignments_update')
  AND (
    coalesce(pg_get_expr(p.polqual, p.polrelid), '') = 'true'
    OR coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') = 'true'
  );
-- Expected: 0 rows

-- 3) Anon grant surface should be removed for bodyshop tables
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('bodyshop_assignments', 'bodyshop_repair_cards')
  AND grantee = 'anon'
ORDER BY table_name, privilege_type;
-- Expected: 0 rows

-- 4) Anon grant surface should be removed for bodyshop sequences
SELECT object_schema, object_name, grantee, privilege_type
FROM information_schema.role_usage_grants
WHERE object_schema = 'public'
  AND object_name IN ('bodyshop_assignments_id_seq', 'bodyshop_repair_cards_id_seq')
  AND grantee = 'anon'
ORDER BY object_name, privilege_type;
-- Expected: 0 rows

-- 5) Anon execute grant should be removed from bodyshop helper function
SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'update_bodyshop_assignments_updated_at'
  AND grantee = 'anon';
-- Expected: 0 rows
