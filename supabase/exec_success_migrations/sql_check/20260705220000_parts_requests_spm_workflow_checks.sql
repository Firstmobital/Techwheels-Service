-- Verification checks for 20260705220000_parts_requests_spm_workflow.sql

-- 1. Table + check constraint exist
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'parts_requests'
order by ordinal_position;

-- 2. RLS enabled + policies present
select relrowsecurity from pg_class where relname = 'parts_requests';

select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'parts_requests'
order by policyname;

-- 3. Module row registered
select id, name, label, route, is_active from public.modules where name = 'parts_spm';

-- 4. RPCs exist with SECURITY DEFINER
select proname, prosecdef
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'parts_request_create',
    'parts_request_update_advisor_fields',
    'parts_request_spm_update',
    'parts_request_mark_seen',
    'parts_request_mark_all_seen'
  );
