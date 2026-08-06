-- IMPORT-003-P2A checks: reception updation available flags
-- Run after: supabase/migrations/20260806180000_reception_updation_available_flag.sql

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'service_reception_entries'
  AND column_name IN ('has_updation_available', 'updation_code', 'updation_name')
ORDER BY column_name;
-- Expect 3 rows

SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'lookup_updation_for_reg',
    'get_reception_updation_context',
    'refresh_reception_updation_flags'
  )
ORDER BY p.proname;
-- Expect 3 rows

SELECT
  COUNT(*) FILTER (WHERE has_updation_available) AS flagged_reception_rows,
  COUNT(*) AS total_reception_rows
FROM public.service_reception_entries;
