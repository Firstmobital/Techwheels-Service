-- SUPABASE-001 P0-04 Post-Migration Checks
-- Run after:
--   supabase/migrations/20260608182000_p0_04_restrict_anon_public_surface.sql

-- 1) No public/anon policy roles should remain on these table families.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and (
    'anon' = any (roles)
    or 'public' = any (roles)
  )
order by tablename, policyname, cmd;

-- 2) Anon grants on public schema should be reduced.
select
  table_schema,
  table_name,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
order by table_name, privilege_type;

-- 3) Anon function execute grants on public schema should be reduced.
select
  routine_schema,
  routine_name,
  privilege_type,
  is_grantable
from information_schema.routine_privileges
where grantee = 'anon'
  and routine_schema = 'public'
order by routine_name, privilege_type;

-- 4) Summary row for pass/fail comparison.
select
  (select count(*) from pg_policies p where p.schemaname = 'public' and ('anon' = any (p.roles) or 'public' = any (p.roles))) as public_policy_rows,
  (select count(*) from information_schema.role_table_grants g where g.grantee = 'anon' and g.table_schema = 'public') as anon_table_grants,
  (select count(*) from information_schema.routine_privileges r where r.grantee = 'anon' and r.routine_schema = 'public') as anon_function_grants;
