-- Read-only verification checks for:
-- supabase/migrations/20260724122000_rto_idspay_sync_owner_name_to_first_name.sql

-- 1) refresh function accepts owner_name (6-arg signature)
SELECT pg_get_function_identity_arguments(p.oid) AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'refresh_all_service_data_from_rto_idspay';

-- 2) Trigger watches owner_name
SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.rto_idspay'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_refresh_all_service_data_from_rto_idspay';

-- 3) Smoke: owner-only refresh with non-matching keys (must not error)
SELECT public.refresh_all_service_data_from_rto_idspay(
  p_chassis_key => '__NO_MATCH_CHASSIS__',
  p_registration_key => '__NO_MATCH_REG__',
  p_owner_name => 'Test Owner Full Name'
);
