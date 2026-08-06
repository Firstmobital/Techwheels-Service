-- IMPORT-003 vehicle updation import checks
-- Run after: supabase/migrations/20260806170000_vehicle_updation_import.sql

-- 1) Tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('vehicle_updation_data', 'vehicle_updation_uploads')
ORDER BY table_name;
-- Expect 2 rows

-- 2) Core columns on vehicle_updation_data
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vehicle_updation_data'
  AND column_name IN (
    'portal', 'updation_code', 'chassis_no', 'vehicle_number', 'contact_number',
    'campaign_cost', 'upload_session_id', 'source_row_data', 'imported_at'
  )
ORDER BY column_name;
-- Expect 9 rows

-- 3) Unique constraint on portal + chassis + updation_code
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.vehicle_updation_data'::regclass
  AND contype = 'u';
-- Expect vehicle_updation_data_portal_chassis_code_key

-- 4) RPC exists
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'replace_vehicle_updation_portal';
-- Expect 1 row

-- 5) RLS enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('vehicle_updation_data', 'vehicle_updation_uploads');
-- Expect relrowsecurity = true for both

-- 6) Row counts (informational)
SELECT
  (SELECT COUNT(*) FROM public.vehicle_updation_data) AS vehicle_updation_data_row_count,
  (SELECT COUNT(*) FROM public.vehicle_updation_uploads) AS vehicle_updation_uploads_row_count;
