-- RBAC Phase 3.3: Table Access Restriction Validation Tests
-- 
-- This file documents validation steps to ensure critical tables
-- cannot be queried without intended access control enforcement.
-- 
-- USAGE:
-- 1. Run via supabase_connection in psql or similar authenticated session
-- 2. Each test section shows setup, action, and expected outcome
-- 3. Tests use temporary roles to simulate different user contexts
--
-- CRITICAL ASSUMPTIONS:
-- - RLS policies on core tables must be enabled and restrict unauthenticated/anon access
-- - Helper functions from 20260523120000_add_module_permission_helper_functions.sql exist
-- - Module permission system is properly wired (see RBAC-001 plan)
--

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEST SUITE 1: Unauthenticated Access Should Be Blocked
-- ═══════════════════════════════════════════════════════════════════════════════

-- Test 1.1: Anon user cannot query open_job_cards
-- Expected: Query returns 0 rows or throws auth error
-- Setup: Connect as anon role
-- Action: SELECT * FROM public.open_job_cards LIMIT 1;
-- Expected Outcome: 0 rows or "permission denied"

-- Test 1.2: Anon user cannot query invoices
-- Expected: Query returns 0 rows or throws auth error
-- Setup: Connect as anon role
-- Action: SELECT * FROM public.invoices LIMIT 1;
-- Expected Outcome: 0 rows or "permission denied"

-- Test 1.3: Anon user cannot query parts_orders
-- Expected: Query returns 0 rows or throws auth error
-- Setup: Connect as anon role
-- Action: SELECT * FROM public.parts_orders LIMIT 1;
-- Expected Outcome: 0 rows or "permission denied"

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEST SUITE 2: Authenticated But Unpermissioned User
-- ═══════════════════════════════════════════════════════════════════════════════

-- Test 2.1: New signup user (no module permissions) cannot query job_cards data
-- Setup:
--   - Create new test user via supabase.auth.admin.createUser()
--   - User has NO rows in public.user_module_permissions
--   - Connect as this test user
-- Action: SELECT * FROM public.open_job_cards LIMIT 1;
-- Expected Outcome: 0 rows (RLS policy filters out due to lack of permission)

-- Test 2.2: User with only 'invoices' permission cannot query job_cards data
-- Setup:
--   - Create test user with ONLY invoices module permission
--   - INSERT user row with can_view=true for module_id=2 (invoices)
--   - Connect as test user
-- Action: SELECT * FROM public.open_job_cards LIMIT 1;
-- Expected Outcome: 0 rows (dealer_code mismatch OR permission check in RLS fails)

-- Test 2.3: User with 'reports' permission can see only dealer-scoped data
-- Setup:
--   - Create test user with reports module permission
--   - User's dealer_code set to 'TEST_DEALER_001'
--   - Jobs with different dealer_codes exist in open_job_cards
-- Action: SELECT branch FROM public.open_job_cards LIMIT 5;
-- Expected Outcome: Only rows with matching dealer_code returned

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEST SUITE 3: Authorized User Can Access Assigned Data
-- ═══════════════════════════════════════════════════════════════════════════════

-- Test 3.1: Admin user can query all modules' data without restriction
-- Setup:
--   - Create test admin user (role='admin' in public.users)
--   - No explicit module_permission entries needed
--   - Connect as admin
-- Action: SELECT COUNT(*) FROM public.open_job_cards;
-- Expected Outcome: Full count (all rows visible)

-- Test 3.2: User with job_cards permission can query open_job_cards
-- Setup:
--   - Create test user with job_cards module permission (module_id=1)
--   - INSERT user row with can_view=true for module_id=1
--   - User's dealer_code matches a job card's branch
--   - Connect as test user
-- Action: SELECT COUNT(*) FROM public.open_job_cards WHERE branch='TEST_BRANCH';
-- Expected Outcome: Count > 0 (rows visible)

-- Test 3.3: User with write permission can INSERT into allowed tables
-- Setup:
--   - Create test user with job_cards permission + can_modify=true
--   - Connect as test user
-- Action: INSERT INTO public.some_writable_table (...) VALUES (...);
-- Expected Outcome: INSERT succeeds (RLS policy allows INSERT)

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEST SUITE 4: Cross-Module Access Isolation
-- ═══════════════════════════════════════════════════════════════════════════════

