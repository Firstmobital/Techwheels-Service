-- Debug Script: CRM Dealer-Scope Visibility Issue
-- Purpose: Diagnose why CRM policy isn't granting visibility
-- Run as: service admin or test user in SQL Editor

-- ============================================================================
-- STEP 1: Check if current user has CRM role in any mapping
-- ============================================================================
-- Replace {USER_ID} with actual UUID or run as the user
SELECT 
  uel.user_id,
  uel.employee_code,
  uel.dealer_code,
  em.role,
  em.fuel_type,
  uel.is_active,
  uel.is_primary
FROM public.user_employee_links uel
JOIN public.employee_master em ON em.employee_code = uel.employee_code
WHERE uel.user_id = auth.uid()
  AND uel.is_active = true
ORDER BY uel.is_primary DESC, uel.updated_at DESC;

-- Expected: Should show at least one row with em.role = 'CRM'

-- ============================================================================
-- STEP 2: Check service_reception_entries for dealer_code population
-- ============================================================================
SELECT 
  id,
  dealer_code,
  sa_employee_code,
  reg_number,
  model,
  created_at
FROM public.service_reception_entries
WHERE dealer_code IS NOT NULL
  OR dealer_code IS NULL
LIMIT 10;

-- Expected: Should show dealer_code values (not all NULL)

-- ============================================================================
-- STEP 3: Direct function test - does CRM scope function work?
-- ============================================================================
SELECT 
  public.user_has_crm_dealer_scope('500A840') as has_crm_scope_for_500A840,
  public.user_has_crm_dealer_scope('3000840') as has_crm_scope_for_3000840,
  public.user_has_employee_code('EPM_500A840') as has_employee_code_EPM;

-- Expected: If user is mapped to CRM with dealer_code='500A840', first should be TRUE

-- ============================================================================
-- STEP 4: Check how many rows SHOULD be visible to CRM user
-- ============================================================================
WITH user_crm_scope AS (
  SELECT DISTINCT uel.dealer_code
  FROM public.user_employee_links uel
  JOIN public.employee_master em ON em.employee_code = uel.employee_code
  WHERE uel.user_id = auth.uid()
    AND uel.is_active = true
    AND lower(btrim(coalesce(em.role, ''))) = 'crm'
)
SELECT 
  COUNT(*) as total_rows_for_crm_dealer_scope,
  dealer_code
FROM public.service_reception_entries
WHERE dealer_code IN (SELECT dealer_code FROM user_crm_scope)
GROUP BY dealer_code;

-- Expected: Should show rows matching user's CRM dealer code(s)

-- ============================================================================
-- STEP 5: Check rows visible via current SA policy
-- ============================================================================
WITH user_sa_codes AS (
  SELECT DISTINCT uel.employee_code
  FROM public.user_employee_links uel
  WHERE uel.user_id = auth.uid()
    AND uel.is_active = true
)
SELECT 
  COUNT(*) as total_rows_for_sa_employee_code,
  sa_employee_code
FROM public.service_reception_entries
WHERE sa_employee_code IN (SELECT employee_code FROM user_sa_codes)
GROUP BY sa_employee_code;

-- Expected: Should show current visible rows (40 in your case)

-- ============================================================================
-- STEP 6: Verify policy exists and is correct
-- ============================================================================
SELECT 
  policyname,
  permissive,
  cmd,
  qual as policy_condition
FROM pg_policies
WHERE tablename = 'service_reception_entries'
  AND policyname LIKE '%crm%'
ORDER BY policyname;

-- Expected: service_reception_select_crm_dealer_scope should exist

-- ============================================================================
-- STEP 7: Check all reception SELECT policies
-- ============================================================================
SELECT 
  policyname,
  permissive,
  cmd,
  qual as policy_condition
FROM pg_policies
WHERE tablename = 'service_reception_entries'
  AND cmd = 'SELECT'
ORDER BY policyname;

-- Expected: Should show all 4 SELECT policies including the new CRM one
