-- SUPABASE-001 P0-04 Validation Checks
-- Purpose: capture anon exposure surface before and after dashboard permission tightening.
-- Run this file twice:
--   1) BEFORE changing API/anon permissions in dashboard
--   2) AFTER changing API/anon permissions in dashboard

-- 1) Policies that still include anon/public role paths on public schema tables.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and (
    'anon' = any (roles)
    or 'public' = any (roles)
  )
order by tablename, policyname, cmd;

-- 2) Direct table/view grants to anon on public schema.
select
  table_schema,
  table_name,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
order by table_name, privilege_type;

-- 3) Function execute grants to anon in public schema.
select
  routine_schema,
  routine_name,
  privilege_type,
  is_grantable
from information_schema.routine_privileges
where grantee = 'anon'
  and routine_schema = 'public'
order by routine_name, privilege_type;

-- 4) Helper: count summary for quick before/after diff.
select
  (select count(*) from pg_policies p where p.schemaname = 'public' and ('anon' = any (p.roles) or 'public' = any (p.roles))) as public_policy_rows,
  (select count(*) from information_schema.role_table_grants g where g.grantee = 'anon' and g.table_schema = 'public') as anon_table_grants,
  (select count(*) from information_schema.routine_privileges r where r.grantee = 'anon' and r.routine_schema = 'public') as anon_function_grants;
