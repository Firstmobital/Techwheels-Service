-- SUPABASE-001 P0-03 Step 3 Validation Checks
-- Run after executing:
--   supabase/migrations/20260608123000_p0_step3_import_recon_tighten_delete_policy.sql

-- 1) Confirm tightened DELETE policy text on Step 3 tables.
select
  tablename,
  policyname,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and policyname = 'p0_auth_delete'
  and tablename in (
    'import_employee_mapping_issues',
    'pending_drive_uploads',
    'open_job_cards_import_staging'
  )
order by tablename;

-- 2) Confirm SELECT/INSERT/UPDATE baseline policies still exist.
select
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'import_employee_mapping_issues',
    'pending_drive_uploads',
    'open_job_cards_import_staging'
  )
  and policyname in ('p0_auth_select', 'p0_auth_insert', 'p0_auth_update')
order by tablename, policyname;

-- 3) Confirm RLS remains enabled on all Step 3 tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'import_employee_mapping_issues',
    'pending_drive_uploads',
    'open_job_cards_import_staging'
  )
order by c.relname;
