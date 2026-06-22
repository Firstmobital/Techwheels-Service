-- Read-only verification checks for:
-- supabase/migrations/20260622104000_split_service_bodyshop_floor_incharge_reception_helpers.sql

-- 1) Confirm both split helper functions exist and inspect definitions.
SELECT pg_get_functiondef('public.user_has_service_floor_incharge_scope_for_sa_code(text)'::regprocedure) AS service_helper_ddl;

SELECT pg_get_functiondef('public.user_has_bodyshop_floor_incharge_scope_for_sa_code(text)'::regprocedure) AS bodyshop_helper_ddl;

-- 2) Confirm service floor-incharge policy exists and points to service helper.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  position('user_has_service_floor_incharge_scope_for_sa_code' in qual) > 0 AS uses_service_helper
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'service_reception_entries'
  AND policyname = 'service_reception_select_floor_incharge';

-- 3) Confirm bodyshop floor policy exists and points to bodyshop helper.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  position('user_has_bodyshop_floor_incharge_scope_for_sa_code' in qual) > 0 AS uses_bodyshop_helper
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'service_reception_entries'
  AND policyname = 'service_reception_select_bodyshop_floor_incharge_v1';

-- 4) Confirm both policies preserve admin bypass path.
SELECT
  policyname,
  position('is_admin()' in qual) > 0 AS has_admin_bypass
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'service_reception_entries'
  AND policyname IN (
    'service_reception_select_floor_incharge',
    'service_reception_select_bodyshop_floor_incharge_v1'
  )
ORDER BY policyname;

-- 5) Optional quick reference for module ids/names used by these policies.
SELECT
  m.id,
  coalesce(
    to_jsonb(m)->>'module_name',
    to_jsonb(m)->>'name',
    to_jsonb(m)->>'code'
  ) AS module_name,
  coalesce(
    to_jsonb(m)->>'display_name',
    to_jsonb(m)->>'label',
    to_jsonb(m)->>'title'
  ) AS display_name
FROM public.modules AS m
WHERE coalesce(
  to_jsonb(m)->>'module_name',
  to_jsonb(m)->>'name',
  to_jsonb(m)->>'code'
) IN ('floor_incharge', 'bodyshop_floor')
ORDER BY m.id;
