-- Read-only verification checks for:
-- 20260621142000_all_service_data_dynamic_priority_ordering_layer.sql

-- 1) Priority columns exist.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'all_service_data_dynamic'
  AND column_name IN ('priority_bucket', 'priority_score')
ORDER BY column_name;

-- 2) Composite priority index exists.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'all_service_data_dynamic'
  AND indexname = 'all_service_data_dynamic_priority_idx';

-- 3) Stored bucket parity check.
SELECT COUNT(*) AS priority_bucket_mismatch_rows
FROM public.all_service_data_dynamic d
WHERE d.priority_bucket IS DISTINCT FROM public.calc_all_service_dynamic_priority_bucket(d.sold_dealer);

-- 4) Stored score parity check.
SELECT COUNT(*) AS priority_score_mismatch_rows
FROM public.all_service_data_dynamic d
WHERE d.priority_score IS DISTINCT FROM public.calc_all_service_dynamic_priority_score(
  d.assumed_next_service_date,
  d.assumed_next_service_type
);

-- 5) Sync function includes priority fields.
SELECT
  pg_get_functiondef('public.sync_all_service_data_dynamic()'::regprocedure) ILIKE '%priority_bucket%' AS sync_mentions_priority_bucket,
  pg_get_functiondef('public.sync_all_service_data_dynamic()'::regprocedure) ILIKE '%priority_score%' AS sync_mentions_priority_score;

-- 6) Top-N preview under final contract order.
SELECT
  id,
  sold_dealer,
  assumed_next_service_date,
  assumed_next_service_type,
  priority_bucket,
  priority_score
FROM public.all_service_data_dynamic
ORDER BY priority_bucket ASC, priority_score DESC, id ASC
LIMIT 50;
