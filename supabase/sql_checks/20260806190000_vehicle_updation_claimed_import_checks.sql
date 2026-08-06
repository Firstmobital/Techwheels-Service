-- IMPORT-003-P3 checks: Updation Claimed upload removes pending rows by chassis.

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vehicle_updation_uploads'
  AND column_name = 'upload_kind';

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'apply_vehicle_updation_claimed_portal',
    'replace_vehicle_updation_portal'
  )
ORDER BY p.proname;

SELECT
  upload_kind,
  COUNT(*) AS upload_count
FROM public.vehicle_updation_uploads
GROUP BY upload_kind
ORDER BY upload_kind;

SELECT
  portal,
  COUNT(*) AS pending_rows
FROM public.vehicle_updation_data
GROUP BY portal
ORDER BY portal;

SELECT
  COUNT(*) FILTER (WHERE has_updation_available) AS flagged_reception_rows,
  COUNT(*) AS total_reception_rows
FROM public.service_reception_entries;
