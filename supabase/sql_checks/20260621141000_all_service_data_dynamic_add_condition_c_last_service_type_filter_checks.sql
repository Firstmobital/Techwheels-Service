-- Read-only verification checks for:
-- 20260621141000_all_service_data_dynamic_add_condition_c_last_service_type_filter.sql

-- 1) Verify predicate function includes Condition C semantics.
SELECT
  pg_get_functiondef('public.is_all_service_dynamic_match(public.all_service_data)'::regprocedure) ILIKE '%last_service_type%' AS mentions_last_service_type,
  pg_get_functiondef('public.is_all_service_dynamic_match(public.all_service_data)'::regprocedure) ILIKE '%!~* ''service''%' AS uses_not_contains_service;

-- 2) Count rows that qualify by Condition C in source.
SELECT COUNT(*) AS condition_c_source_count
FROM public.all_service_data a
WHERE a.chassis_no IS NOT NULL
  AND (
    NULLIF(btrim(a.last_service_type), '') IS NULL
    OR btrim(a.last_service_type) !~* 'service'
  );

-- 3) Rows currently present in dynamic that satisfy Condition C.
SELECT COUNT(*) AS condition_c_dynamic_count
FROM public.all_service_data_dynamic d
WHERE d.chassis_no IS NOT NULL
  AND (
    NULLIF(btrim(d.last_service_type), '') IS NULL
    OR btrim(d.last_service_type) !~* 'service'
  );

-- 4) Ensure no source-eligible row is missing from dynamic.
SELECT COUNT(*) AS missing_ids_after_condition_c
FROM (
  SELECT a.id
  FROM public.all_service_data a
  WHERE public.is_all_service_dynamic_match(a)
  EXCEPT
  SELECT d.id
  FROM public.all_service_data_dynamic d
) q;

-- 5) Ensure no extra dynamic row exists outside predicate.
SELECT COUNT(*) AS extra_ids_outside_predicate
FROM (
  SELECT d.id
  FROM public.all_service_data_dynamic d
  EXCEPT
  SELECT a.id
  FROM public.all_service_data a
  WHERE public.is_all_service_dynamic_match(a)
) q;
