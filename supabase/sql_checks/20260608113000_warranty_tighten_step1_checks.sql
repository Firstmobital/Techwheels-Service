-- SUPABASE-001 P0-03 Step 1 Validation Checks
-- Run after executing:
--   supabase/migrations/20260608113000_p0_step1_warranty_tighten_delete_policy.sql

-- 1) Confirm tightened DELETE policy on all warranty tables.
select
  tablename,
  policyname,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and policyname = 'p0_auth_delete'
  and tablename in (
    'warranty_claim_settlement_report_data',
    'warranty_part_wc_data',
    'warranty_updation_claim_data',
    'warranty_goodwill_data',
    'warranty_amc_data',
    'warranty_fsb_data',
    'warranty_wc_data'
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
    'warranty_claim_settlement_report_data',
    'warranty_part_wc_data',
    'warranty_updation_claim_data',
    'warranty_goodwill_data',
    'warranty_amc_data',
    'warranty_fsb_data',
    'warranty_wc_data'
  )
  and policyname in ('p0_auth_select', 'p0_auth_insert', 'p0_auth_update')
order by tablename, policyname;

-- 3) Confirm Security Advisor hard errors remain zero (proxy check via RLS enabled).
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'warranty_claim_settlement_report_data',
    'warranty_part_wc_data',
    'warranty_updation_claim_data',
    'warranty_goodwill_data',
    'warranty_amc_data',
    'warranty_fsb_data',
    'warranty_wc_data'
  )
order by c.relname;