-- Test 4.1: job_cards user cannot query invoices
-- Setup:
--   - User has ONLY job_cards permission
--   - Invoices table has RLS policy checking module permission
--   - Connect as job_cards-only user
-- Action: SELECT * FROM public.invoices LIMIT 1;
-- Expected Outcome: 0 rows (RLS policy denies access)

-- Test 4.2: parts_orders user cannot query open_job_cards
-- Setup:
--   - User has ONLY parts_orders permission
--   - Connect as parts-only user
-- Action: SELECT * FROM public.open_job_cards LIMIT 1;
-- Expected Outcome: 0 rows (RLS policy denies access)

-- Test 4.3: employees user cannot query parts_inventory
-- Setup:
--   - User has ONLY employees permission
--   - Connect as employees-only user
-- Action: SELECT * FROM public.parts_inventory LIMIT 1;
-- Expected Outcome: 0 rows (RLS policy denies access)

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEST SUITE 5: Helper Function Enforcement
-- ═══════════════════════════════════════════════════════════════════════════════

-- Test 5.1: has_module_view() returns false for unpermissioned users
-- Setup:
--   - Create user with NO module permissions
--   - Connect as this user
-- Action: SELECT public.has_module_view('job_cards');
-- Expected Outcome: false

-- Test 5.2: has_module_view() returns true for admin
-- Setup:
--   - Create admin user
--   - Connect as admin
-- Action: SELECT public.has_module_view('job_cards');
-- Expected Outcome: true

-- Test 5.3: has_module_modify() returns false if can_modify not set
-- Setup:
--   - User has job_cards permission with can_view=true, can_modify=false
--   - Connect as this user
-- Action: SELECT public.has_module_modify('job_cards');
-- Expected Outcome: false

-- ═══════════════════════════════════════════════════════════════════════════════
-- MANUAL EXECUTION STEPS (for Phase 5.1 / 5.2)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Create test roles and users:
--    a. Sign up new user via auth UI or admin API
--    b. Record user_id from public.users table
--    c. Insert rows into public.user_module_permissions with specific module grants

-- 2. Test via direct SQL (requires admin access to Supabase dashboard):
--    a. Open SQL editor in Supabase console
--    b. Run each test query with user session context (if possible)
--    c. Document results in RBAC-001_DAILY_STANDUP_CHECKLIST.md

-- 3. Test via application UI:
--    a. Deploy current frontend code (src/App.tsx with ROUTE_MODULE_MAP)
--    b. Log in as test user with specific permissions
--    c. Verify unauthorized routes return AccessDenied component
--    d. Verify sidebar/nav items are filtered correctly

-- ═══════════════════════════════════════════════════════════════════════════════
-- SUCCESS CRITERIA
-- ═══════════════════════════════════════════════════════════════════════════════

-- ✅ Unauthenticated (anon) users see 0 rows from all restricted tables
-- ✅ Authenticated users without permission see 0 rows  
-- ✅ Authenticated users with permission see only dealer-scoped rows
-- ✅ Admin users see all rows without restriction
-- ✅ Cross-module isolation: users with Module A cannot query Module B data
-- ✅ Helper functions (has_module_view, has_module_modify) correctly evaluate permissions
-- ✅ Frontend routes are blocked by canAccessPath() for unauthorized modules
-- ✅ Direct URL access to unauthorized routes returns AccessDenied, not blank page

-- ═══════════════════════════════════════════════════════════════════════════════
-- KNOWN LIMITATIONS & FUTURE ENHANCEMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Reports table may not have RLS policies yet (DB-only aggregation)
--    Future: Restrict reports table with module + dealer checks

-- 2. Historical data access and audit logging not yet gated
--    Future: Add timestamp-based retention RLS policies

-- 3. Data export/download endpoints not protected by module checks
--    Future: Add middleware to check has_module_view() before serving exports

-- ═══════════════════════════════════════════════════════════════════════════════

-- Last Updated: 2026-05-23 by GitHub Copilot
-- Related: RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md (Phase 3.3)
