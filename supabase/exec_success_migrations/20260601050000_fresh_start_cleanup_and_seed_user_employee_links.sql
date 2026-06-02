-- Migration: Fresh start cleanup + seed SA user-employee mappings
-- Date: 2026-06-01
-- Purpose:
-- 1) Remove old reception entries for a clean restart
-- 2) Seed unambiguous SA user -> employee_code mappings
-- 3) Output verification snapshot

BEGIN;

-- Step 0: Pre-check snapshot
CREATE TEMP TABLE tmp_fresh_start_precheck AS
SELECT
  (SELECT COUNT(*) FROM public.service_reception_entries) AS reception_before,
  (SELECT COUNT(*) FROM public.user_employee_links) AS links_before;

-- Step 1: Cleanup reception history (fresh start)
DELETE FROM public.service_reception_entries;

-- Optional: full mapping reset (leave commented unless explicitly needed)
-- DELETE FROM public.user_employee_links;

-- Step 2: Seed mappings for SA users using exact-name unambiguous matches only
WITH candidate_matches AS (
  SELECT
    u.id AS user_id,
    em.employee_code,
    COALESCE(u.branch, 'default') AS dealer_code,
    u.is_active
  FROM public.users u
  INNER JOIN public.user_module_permissions ump
    ON u.id = ump.user_id
  INNER JOIN public.modules m
    ON ump.module_id = m.id
   AND LOWER(m.name) IN ('service_advisor', 'sa')
   AND ump.can_view = true
  INNER JOIN public.employee_master em
    ON LOWER(TRIM(u.full_name)) = LOWER(TRIM(em.employee_name))
  WHERE u.is_active = true
),
unambiguous_matches AS (
  SELECT
    user_id,
    dealer_code,
    MIN(employee_code) AS employee_code,
    BOOL_OR(is_active) AS is_active
  FROM candidate_matches
  GROUP BY user_id, dealer_code
  HAVING COUNT(DISTINCT employee_code) = 1
)
INSERT INTO public.user_employee_links (
  user_id,
  employee_code,
  dealer_code,
  is_primary,
  is_active
)
SELECT
  um.user_id,
  um.employee_code,
  um.dealer_code,
  true,
  um.is_active
FROM unambiguous_matches um
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_employee_links uel
  WHERE uel.user_id = um.user_id
    AND uel.dealer_code = um.dealer_code
    AND uel.is_primary = true
)
ON CONFLICT (user_id, dealer_code) WHERE is_primary = true AND is_active = true
DO NOTHING;

-- Step 3: Verification output
SELECT
  p.reception_before,
  p.links_before,
  (SELECT COUNT(*) FROM public.service_reception_entries) AS reception_after,
  (SELECT COUNT(*) FROM public.user_employee_links) AS links_after,
  (SELECT COUNT(*) FROM public.user_employee_links WHERE is_primary = true AND is_active = true) AS active_primary_links,
  (SELECT COUNT(*) FROM public.user_employee_links WHERE is_primary = true AND is_active = true AND employee_code IS NULL) AS invalid_primary_links
FROM tmp_fresh_start_precheck p;

-- Optional: list SA users still unmapped (manual action required)
SELECT
  u.id AS user_id,
  u.email,
  u.full_name,
  COALESCE(u.branch, 'default') AS dealer_code,
  'NO_PRIMARY_MAPPING' AS issue
FROM public.users u
INNER JOIN public.user_module_permissions ump
  ON u.id = ump.user_id
INNER JOIN public.modules m
  ON ump.module_id = m.id
 AND LOWER(m.name) IN ('service_advisor', 'sa')
 AND ump.can_view = true
WHERE u.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel
    WHERE uel.user_id = u.id
      AND uel.dealer_code = COALESCE(u.branch, 'default')
      AND uel.is_primary = true
      AND uel.is_active = true
  )
ORDER BY u.created_at DESC;

COMMIT;
