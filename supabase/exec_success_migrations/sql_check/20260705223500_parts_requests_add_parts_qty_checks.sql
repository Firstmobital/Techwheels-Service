-- Verification checks for 20260705223500_parts_requests_add_parts_qty.sql

-- 1. Column exists
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'parts_requests' and column_name = 'parts_qty';

-- 2. RPC signatures updated (parts_qty param present)
select proname, pronargs, prosecdef
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('parts_request_create', 'parts_request_spm_update');

-- 3. Grants present for authenticated role
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('parts_request_create', 'parts_request_spm_update')
  and grantee = 'authenticated';
