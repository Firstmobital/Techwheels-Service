-- ============================================================================
-- COMPLAINTS MODULE — TEST EXECUTION GUIDE
-- ============================================================================
-- Document: How to run and verify the business rules test suite
-- Date: 2026-06-09
-- ============================================================================

-- OVERVIEW
-- ========
-- The complaints module test suite validates 6 critical business rules:
--
-- 1. Single-use complaint links (consume on raise, view-only after)
-- 2. Tenant isolation (RLS prevents cross-dealer access)
-- 3. Internal notes hidden from customers (is_internal=true never exposed)
-- 4. SLA breach detection (flags set accurately)
-- 5. RBAC permission gating (modify requires permission)
-- 6. Raise idempotence (second call with same token fails)
--
-- Test Type: Integration tests with manual verification steps
-- Status: Ready for local testing
-- Duration: ~45 minutes for full verification
-- ============================================================================

-- PREREQUISITES
-- =============
-- ✓ Complaints module fully deployed (tables, RPCs, triggers, RLS)
-- ✓ Test data fixtures created (migration 20260609_test_complaints_business_rules.sql)
-- ✓ Supabase project with read/execute access
-- ✓ API client for RPC calls (curl, Postman, JS SDK, etc.)
-- ✓ SQL editor access for direct table queries (verification)

-- ============================================================================
-- PART 1: SETUP & DATA VALIDATION
-- ============================================================================

-- Step 1.1: Run the test migration
-- ─────────────────────────────────
-- Command: Execute 20260609_test_complaints_business_rules.sql
-- Output: Test data will be created in main public schema
-- Verify: Run query below to confirm

SELECT 'STEP 1.1: Verify test data' as step;
SELECT COUNT(*) as test_tickets FROM complaint_tickets WHERE ticket_number LIKE 'CMP-999%';
-- Expected: 3 tickets (999001, 999002, 999003)

SELECT COUNT(*) as test_links FROM complaint_access_links 
  WHERE token IN ('TEST_TOKEN_SINGLE_USE', 'TEST_TOKEN_FRESH');
-- Expected: 2 links

SELECT COUNT(*) as test_messages FROM complaint_messages WHERE complaint_id IN (999001, 999002, 999003);
-- Expected: 2 messages (999001 has 2 messages)

-- ============================================================================
-- PART 2: MANUAL TEST EXECUTION
-- ============================================================================

-- TEST 1: SINGLE-USE COMPLAINT LINKS
-- ===================================

-- Test 1.1: Verify fresh token allows raise
-- ────────────────────────────────────────
SELECT 'TEST 1.1: Fresh token (unconsumed)' as test;
-- 
-- Step A: Check token status in DB
SELECT token, consumed_at FROM complaint_access_links WHERE token='TEST_TOKEN_FRESH';
-- Expected: consumed_at IS NULL (not yet consumed)
--
-- Step B: Call RPC as anonymous (no auth)
--   RPC: get_complaint_by_token('TEST_TOKEN_FRESH')
--   Expected response:
--   {
--     "mode": "raise",
--     "can_raise": true,
--     "entry_summary": { reg_number, model, customer_name, ... },
--     "ticket": null,
--     "messages": [],
--     "activity": []
--   }
--
-- Step C: Call raise_complaint RPC
--   RPC: raise_complaint('TEST_TOKEN_FRESH', 'general', 'Test Title', 'Test Description')
--   Expected: Returns JSON with newly created complaint ticket
--   Expected: consumed_at is now set in DB
--
-- Verification Query (post-raise):
SELECT token, consumed_at FROM complaint_access_links WHERE token='TEST_TOKEN_FRESH';
-- Expected: consumed_at should now have a timestamp

-- Test 1.2: Verify consumed token returns view-only mode
-- ──────────────────────────────────────────────────────
SELECT 'TEST 1.2: Consumed token' as test;
--
-- Step A: Call RPC as anonymous
--   RPC: get_complaint_by_token('TEST_TOKEN_SINGLE_USE')
--   Expected response:
--   {
--     "mode": "view",
--     "can_raise": false,
--     "entry_summary": { ... },
--     "ticket": { actual ticket data },
--     "messages": [ array of messages ],
--     "activity": [ array of activity ]
--   }
--
-- Note: The ticket data should be populated (mode='view'), not null

