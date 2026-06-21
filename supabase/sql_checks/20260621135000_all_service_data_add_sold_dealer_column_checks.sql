-- Read-only verification checks for:
-- 20260621135000_all_service_data_add_sold_dealer_column.sql

-- 1) Column exists with expected type.
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'all_service_data'
  AND column_name = 'sold_dealer';

-- 2) CHECK constraint exists.
SELECT
  c.conname,
  pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
WHERE c.conrelid = 'public.all_service_data'::regclass
  AND c.conname = 'all_service_data_sold_dealer_chk';

-- 3) Data quality snapshot.
SELECT
  COUNT(*) AS total_rows,
  SUM(CASE WHEN sold_dealer = 'Techwheels' THEN 1 ELSE 0 END) AS techwheels_rows,
  SUM(CASE WHEN sold_dealer = 'Others' THEN 1 ELSE 0 END) AS others_rows,
  SUM(CASE WHEN sold_dealer IS NULL THEN 1 ELSE 0 END) AS null_rows
FROM public.all_service_data;

-- 4) Should be zero; catches any unexpected values if constraint was bypassed historically.
SELECT
  sold_dealer,
  COUNT(*) AS cnt
FROM public.all_service_data
WHERE sold_dealer IS NOT NULL
  AND sold_dealer NOT IN ('Techwheels', 'Others')
GROUP BY sold_dealer
ORDER BY cnt DESC;
