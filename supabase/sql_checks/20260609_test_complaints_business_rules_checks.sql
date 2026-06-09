-- ============================================================================
-- COMPLAINTS MODULE — TEST VERIFICATION CHECKLIST
-- ============================================================================
-- Path: supabase/sql_checks/20260609_test_complaints_business_rules_checks.sql
-- Purpose: Validation queries and manual test steps to verify business rules
--
-- After running the migration, use these queries to validate each test case.
-- ============================================================================

-- ── SETUP: Verify test data was created ───────────────────────────────────

SELECT 'CHECKING: Test data creation' as test_phase;

-- Verify access links
SELECT 
  'Access Links' as object,
  COUNT(*) as count,
  'Expected: 2 (one consumed, one fresh)' as expected
FROM public.complaint_access_links 
WHERE token IN ('TEST_TOKEN_SINGLE_USE', 'TEST_TOKEN_FRESH');

-- Verify complaint tickets
SELECT 
  'Complaint Tickets' as object,
  COUNT(*) as count,
  'Expected: 3 (2 tenant test, 1 SLA test)' as expected
FROM public.complaint_tickets 
WHERE ticket_number LIKE 'CMP-999%';

-- Verify messages
SELECT 
  'Messages' as object,
  COUNT(*) as count,
  'Expected: 2 (1 customer, 1 internal)' as expected
FROM public.complaint_messages 
WHERE complaint_id = 999001;

-- ── TEST 1: SINGLE-USE COMPLAINT LINKS ───────────────────────────────────

SELECT '' as spacer;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;
SELECT 'TEST 1: SINGLE-USE COMPLAINT LINKS' as test_name;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;

-- 1a. Verify fresh token exists and not consumed
SELECT 
  'Fresh token status' as check_name,
  token,
  consumed_at IS NULL as is_fresh,
  'Should be TRUE' as expected
FROM public.complaint_access_links
WHERE token = 'TEST_TOKEN_FRESH';

-- 1b. Verify consumed token has timestamp
SELECT 
  'Consumed token status' as check_name,
  token,
  consumed_at IS NOT NULL as is_consumed,
  'Should be TRUE' as expected
FROM public.complaint_access_links
WHERE token = 'TEST_TOKEN_SINGLE_USE';

-- 1c. Manual test instructions:
SELECT 
  '⚠️  MANUAL TESTS REQUIRED:' as manual_step,
  'Step 1a: Call get_complaint_by_token(''TEST_TOKEN_FRESH'')' as instruction;
SELECT '✓ Expected result: mode=''raise'', can_raise=true' as expected_result;
SELECT '✓ Verify: entry_summary and ticket fields present' as verify;

SELECT '';
SELECT 'Step 1b: Call raise_complaint(''TEST_TOKEN_FRESH'', ...) with valid data' as instruction;
SELECT '✓ Expected result: Ticket created, consumed_at is set' as expected_result;

SELECT '';
SELECT 'Step 1c: Call get_complaint_by_token(''TEST_TOKEN_SINGLE_USE'')' as instruction;
SELECT '✓ Expected result: mode=''view'', can_raise=false' as expected_result;

-- ── TEST 2: TENANT ISOLATION (RLS) ───────────────────────────────────────

SELECT '' as spacer;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;
SELECT 'TEST 2: TENANT ISOLATION VIA RLS' as test_name;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;

-- Verify test tickets exist in different dealers
SELECT 
  'Tenant isolation setup' as check_name,
  dealer_code,
  COUNT(*) as ticket_count,
  STRING_AGG(ticket_number, ', ') as tickets
FROM public.complaint_tickets
WHERE ticket_number LIKE 'CMP-999%' AND ticket_number LIKE '%TEST'
GROUP BY dealer_code
ORDER BY dealer_code;

-- Manual test instructions:
SELECT '' as spacer;
SELECT '⚠️  MANUAL TESTS REQUIRED:' as manual_step;
SELECT '2a. Authenticate as staff user from TEST_DEALER_A' as instruction;
SELECT 'SELECT * FROM complaint_tickets WHERE dealer_code IN (''TEST_DEALER_A'', ''TEST_DEALER_B'')' as query;
SELECT '✓ Expected: Only CMP-999001-TEST visible (from TEST_DEALER_A)' as expected_result;
SELECT '✓ CMP-999002-TEST should NOT appear (RLS blocks)' as expected_result;

