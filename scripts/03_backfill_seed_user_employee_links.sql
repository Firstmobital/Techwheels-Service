-- Backfill Script: Seed user_employee_links from users with SA permissions
-- Purpose: Create initial primary mappings linking signup identity (user.full_name) to CRM identity (employee_code)
-- Date: 2026-06-01
--
-- Strategy:
-- - For each user with service_advisor module permission
-- - Find matching employee_master record by full_name
-- - Get employee_code (SA_CODE from CRM)
-- - Create user_employee_links mapping (user_id → employee_code)
-- - UI will display user.full_name but internally use employee_code

-- Step 1: Identify users with SA permission and match to employee records by name
-- Create primary mappings for them
WITH candidate_matches AS (
  SELECT
    u.id as user_id,
    em.employee_code,
    COALESCE(u.branch, 'default') as dealer_code,
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
  SELECT user_id, dealer_code, MIN(employee_code) AS employee_code, MAX(is_active) AS is_active
  FROM candidate_matches
  GROUP BY user_id, dealer_code
  HAVING COUNT(DISTINCT employee_code) = 1
)
INSERT INTO public.user_employee_links 
  (user_id, employee_code, dealer_code, is_primary, is_active)
SELECT
  um.user_id,
  um.employee_code,  -- SA_CODE from CRM (immutable)
  um.dealer_code,
  true as is_primary,
  um.is_active
FROM unambiguous_matches um
WHERE NOT EXISTS (
    SELECT 1 FROM public.user_employee_links uel
    WHERE uel.user_id = um.user_id
      AND uel.dealer_code = um.dealer_code
      AND uel.is_primary = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM candidate_matches cm
    WHERE cm.user_id = um.user_id
      AND cm.dealer_code = um.dealer_code
      AND cm.employee_code <> um.employee_code
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_employee_links uel
    WHERE uel.user_id = um.user_id
      AND uel.dealer_code = um.dealer_code
      AND uel.employee_code = um.employee_code
  )
ON CONFLICT (user_id, dealer_code) WHERE is_primary = true AND is_active = true 
  DO NOTHING;

-- Step 2: Report seeding results
SELECT 
  'USER_EMPLOYEE_LINKS_SEEDED' as status,
  COUNT(*) as total_links,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT employee_code) as unique_employees,
  COUNT(DISTINCT dealer_code) as unique_dealers
FROM public.user_employee_links
WHERE is_primary = true AND is_active = true;

-- Step 3: Identify any SA users without successful mapping (manual action required)
-- These users have SA permission but no employee_code match (need manual assignment)
SELECT 
  u.id as user_id,
  u.email,
  u.full_name as signup_display_name,
  u.branch as dealer_code,
  'NO_EMPLOYEE_LINK_FOUND' as status,
  (SELECT STRING_AGG(employee_code || ' (' || employee_name || ')', ', ')
   FROM public.employee_master em
   WHERE (em.role ILIKE '%sa%' OR em.role ILIKE '%service%advisor%')
     AND em.employee_code NOT IN (
       SELECT DISTINCT employee_code FROM public.user_employee_links 
       WHERE is_primary = true AND is_active = true
     )
   LIMIT 10) as available_unmapped_employees
FROM public.users u
INNER JOIN public.user_module_permissions ump 
  ON u.id = ump.user_id
INNER JOIN public.modules m 
  ON ump.module_id = m.id 
  AND LOWER(m.name) IN ('service_advisor', 'sa')
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_employee_links uel
  WHERE uel.user_id = u.id AND uel.is_primary = true AND uel.is_active = true
)
ORDER BY u.created_at DESC;
