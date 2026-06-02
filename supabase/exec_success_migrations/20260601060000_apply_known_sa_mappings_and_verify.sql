-- Migration: Apply known SA mappings and verify unresolved users
-- Date: 2026-06-01
-- Purpose:
-- 1) Apply only confirmed safe mappings (no placeholder values)
-- 2) Avoid FK failures from empty/invalid employee codes
-- 3) Show unresolved SA users for manual assignment

BEGIN;

-- Ensure dealer code consistency for targeted users
UPDATE public.users
SET branch = '3000840',
    updated_at = now()
WHERE id IN (
  'f414691b-d562-431d-bcd4-03bd5b4cae7b' -- Deepak Sharma
)
  AND (branch IS NULL OR branch = '' OR branch = 'default');

-- Apply confirmed mapping for Deepak Sharma only
-- DS5_3000840 exists in employee_master as Sharma, Deepak (Sitapura, PV)
INSERT INTO public.user_employee_links (
  user_id,
  employee_code,
  dealer_code,
  is_primary,
  is_active,
  created_at,
  updated_at
)
SELECT
  'f414691b-d562-431d-bcd4-03bd5b4cae7b'::uuid,
  'DS5_3000840'::text,
  '3000840'::text,
  true,
  true,
  now(),
  now()
WHERE EXISTS (
  SELECT 1
  FROM public.employee_master em
  WHERE em.employee_code = 'DS5_3000840'
)
ON CONFLICT (user_id, dealer_code) WHERE is_primary = true AND is_active = true
DO UPDATE SET
  employee_code = EXCLUDED.employee_code,
  updated_at = now();

-- Verification 1: Mapping status for the two users
SELECT
  u.id AS user_id,
  u.email,
  u.full_name,
  COALESCE(NULLIF(u.branch, ''), 'default') AS branch,
  uel.employee_code,
  uel.dealer_code,
  uel.is_primary,
  uel.is_active
FROM public.users u
LEFT JOIN public.user_employee_links uel
  ON uel.user_id = u.id
 AND uel.dealer_code = COALESCE(NULLIF(u.branch, ''), 'default')
 AND uel.is_primary = true
 AND uel.is_active = true
WHERE u.id IN ('f414691b-d562-431d-bcd4-03bd5b4cae7b')
ORDER BY u.full_name;

-- Verification 2: SA users still missing primary mapping
SELECT
  u.id AS user_id,
  u.email,
  u.full_name,
  COALESCE(NULLIF(u.branch, ''), 'default') AS dealer_code,
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
      AND uel.dealer_code = COALESCE(NULLIF(u.branch, ''), 'default')
      AND uel.is_primary = true
      AND uel.is_active = true
  )
ORDER BY u.created_at DESC;

COMMIT;
