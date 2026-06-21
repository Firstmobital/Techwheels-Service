-- Plan: SUPABASE-002 follow-up
-- Read-only checks after adding YYYY/MM/DD parser support.

-- 1) Count rows matching plus-2 using current predicate.
SELECT COUNT(*) AS plus2_total_matches
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);

-- 2) Breakdown by date format for scheduled_next_service_date (non-null only).
SELECT
  COUNT(*) FILTER (WHERE nullif(btrim(a.scheduled_next_service_date), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') AS fmt_yyyy_mm_dd_dash,
  COUNT(*) FILTER (WHERE nullif(btrim(a.scheduled_next_service_date), '') ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$') AS fmt_yyyy_mm_dd_slash,
  COUNT(*) FILTER (WHERE nullif(btrim(a.scheduled_next_service_date), '') ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}$') AS fmt_dd_mm_yyyy_dash,
  COUNT(*) FILTER (WHERE nullif(btrim(a.scheduled_next_service_date), '') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$') AS fmt_dd_mm_yyyy_slash
FROM public.all_service_data a
WHERE nullif(btrim(a.scheduled_next_service_date), '') IS NOT NULL;

-- 3) Parity with dynamic table.
SELECT
  (SELECT COUNT(*) FROM public.all_service_data a WHERE public.is_all_service_dynamic_match(a)) AS expected_count,
  (SELECT COUNT(*) FROM public.all_service_data_dynamic d) AS actual_count;

-- 4) Mismatch checks (should return zero rows).
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