SELECT '';
SELECT '2b. Attempt to authenticate as anon and query directly' as instruction;
SELECT 'SELECT * FROM complaint_tickets' as query;
SELECT '✓ Expected: ERROR - permission denied' as expected_result;

SELECT '';
SELECT '2c. Call get_complaint_by_token as anon with fresh token' as instruction;
SELECT 'SELECT * FROM get_complaint_by_token(''TEST_TOKEN_FRESH'')' as query;
SELECT '✓ Expected: Works (RPC is SECURITY DEFINER, not blocked by RLS)' as expected_result;

-- ── TEST 3: INTERNAL NOTES HIDDEN ────────────────────────────────────────

SELECT '' as spacer;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;
SELECT 'TEST 3: INTERNAL NOTES HIDDEN FROM CUSTOMERS' as test_name;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;

-- Verify message content and visibility flags
SELECT 
  'Message content check' as check_name,
  id,
  author_name,
  is_internal,
  CASE 
    WHEN is_internal THEN '(INTERNAL - should not reach customer)'
    ELSE '(VISIBLE - OK for customer to see)'
  END as visibility
FROM public.complaint_messages
WHERE complaint_id = 999001
ORDER BY created_at;

-- Manual test instructions:
SELECT '' as spacer;
SELECT '⚠️  MANUAL TESTS REQUIRED:' as manual_step;
SELECT '3a. Call get_complaint_by_token(''TEST_TOKEN_FRESH'') as anon' as instruction;
SELECT 'Check messages array in response' as query;
SELECT '✓ Expected: Only message 999001 (customer message)' as expected_result;
SELECT '✓ NOT present: Message 999002 (internal note)' as expected_result;
SELECT '✓ Verify: No is_internal=true in returned messages' as expected_result;

SELECT '';
SELECT '3b. Authenticate as TEST_DEALER_A staff, fetch same ticket' as instruction;
SELECT 'SELECT * FROM complaint_messages WHERE complaint_id=999001' as query;
SELECT '✓ Expected: Both messages present (999001 and 999002)' as expected_result;
SELECT '✓ Includes message with is_internal=true' as expected_result;

-- ── TEST 4: SLA BREACH DETECTION ─────────────────────────────────────────

SELECT '' as spacer;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;
SELECT 'TEST 4: SLA BREACH DETECTION' as test_name;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;

-- Check SLA ticket details
SELECT 
  'SLA breach ticket' as check_name,
  ticket_number,
  status,
  priority,
  response_due_at,
  resolution_due_at,
  response_breached,
  resolution_breached,
  CURRENT_TIMESTAMP as now_ts
FROM public.complaint_tickets
WHERE id = 999003;

-- Calculate expected breach status
SELECT 
  'Expected SLA calculations' as check_name,
  NOW() > (SELECT response_due_at FROM public.complaint_tickets WHERE id=999003) as should_be_response_breached,
  NOW() > (SELECT resolution_due_at FROM public.complaint_tickets WHERE id=999003) as should_be_resolution_breached;

-- Manual test instructions:
SELECT '' as spacer;
SELECT '⚠️  MANUAL TESTS REQUIRED:' as manual_step;
SELECT '4a. Check SLA breach flags for ticket 999003' as instruction;
SELECT 'SELECT response_breached, resolution_breached FROM complaint_tickets WHERE id=999003' as query;
SELECT '✓ Expected: response_breached=TRUE, resolution_breached=TRUE' as expected_result;

SELECT '';
SELECT '4b. Call check_complaint_sla_breaches()' as instruction;
SELECT 'SELECT * FROM check_complaint_sla_breaches()' as query;
SELECT '✓ Expected: breached_count >= 1 (CMP-999003)' as expected_result;

