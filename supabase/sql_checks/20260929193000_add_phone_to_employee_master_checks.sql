-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Validation for 20260929193000_add_phone_to_employee_master.sql

-- 1. Verify phone column exists on employee_master
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'employee_master'
  and column_name = 'phone';

-- 2. Verify functions exist with correct permissions
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('customer_collect_vehicles', 'customer_get_repair_card')
order by p.proname;
