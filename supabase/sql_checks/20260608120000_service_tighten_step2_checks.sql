-- SUPABASE-001 P0-03 Step 2 Validation Checks
-- Run after executing:
--   supabase/migrations/20260608120000_p0_step2_service_tighten_delete_policy.sql

-- 1) Confirm tightened DELETE policy on service reporting tables.
select
  tablename,
  policyname,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and policyname = 'p0_auth_delete'
  and tablename in (
    'service_vas_jc_data',
    'service_jc_parts_data',
    'service_invoice_data',
    'service_invoice_order_data'
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
    'service_vas_jc_data',
    'service_jc_parts_data',
    'service_invoice_data',
    'service_invoice_order_data'
  )
  and policyname in ('p0_auth_select', 'p0_auth_insert', 'p0_auth_update')
order by tablename, policyname;

-- 3) Confirm RLS remains enabled on all service tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'service_vas_jc_data',
    'service_jc_parts_data',
    'service_invoice_data',
    'service_invoice_order_data'
  )
order by c.relname;
