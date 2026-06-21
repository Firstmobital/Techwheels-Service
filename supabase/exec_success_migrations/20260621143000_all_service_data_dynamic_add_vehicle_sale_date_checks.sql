-- Read-only verification checks for:
-- 20260621143000_all_service_data_dynamic_add_vehicle_sale_date.sql

-- 1) Column exists in dynamic table.
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'all_service_data_dynamic'
  AND column_name = 'vehicle_sale_date';

-- 2) Source vs dynamic mismatch count by id.
SELECT COUNT(*) AS vehicle_sale_date_mismatch_rows
FROM public.all_service_data_dynamic d
JOIN public.all_service_data a
  ON a.id = d.id
WHERE d.vehicle_sale_date IS DISTINCT FROM a.vehicle_sale_date;

-- 3) Sync function definition includes vehicle_sale_date.
SELECT
  pg_get_functiondef('public.sync_all_service_data_dynamic()'::regprocedure) ILIKE '%vehicle_sale_date%' AS sync_mentions_vehicle_sale_date;

-- 4) Top ordered preview with vehicle_sale_date.
SELECT
  id,
  sold_dealer,
  vehicle_sale_date,
  assumed_next_service_date,
  assumed_next_service_type,
  priority_bucket,
  priority_score
FROM public.all_service_data_dynamic
ORDER BY priority_bucket ASC, priority_score DESC, id ASC
LIMIT 50;
