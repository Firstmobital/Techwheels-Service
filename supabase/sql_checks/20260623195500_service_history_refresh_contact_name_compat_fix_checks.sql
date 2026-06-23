-- Read-only verification checks for:
-- supabase/migrations/20260623195500_service_history_refresh_contact_name_compat_fix.sql

-- 1) Function definition includes compatibility extraction keys.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  position('contact_full_name' in pg_get_functiondef(p.oid)) > 0 AS has_contact_full_name_key,
  position('conatct_full_name' in pg_get_functiondef(p.oid)) > 0 AS has_conatct_full_name_key,
  position('to_jsonb(h) ->>' in pg_get_functiondef(p.oid)) > 0 AS uses_jsonb_column_compat
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'refresh_all_service_data_from_service_history'
  AND pg_get_function_identity_arguments(p.oid) = 'p_chassis_key text';

-- 2) Source table column audit for contact-name drift.
SELECT
  table_name,
  MAX(CASE WHEN column_name = 'contact_full_name' THEN 1 ELSE 0 END) AS has_contact_full_name,
  MAX(CASE WHEN column_name = 'conatct_full_name' THEN 1 ELSE 0 END) AS has_conatct_full_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('EV_service_history_test', 'PV_service_history_test')
GROUP BY table_name
ORDER BY table_name;

-- 3) Smoke test: function executes for known chassis without column errors.
SELECT public.refresh_all_service_data_from_service_history('MAT626242KKH53850') AS executed_ok;
