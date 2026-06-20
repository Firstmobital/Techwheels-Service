-- Plan: SUPABASE-002
-- Read-only verification checks for all_service_data dynamic condition.
-- Condition: chassis_no is present and all non-technical columns are NULL.
-- Technical columns excluded from null-check: id, chassis_no, created_at, last_updated_at.

-- 1) Count rows in source table that match the condition.
SELECT COUNT(*) AS matching_rows_in_all_service_data
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);

-- 2) Return a yes/no flag and count to answer "does at least one row exist?"
SELECT
  EXISTS (
    SELECT 1
    FROM public.all_service_data a
    WHERE public.is_all_service_dynamic_match(a)
  ) AS exists_matching_row,
  (
    SELECT COUNT(*)
    FROM public.all_service_data a
    WHERE public.is_all_service_dynamic_match(a)
  ) AS matching_count;

-- 3) Show up to 20 sample rows that match.
SELECT a.*
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a)
ORDER BY a.id DESC
LIMIT 20;

-- 4) Optional: parity check against dynamic table (should be equal after migration run).
SELECT
  (SELECT COUNT(*) FROM public.all_service_data a WHERE public.is_all_service_dynamic_match(a)) AS expected_count,
  (SELECT COUNT(*) FROM public.all_service_data_dynamic d) AS actual_count;

-- 5) Optional: mismatch checks (both should return zero rows).
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