-- Test 1.3: Verify invalid token returns error
-- ────────────────────────────────────────────
SELECT 'TEST 1.3: Invalid token' as test;
--
-- Step A: Call RPC with fake token
--   RPC: get_complaint_by_token('INVALID_FAKE_TOKEN_XYZ')
--   Expected: ERROR or error response with message like "Link not found" or similar

-- ============================================================================

-- TEST 2: TENANT ISOLATION VIA RLS
-- =================================

-- Test 2.1: Staff from Dealer A sees only Dealer A tickets
-- ────────────────────────────────────────────────────────
SELECT 'TEST 2.1: Tenant isolation - authenticated access' as test;
--
-- Setup: Create auth session as staff user from TEST_DEALER_A
-- (In your app: supabase.auth.signInWithPassword({ email: ..., password: ... }))
--
-- Then execute directly in SQL Editor with that auth context:
SELECT ticket_number, dealer_code FROM complaint_tickets WHERE dealer_code IN ('TEST_DEALER_A', 'TEST_DEALER_B');
-- Expected: Only CMP-999001-TEST and CMP-999003-SLA visible (TEST_DEALER_A)
-- NOT visible: CMP-999002-TEST (TEST_DEALER_B) - RLS blocks it
--
-- If you see CMP-999002, RLS policy is not working correctly!

-- Test 2.2: Anonymous user cannot query directly
-- ──────────────────────────────────────────────
SELECT 'TEST 2.2: Anon RLS block on direct table access' as test;
--
-- Setup: Sign out, use anon role
--
-- Attempt:
SELECT * FROM complaint_tickets;
-- Expected: ERROR - permission denied
--
-- Workaround still works:
--   RPC: get_complaint_by_token('TEST_TOKEN_FRESH')
--   Expected: Success (RPC is SECURITY DEFINER)

-- Test 2.3: Dealer B staff cannot see Dealer A tickets
-- ─────────────────────────────────────────────────────
SELECT 'TEST 2.3: Cross-dealer access prevented' as test;
--
-- Setup: Sign in as staff from TEST_DEALER_B
--
-- Verify no Dealer A tickets visible:
SELECT ticket_number, dealer_code FROM complaint_tickets;
-- Expected: Only CMP-999002-TEST visible
-- NOT visible: CMP-999001-TEST, CMP-999003-SLA

-- ============================================================================

-- TEST 3: INTERNAL NOTES HIDDEN FROM CUSTOMERS
-- =============================================

-- Test 3.1: Customer RPC hides internal messages
-- ───────────────────────────────────────────────
SELECT 'TEST 3.1: Internal message filtering in RPC' as test;
--
-- Verification query (staff view - should see all):
SELECT id, author_name, body, is_internal FROM complaint_messages 
  WHERE complaint_id=999001 
  ORDER BY created_at;
-- Expected result:
--   999001 | Customer     | "This is a customer message"       | false
--   999002 | Staff        | "This is an internal staff note"   | true
--
-- Manual test (customer RPC):
--   RPC: get_complaint_by_token('TEST_TOKEN_FRESH')  [or any valid token]
--   In response.messages array:
--   Expected: Only message about "customer message"
--   NOT present: Message about "internal staff note"
--
-- If you see is_internal=true in customer response, filtering is broken!

-- ============================================================================

-- TEST 4: SLA BREACH DETECTION
-- =============================

-- Test 4.1: Verify SLA breach flags are set
-- ──────────────────────────────────────────
SELECT 'TEST 4.1: SLA breach flag accuracy' as test;
--
-- Check ticket with expired SLAs:
SELECT 
  ticket_number,
  response_due_at,
  resolution_due_at,
  response_breached,
  resolution_breached,
  NOW() as current_time
FROM complaint_tickets 
WHERE id = 999003;
--
-- Expected:
--   response_due_at < NOW()            → response_breached should be TRUE
--   resolution_due_at < NOW()          → resolution_breached should be TRUE
--
-- If flags are still FALSE when times are in past: Trigger not working!

-- Test 4.2: SLA recalculation on priority change
-- ────────────────────────────────────────────────
SELECT 'TEST 4.2: SLA recalculation on priority change' as test;
--
-- Initial state (from query above):
--   priority: 'high'
--   response_due_at, resolution_due_at: specific values
--
-- Step A: Call RPC to change priority
--   RPC: set_priority(999003, 'urgent')
--   Expected: RPC succeeds
--
-- Step B: Query ticket again
SELECT 
  priority,
  response_due_at,
  resolution_due_at,
  response_breached,
  resolution_breached