SELECT '';
SELECT '4c. Change priority and verify SLA recalculation' as instruction;
SELECT 'Call set_priority(999003, ''urgent'')' as step1;
SELECT 'Check response_due_at and resolution_due_at' as step2;
SELECT '✓ Expected: Different timestamps than before (shorter for urgent)' as expected_result;

-- ── TEST 5: RBAC PERMISSION GATING ───────────────────────────────────────

SELECT '' as spacer;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;
SELECT 'TEST 5: RBAC PERMISSION GATING' as test_name;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;

-- Check test users exist
SELECT 
  'Test users created' as check_name,
  email,
  full_name,
  dealer_code,
  is_active
FROM public.users
WHERE email IN ('viewer@test.com', 'modifier@test.com')
ORDER BY email;

-- Manual test instructions:
SELECT '' as spacer;
SELECT '⚠️  MANUAL TESTS REQUIRED:' as manual_step;
SELECT '5a. Authenticate as viewer@test.com (no modify permission)' as instruction;
SELECT 'Call start_progress(999001)' as attempt;
SELECT '✓ Expected: ERROR - insufficient permissions or permission denied' as expected_result;

SELECT '';
SELECT '5b. Authenticate as modifier@test.com (has modify permission)' as instruction;
SELECT 'Call start_progress(999001)' as attempt;
SELECT '✓ Expected: Success - status changes to ''in_progress''' as expected_result;

SELECT '';
SELECT '5c. Authenticate as admin (is_admin()=true)' as instruction;
SELECT 'Call all staff RPCs (acknowledge, startProgress, resolve, close, etc.)' as attempt;
SELECT '✓ Expected: All calls succeed' as expected_result;

-- ── TEST 6: SINGLE-USE RAISE IDEMPOTENCE ────────────────────────────────

SELECT '' as spacer;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;
SELECT 'TEST 6: SINGLE-USE RAISE IDEMPOTENCE' as test_name;
SELECT '═══════════════════════════════════════════════════════════════' as test_section;

SELECT '⚠️  MANUAL TESTS REQUIRED:' as manual_step;
SELECT '6a. Call raise_complaint(''TEST_TOKEN_FRESH'', {...}) with valid data' as instruction;
SELECT 'Record the ticket that is created' as note1;
SELECT 'Verify consumed_at timestamp is set' as note2;

SELECT '';
SELECT '6b. Call raise_complaint(''TEST_TOKEN_FRESH'', {...}) again' as instruction;
SELECT 'Use the SAME token with potentially different data' as note;
SELECT '✓ Expected: ERROR or error response (link already consumed)' as expected_result;
SELECT '✓ NOT expected: Second ticket created' as expected_result;

-- ── SUMMARY REPORT ───────────────────────────────────────────────────────

SELECT '' as spacer;
SELECT '' as spacer;
SELECT '╔═══════════════════════════════════════════════════════════════╗' as summary;
SELECT '║         COMPLAINTS TEST SUITE VERIFICATION SUMMARY             ║' as summary;
SELECT '╚═══════════════════════════════════════════════════════════════╝' as summary;

SELECT '' as summary;
SELECT 'Next Steps:' as summary;
SELECT '1. Run the test migration: supabase/migrations/20260609_...' as step;
SELECT '2. Execute all manual test steps above in order' as step;
SELECT '3. Verify expected results for each test' as step;
SELECT '4. On completion, move migration to exec_success_migrations/' as step;
SELECT '5. Document any failures in test report' as step;

SELECT '' as summary;
SELECT 'Success Criteria:' as summary;
SELECT '✓ All 6 test categories pass verification' as criteria;
SELECT '✓ Single-use link idempotence confirmed' as criteria;
SELECT '✓ Tenant isolation verified' as criteria;
SELECT '✓ Internal notes hidden from customers' as criteria;
SELECT '✓ SLA breach flags accurate' as criteria;
SELECT '✓ RBAC permission gates enforce modify checks' as criteria;

SELECT '' as summary;
SELECT 'Estimated Manual Test Duration: 30-45 minutes' as note;
SELECT 'Automation: Awaiting pgTAP installation for full automation' as note;
SELECT '═══════════════════════════════════════════════════════════════' as footer;
