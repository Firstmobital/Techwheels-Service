-- Plan: SUPABASE-002 follow-up
-- Read-only checks after pruning all_service_data_dynamic columns.

-- 1) Confirm only required columns exist in target table.
SELECT
  c.ordinal_position,
  c.column_name,
  c.data_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'all_service_data_dynamic'
ORDER BY c.ordinal_position;

-- 2) Column count should be 8.
SELECT COUNT(*) AS dynamic_column_count
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'all_service_data_dynamic';

-- 3) Parity count against predicate should still hold.
SELECT
  (SELECT COUNT(*) FROM public.all_service_data a WHERE public.is_all_service_dynamic_match(a)) AS expected_count,
  (SELECT COUNT(*) FROM public.all_service_data_dynamic d) AS actual_count;

-- 4) Mismatch checks should return zero rows.
SELECT a.id
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a)
EXCEPT
SELECT d.id
FROM public.all_service_data_dynamic d;

SELECT d.id
FROM public.all_service_data_dynamic d
EXCEPT
SELECT a.id
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);