FROM complaint_tickets 
WHERE id = 999003;
--
-- Expected:
--   priority: 'urgent'
--   response_due_at: EARLIER than before (urgent has shorter SLA)
--   resolution_due_at: EARLIER than before (urgent has shorter SLA)
--   Breach flags: May change based on new due times

-- Test 4.3: SLA breach detection function
-- ────────────────────────────────────────
SELECT 'TEST 4.3: check_complaint_sla_breaches() function' as test;
--
-- Call RPC:
--   RPC: SELECT * FROM check_complaint_sla_breaches()
--
-- Expected response:
--   breached_count: >= 1 (should include CMP-999003)
--   escalated_count: >= 0 (depends on escalation status)
--
-- Verify manually:
SELECT breached_count, escalated_count FROM check_complaint_sla_breaches();

-- ============================================================================

-- TEST 5: RBAC PERMISSION GATING
-- ===============================

-- Test 5.1: User without modify permission cannot update
-- ──────────────────────────────────────────────────────
SELECT 'TEST 5.1: Permission denial on modify action' as test;
--
-- Setup: Sign in as viewer@test.com (no modify permission)
--
-- Attempt to call:
--   RPC: start_progress(999001)
--
-- Expected: ERROR - permission denied / insufficient permissions
-- NOT expected: Status change to 'in_progress'
--
-- Verification (should still be 'new'):
SELECT ticket_number, status FROM complaint_tickets WHERE id=999001;

-- Test 5.2: User with modify permission can update
-- ─────────────────────────────────────────────────
SELECT 'TEST 5.2: Permission grant on modify action' as test;
--
-- Setup: Sign in as modifier@test.com (has modify permission)
--
-- Call:
--   RPC: start_progress(999001)
--
-- Expected: Success
-- Verify status changed:
SELECT ticket_number, status FROM complaint_tickets WHERE id=999001;
-- Expected: status = 'in_progress'

-- Test 5.3: Admin bypasses permission checks
-- ───────────────────────────────────────────
SELECT 'TEST 5.3: Admin unrestricted access' as test;
--
-- Setup: Sign in as admin user (is_admin()=true)
--
-- Test all staff RPCs:
--   1. acknowledge(999001)
--   2. startProgress(999001)
--   3. resolve(999001)
--   4. close(999001)
--   5. escalate(999001, 'test reason')
--   6. reassign(999001, <staff_uuid>)
--   7. setPriority(999001, 'urgent')
--   8. addStaffMessage(999001, 'test message', false)
--
-- Expected: All calls succeed regardless of permission

-- ============================================================================

-- TEST 6: SINGLE-USE RAISE IDEMPOTENCE
-- =====================================

-- Test 6.1: Second raise with same token fails
-- ──────────────────────────────────────────────
SELECT 'TEST 6.1: Raise idempotence' as test;
--
-- Pre-condition: Use a fresh token that hasn't been used yet
-- (You may need to create a new token and insert it)
--
-- Step A: First raise call
--   RPC: raise_complaint('TEST_TOKEN_FRESH', 'general', 'First Complaint', 'Description')
--   Expected: Success, ticket created, consumed_at set
--
-- Verify first call succeeded:
SELECT token, consumed_at FROM complaint_access_links 
  WHERE token='TEST_TOKEN_FRESH' AND consumed_at IS NOT NULL;
-- Expected: Single row with consumed_at timestamp
--
-- Step B: Second raise call with SAME token
--   RPC: raise_complaint('TEST_TOKEN_FRESH', 'general', 'Second Complaint', 'Another desc')
--   Expected: ERROR - link already consumed
--
-- Step C: Verify only one ticket was created
SELECT COUNT(*) as tickets_created FROM complaint_tickets 
  WHERE ticket_number LIKE 'CMP-%' AND created_at > NOW() - INTERVAL '5 minutes';
-- Expected: Count should be just 1 (not 2)

-- ============================================================================
-- PART 3: RESULTS & REPORTING
-- ============================================================================

-- PASS/FAIL CRITERIA
-- ==================
-- 
-- ✓ PASS: All 6 test categories return expected results
-- ✗ FAIL: Any test returns unexpected result or error
--
-- Each test has explicit expected/not-expected outcomes.
-- If actual ≠ expected: Document failure and investigate root cause.

