-- Read-only verification checks for:
-- supabase/migrations/20260722180000_rto_idspay_all_service_data_insurance_sync.sql

-- 1) Audit columns on all_service_data
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'all_service_data'
  AND column_name IN ('updated_by_rtoids', 'updated_by_rtoids_at')
ORDER BY column_name;

-- 2) Functions exist
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'refresh_all_service_data_from_rto_idspay',
    'trg_refresh_all_service_data_from_rto_idspay',
    'reconcile_all_service_data_from_rto_idspay_chunked'
  )
ORDER BY p.proname;

-- 3) Trigger on rto_idspay
SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.rto_idspay'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_refresh_all_service_data_from_rto_idspay';

-- 4) Smoke: no-op refresh with non-matching keys (must not error)
SELECT public.refresh_all_service_data_from_rto_idspay(
  p_chassis_key => '__NO_MATCH_CHASSIS__',
  p_registration_key => '__NO_MATCH_REG__',
  p_insurance_company => 'Test Co',
  p_insurance_upto => '01-01-2099',
  p_insurance_policy_number => 'TESTPOL'
);

-- 5) Optional: rows synced from IDSPay (run after backfill / live RC lookup)
SELECT
  count(*) FILTER (WHERE updated_by_rtoids IS TRUE) AS rows_with_rtoids_flag,
  count(*) AS total_rows
FROM public.all_service_data;
