-- Verification Script: CRM Dealer-Scope Migration Test Matrix
-- Purpose: Validate that the new CRM dealer-scope policy is working correctly
-- Date: 2026-06-05
-- Usage: Run in Supabase SQL Editor after 20260605163000_add_crm_dealer_scope_for_service_advisor.sql

-- ============================================================================
-- STEP 1: Confirm helper function exists
-- ============================================================================
SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  provolatile as volatility
FROM pg_proc
WHERE proname = 'user_has_crm_dealer_scope'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Expected output: 1 row, user_has_crm_dealer_scope, true, s (stable)

-- ============================================================================
-- STEP 2: Confirm new policy exists
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles
FROM pg_policies
WHERE tablename = 'service_reception_entries'
  AND policyname = 'service_reception_select_crm_dealer_scope';

-- Expected output: 1 row, service_reception_select_crm_dealer_scope, PERMISSIVE, {authenticated}

-- ============================================================================
-- STEP 3: Test Matrix - Load test data state
-- ============================================================================

-- Find a CRM user in test data
SELECT 
  id as user_id,
  email,
  full_name as user_name
FROM public.users
WHERE id IN (
  SELECT uel.user_id
  FROM public.user_employee_links uel
  JOIN public.employee_master em ON em.employee_code = uel.employee_code
  WHERE lower(btrim(coalesce(em.role, ''))) = 'crm'
    AND uel.is_active = true
  LIMIT 1
)
LIMIT 1;

-- Find a Service Advisor (SA) user in test data
SELECT 
  u.id as user_id,
  u.email,
  u.full_name as user_name
FROM public.users u
JOIN public.user_employee_links uel ON uel.user_id = u.id
JOIN public.employee_master em ON em.employee_code = uel.employee_code
WHERE lower(btrim(coalesce(em.role, ''))) = 'sa'
  AND uel.is_active = true
  AND uel.is_primary = true
LIMIT 1;

-- ============================================================================
-- STEP 4: Policy Text Verification
-- ============================================================================

-- Get exact policy definition text for service_reception_select_crm_dealer_scope
SELECT 
  schemaname,
  tablename,
  policyname,
  qual as policy_using_clause
FROM pg_policies
WHERE tablename = 'service_reception_entries'
  AND policyname = 'service_reception_select_crm_dealer_scope';

-- Get policy definition text for existing SA policy (should remain unchanged)
SELECT 
  schemaname,
  tablename,
  policyname,
  qual as policy_using_clause
FROM pg_policies
WHERE tablename = 'service_reception_entries'
  AND policyname = 'service_reception_select_sa';

-- Expected: service_reception_select_sa should still use user_has_employee_code(sa_employee_code)

-- ============================================================================
-- STEP 5: Integration Test (Manual: Run with specific JWT)
-- ============================================================================
-- After confirming steps 1-4, manually test with:
-- 
-- A) CRM User Test:
--   1. Get JWT for user_id = (CRM user from Step 3)
--   2. Query: SELECT COUNT(*) FROM service_reception_entries WHERE dealer_code = '500A840';
--   3. Expected: Rows visible if they exist in that dealer code
--
-- B) SA User Test:
--   1. Get JWT for user_id = (SA user from Step 3)
--   2. Query: SELECT COUNT(*) FROM service_reception_entries 
--               WHERE sa_employee_code = 'SS2_500A840';
--   3. Expected: Only rows where sa_employee_code matches their mapped code
--
-- C) Admin Test:
--   1. Get JWT for user_id = admin@firstmobital.com
--   2. Query: SELECT COUNT(*) FROM service_reception_entries;
--   3. Expected: All rows visible (via is_admin() policy bypass)

-- ============================================================================
-- STEP 6: Count Summary (Informational)
-- ============================================================================
SELECT 
  'service_reception_entries' as table_name,
  COUNT(*) as total_rows
FROM public.service_reception_entries;

SELECT 
  dealer_code,
  COUNT(*) as rows_by_dealer
FROM public.service_reception_entries
GROUP BY dealer_code
ORDER BY dealer_code;

SELECT 
  sa_employee_code,
  COUNT(*) as rows_by_sa_code
FROM public.service_reception_entries
WHERE sa_employee_code IS NOT NULL
GROUP BY sa_employee_code
ORDER BY sa_employee_code;

-- ============================================================================
-- STEP 7: Policy Interaction Summary
-- ============================================================================
-- List all service_reception_entries SELECT policies (should now be 4 total):
--   1. service_reception_select_rbac (reception module, dealer-scoped)
--   2. service_reception_select_sa (service_advisor module, employee-code scoped)
--   3. service_reception_select_crm_dealer_scope (NEW: service_advisor module, dealer-scoped)
--   4. service_reception_select_floor_incharge (floor_incharge module, fuel-type scoped)

SELECT 
  policyname,
  permissive,
  cmd as command_type,
  roles
FROM pg_policies
WHERE tablename = 'service_reception_entries'
  AND cmd = 'SELECT'
ORDER BY policyname;

-- Expected output: 4 rows (after migration)
