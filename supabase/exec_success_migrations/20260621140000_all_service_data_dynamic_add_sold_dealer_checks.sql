-- Read-only verification checks for:
-- 20260621140000_all_service_data_dynamic_add_sold_dealer.sql

-- 1) Column exists.
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'all_service_data_dynamic'
  AND column_name = 'sold_dealer';

-- 2) Mismatch count between source and dynamic projection.
SELECT COUNT(*) AS sold_dealer_mismatch_rows
FROM public.all_service_data_dynamic d
JOIN public.all_service_data a
  ON a.id = d.id
WHERE d.sold_dealer IS DISTINCT FROM a.sold_dealer;

-- 3) Distribution snapshot in dynamic table.
SELECT
  sold_dealer,
  COUNT(*) AS cnt
FROM public.all_service_data_dynamic
GROUP BY sold_dealer
ORDER BY cnt DESC NULLS LAST;

-- 4) Validate sync function includes sold_dealer projection.
SELECT pg_get_functiondef('public.sync_all_service_data_dynamic()'::regprocedure) ILIKE '%sold_dealer%' AS sync_function_mentions_sold_dealer;
