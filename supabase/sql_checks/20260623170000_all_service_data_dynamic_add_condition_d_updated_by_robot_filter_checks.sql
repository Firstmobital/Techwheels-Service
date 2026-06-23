-- Read-only verification checks for:
-- supabase/migrations/20260623170000_all_service_data_dynamic_add_condition_d_updated_by_robot_filter.sql

-- 1) Predicate function exists and includes Condition D comment text.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  d.description AS function_comment
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_description d
  ON d.objoid = p.oid
 AND d.classoid = 'pg_proc'::regclass
 AND d.objsubid = 0
WHERE n.nspname = 'public'
  AND p.proname = 'is_all_service_dynamic_match'
  AND pg_get_function_identity_arguments(p.oid) = 'r public.all_service_data';

-- 2) Function body signature check for updated_by_robot branch.
SELECT
  position('updated_by_robot' in pg_get_functiondef(p.oid)) > 0 AS has_updated_by_robot_branch,
  position('IN (''false'', ''f'')' in pg_get_functiondef(p.oid)) > 0 AS has_false_compat_clause,
  position('last_service_type' in pg_get_functiondef(p.oid)) > 0 AS keeps_condition_c_branch
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_all_service_dynamic_match'
  AND pg_get_function_identity_arguments(p.oid) = 'r public.all_service_data';

-- 3) Condition D expected population snapshot from source.
WITH cond_d_expected AS (
  SELECT a.id
  FROM public.all_service_data a
  WHERE a.chassis_no IS NOT NULL
    AND COALESCE(
      NULLIF(lower(btrim(a.updated_by_robot::text)), ''),
      'false'
    ) IN ('false', 'f')
)
SELECT COUNT(*) AS cond_d_expected_rows
FROM cond_d_expected;

-- 4) Condition D parity: expected Condition D rows missing in dynamic (should be 0).
WITH cond_d_expected AS (
  SELECT a.id
  FROM public.all_service_data a
  WHERE a.chassis_no IS NOT NULL
    AND COALESCE(
      NULLIF(lower(btrim(a.updated_by_robot::text)), ''),
      'false'
    ) IN ('false', 'f')
)
SELECT COUNT(*) AS cond_d_missing_in_dynamic
FROM cond_d_expected e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.all_service_data_dynamic d
  WHERE d.id = e.id
);

-- 5) Global predicate parity guard after Condition D rollout (both should be 0).
SELECT COUNT(*) AS expected_missing_in_dynamic
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a)
  AND NOT EXISTS (
    SELECT 1
    FROM public.all_service_data_dynamic d
    WHERE d.id = a.id
  );

SELECT COUNT(*) AS stale_dynamic_rows
FROM public.all_service_data_dynamic d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.all_service_data a
  WHERE a.id = d.id
    AND public.is_all_service_dynamic_match(a)
);

-- 6) Sample rows for quick inspection (Condition D cases).
SELECT
  a.id,
  a.chassis_no,
  a.updated_by_robot,
  a.last_service_type,
  a.assumed_next_service_date,
  public.is_all_service_dynamic_match(a) AS predicate_match,
  EXISTS (
    SELECT 1
    FROM public.all_service_data_dynamic d
    WHERE d.id = a.id
  ) AS exists_in_dynamic
FROM public.all_service_data a
WHERE a.chassis_no IS NOT NULL
  AND COALESCE(
    NULLIF(lower(btrim(a.updated_by_robot::text)), ''),
    'false'
  ) IN ('false', 'f')
ORDER BY a.id DESC
LIMIT 25;
