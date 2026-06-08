-- SUPABASE-001 P0-03 Step 4 Validation Checks
-- Run after executing:
--   supabase/migrations/20260608130000_p0_step4_operational_staging_tighten_delete_policy.sql

-- 1) Confirm tightened DELETE policy text on Step 4 tables.
select
  tablename,
  policyname,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and policyname = 'p0_auth_delete'
  and tablename in (
    'cancel_job_card',
    'closed_but_not_invoiced',
    'open_job_cards',
    'job_card_closed_data_duplicates_backup'
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
    'cancel_job_card',
    'closed_but_not_invoiced',
    'open_job_cards',
    'job_card_closed_data_duplicates_backup'
  )
  and policyname in ('p0_auth_select', 'p0_auth_insert', 'p0_auth_update')
order by tablename, policyname;

-- 3) Confirm RLS remains enabled on all Step 4 tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'cancel_job_card',
    'closed_but_not_invoiced',
    'open_job_cards',
    'job_card_closed_data_duplicates_backup'
  )
order by c.relname;
