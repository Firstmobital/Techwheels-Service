-- Read-only validation checks for Step 2 dynamic-table alignment:
-- supabase/migrations/20260622200000_all_service_data_dynamic_inplace_type_alignment_and_sync.sql
--
-- Run sequence:
-- - Run Section A before migration (baseline type snapshot).
-- - Apply migration 20260622200000.
-- - Run Sections B+C+D+E for post-apply verification.

-- ============================================================
-- A) Baseline type snapshot (source vs dynamic)
-- ============================================================

WITH src AS (
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'all_service_data'
    AND column_name IN (
      'vehicle_sale_date',
      'scheduled_next_service_date',
      'last_service_date'
    )
), dyn AS (
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'all_service_data_dynamic'
    AND column_name IN (
      'vehicle_sale_date',
      'scheduled_next_service_date',
      'last_service_date'
    )
)
SELECT
  coalesce(src.column_name, dyn.column_name) AS column_name,
  src.data_type AS source_type,
  dyn.data_type AS dynamic_type,
  CASE WHEN src.data_type = dyn.data_type THEN true ELSE false END AS type_match
FROM src
FULL OUTER JOIN dyn USING (column_name)
ORDER BY column_name;

-- ============================================================
-- B) Post-apply type parity (must all be true)
-- ============================================================

WITH src AS (
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'all_service_data'
    AND column_name IN (
      'vehicle_sale_date',
      'scheduled_next_service_date',
      'last_service_date'
    )
), dyn AS (
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'all_service_data_dynamic'
    AND column_name IN (
      'vehicle_sale_date',
      'scheduled_next_service_date',
      'last_service_date'
    )
)
SELECT
  coalesce(src.column_name, dyn.column_name) AS column_name,
  src.data_type AS source_type,
  dyn.data_type AS dynamic_type,
  CASE WHEN src.data_type = dyn.data_type THEN true ELSE false END AS type_match
FROM src
FULL OUTER JOIN dyn USING (column_name)
ORDER BY column_name;

-- ============================================================
-- C) Post-apply value parity by id (aligned columns)
-- ============================================================

SELECT
  count(*) AS joined_rows,
  count(*) FILTER (
    WHERE d.vehicle_sale_date IS DISTINCT FROM s.vehicle_sale_date
  ) AS vehicle_sale_date_mismatch,
  count(*) FILTER (
    WHERE d.scheduled_next_service_date IS DISTINCT FROM s.scheduled_next_service_date
  ) AS scheduled_next_service_date_mismatch,
  count(*) FILTER (
    WHERE d.last_service_date IS DISTINCT FROM s.last_service_date
  ) AS last_service_date_mismatch
FROM public.all_service_data_dynamic d
JOIN public.all_service_data s
  ON s.id = d.id;

-- ============================================================
-- D) Sample mismatches (should be empty or explainable)
-- ============================================================

SELECT
  d.id,
  s.vehicle_sale_date AS src_vehicle_sale_date,
  d.vehicle_sale_date AS dyn_vehicle_sale_date,
  s.scheduled_next_service_date AS src_scheduled_next_service_date,
  d.scheduled_next_service_date AS dyn_scheduled_next_service_date,
  s.last_service_date AS src_last_service_date,
  d.last_service_date AS dyn_last_service_date
FROM public.all_service_data_dynamic d
JOIN public.all_service_data s
  ON s.id = d.id
WHERE
  d.vehicle_sale_date IS DISTINCT FROM s.vehicle_sale_date
  OR d.scheduled_next_service_date IS DISTINCT FROM s.scheduled_next_service_date
  OR d.last_service_date IS DISTINCT FROM s.last_service_date
ORDER BY d.id DESC
LIMIT 50;

-- ============================================================
-- E) Trigger/function sanity after migration
-- ============================================================

SELECT
  tgname,
  pg_get_triggerdef(oid) AS trigger_def
FROM pg_trigger
WHERE tgrelid = 'public.all_service_data'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_sync_all_service_data_dynamic';

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) AS function_def
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'sync_all_service_data_dynamic'
ORDER BY p.oid DESC
LIMIT 1;
