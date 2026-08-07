-- Post-apply checks for 20260807120000_fix_sa_save_reception_entry_timeout.sql

-- 1) SA save RPC exists and is SECURITY DEFINER
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_save_reception_entry';

-- 2) Sync trigger function is SECURITY DEFINER
SELECT
  p.proname,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'sync_reception_jc_to_legacy_technician_assignments';

-- 3) Trigger still wired on jc_number updates
SELECT tgname, pg_get_triggerdef(oid) AS trigger_def
FROM pg_trigger
WHERE tgrelid = 'public.service_reception_entries'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_sync_reception_jc_to_technician_assignments';

-- 4) authenticated can execute SA save RPC
SELECT has_function_privilege(
  'authenticated',
  'public.service_advisor_save_reception_entry(bigint, text, text, integer, text)',
  'EXECUTE'
) AS authenticated_can_execute;
