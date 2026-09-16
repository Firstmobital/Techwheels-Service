-- Read-only verification for 20260916120000_mobile_011_customer_sessions.sql
-- MOBILE-011 Phase 1

-- 1) tables present
SELECT to_regclass('public.customer_profiles') AS customer_profiles_should_be_present;
SELECT to_regclass('public.customer_sessions') AS customer_sessions_should_be_present;
SELECT to_regclass('public.customer_auth_attempts') AS customer_auth_attempts_should_be_present;

-- 2) users.role CHECK unchanged
SELECT pg_get_constraintdef(oid) AS users_role_check_should_exclude_customer
FROM pg_constraint
WHERE conname = 'users_role_check';

-- 3) RLS enabled, no anon table grants
SELECT c.relname, c.relrowsecurity AS rls_should_be_true
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('customer_profiles', 'customer_sessions', 'customer_auth_attempts')
ORDER BY c.relname;

-- all_service_data anon grants are dump truth (leave as-is; product decision 2026-09-16).
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND table_name IN (
    'customer_profiles',
    'customer_sessions',
    'customer_auth_attempts',
    'service_reception_entries',
    'vehicles',
    'bodyshop_repair_cards'
  )
ORDER BY table_name, privilege_type;

-- 4) public select policy on reception must be gone
SELECT polname
FROM pg_policy
WHERE polrelid = 'public.service_reception_entries'::regclass
  AND polname = 'Allow public select service_reception_entries';

-- 5) start-session executable by anon
SELECT has_function_privilege('anon', 'public.customer_start_session(text,text)', 'execute')
  AS anon_can_start_session_should_be_true;

-- 6) helpers not granted to anon (must be false after 20260916121500)
SELECT has_function_privilege('anon', 'public.customer_collect_vehicles(text)', 'execute')
  AS anon_collect_vehicles_should_be_false;
SELECT has_function_privilege('anon', 'public.customer_require_session(text)', 'execute')
  AS anon_require_session_should_be_false;
SELECT has_function_privilege('anon', 'public.customer_start_session(text,text)', 'execute')
  AS anon_can_start_session_still_true;