-- FAILURE INVESTIGATION CHECKLIST
-- ================================
-- If test fails, check:
--
-- [ ] Test data created correctly (Step 1.1 verification)
-- [ ] RPC functions exist and are callable (SELECT proname FROM pg_proc WHERE proname LIKE 'raise_complaint')
-- [ ] Triggers firing correctly (Check created_at and updated_at timestamps)
-- [ ] RLS policies exist on all complaint tables (SELECT policyname FROM pg_policies WHERE tablename LIKE 'complaint%')
-- [ ] RBAC functions working (SELECT has_module_modify('complaints') - should return true/false based on user)
-- [ ] Database state consistent (No orphaned records, cascades working)

-- ============================================================================
-- PART 4: CLEANUP (Optional)
-- ============================================================================

-- After testing, optionally clean up test data:
--
-- DELETE FROM complaint_messages WHERE complaint_id IN (999001, 999002, 999003);
-- DELETE FROM complaint_tickets WHERE id IN (999001, 999002, 999003);
-- DELETE FROM complaint_access_links WHERE token IN ('TEST_TOKEN_SINGLE_USE', 'TEST_TOKEN_FRESH');
-- DELETE FROM users WHERE email IN ('viewer@test.com', 'modifier@test.com');

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- 
-- This test suite validates the core business logic of the complaints module:
-- - Single-use links prevent duplicate complaint creation
-- - Tenant isolation ensures data privacy
-- - Internal notes are hidden from customers
-- - SLA tracking and breach detection work correctly
-- - RBAC gates prevent unauthorized modifications
--
-- Estimated time: 45 minutes for full manual verification
-- Automation: pgTAP can automate these tests once installed
-- Next: Document results and move migration to exec_success_migrations/
--
-- ============================================================================

-- ============================================================================
-- PART 5: FORMAL SCRIPTED E2E (MINT -> RAISE -> TRACK -> REOPEN)
-- ============================================================================
--
-- Objective:
--   Provide one repeatable scripted flow artifact for customer portal validation.
--
-- Preconditions:
--   1) Complaints module migrations are applied.
--   2) Staff user with complaints modify access is available.
--   3) Valid reception entry exists for selected dealer.
--
-- Test Data Sheet:
--   Environment: __________________________
--   Dealer code: _________________________
--   Reception entry id: __________________
--   Staff user email: ____________________
--   Customer phone: ______________________
--
-- Step 1: Mint complaint link
--   Action:
--     - As staff, mint link via UI or generate_complaint_link(reception_entry_id)
--   Expected:
--     - Token + URL returned
--     - Link status is active
--   Evidence:
--     - Screenshot/RPC response + token prefix
--
-- Step 2: Open token in anonymous browser
--   Expected:
--     - Portal loads in raise mode
--     - Vehicle/visit context visible
--
-- Step 3: Raise complaint
--   Action:
--     - Select category + severity
--     - Enter description + valid 10-digit contact
--   Expected:
--     - Success confirmation shown
--     - Complaint number generated
--     - Link transitions to view behavior
--
-- Step 4: Track complaint on same link
--   Expected:
--     - Tracker shows ticket number + status stepper
--     - Conversation and SLA block visible
--
-- Step 5: Staff updates complaint
--   Action:
--     - Acknowledge and optionally move to in_progress
--     - Add one staff reply
--   Expected:
--     - Status persists after hard refresh
--     - Customer tracker reflects updated status + reply
--
-- Step 6: Resolve complaint
--   Expected:
--     - Customer sees resolved state
--     - CSAT widget visible if not yet rated
--
-- Step 7: Reopen from customer portal
--   Action:
--     - Enter reopen reason and confirm
--   Expected:
--     - Reopen success shown
--     - Staff side shows reopened/escalated behavior
--
-- Step 8: Persistence verification
--   Action:
--     - Hard refresh both customer and staff views
--   Expected:
--     - Latest status/messages do not revert
--
-- Optional read verification queries:
--
-- SELECT id, ticket_number, status, is_escalated, updated_at
-- FROM public.complaint_tickets
-- WHERE id = <complaint_id>;
--
-- SELECT id, author_type, is_internal, body, created_at
-- FROM public.complaint_messages
-- WHERE complaint_id = <complaint_id>
-- ORDER BY created_at;
--
-- Sign-off:
--   QA: ________________________
--   Product: ___________________
--   Engineering: _______________
--
-- ============================================================================
