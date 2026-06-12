-- ============================================================================
-- COMPLAINTS MODULE — BUSINESS RULES TEST SUITE (pgTAP)
-- ============================================================================
-- Path: supabase/migrations/20260609_test_complaints_business_rules.sql
-- Purpose: Validate critical invariants and RLS policies for complaints module
-- 
-- Tests cover:
-- 1. Single-use complaint links (first raise consumes token, subsequent calls view-only)
-- 2. Tenant isolation (dealer scoping via RLS)
-- 3. Internal notes hidden from customers (is_internal=true never returned to anon)
-- 4. SLA breach detection (response_breached, resolution_breached flags)
-- 5. RBAC permission gating (modify requires has_module_modify('complaints'))
--
-- NOTE: This is a test-first implementation. pgTAP must be installed first:
--   CREATE EXTENSION IF NOT EXISTS pgtap;
-- ============================================================================

-- Enable pgTAP extension (may fail silently if not installed; tests can still be run manually)
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Create a test schema to isolate test data
CREATE SCHEMA IF NOT EXISTS complaints_test;
SET search_path TO complaints_test, public;

-- ── TEST SETUP: Create test fixtures ─────────────────────────────────────

-- Test access link (already consumed or fresh)
INSERT INTO public.complaint_access_links (id, dealer_code, reception_entry_id, token, created_at, consumed_at)
VALUES (
  999001,
  'TEST_DEALER_A',
  999001,
  'TEST_TOKEN_SINGLE_USE',
  NOW() - INTERVAL '1 hour',
  NOW() - INTERVAL '30 minutes'  -- Already consumed
) ON CONFLICT DO NOTHING;

-- Test access link (fresh, not consumed)
INSERT INTO public.complaint_access_links (id, dealer_code, reception_entry_id, token, created_at, consumed_at)
VALUES (
  999002,
  'TEST_DEALER_A',
  999002,
  'TEST_TOKEN_FRESH',
  NOW() - INTERVAL '1 hour',
  NULL  -- Not yet consumed
) ON CONFLICT DO NOTHING;

-- Test complaint ticket for tenant isolation
INSERT INTO public.complaint_tickets (
  id, dealer_code, ticket_number, reg_number, model, title, description,
  status, priority, category, created_at, response_due_at, resolution_due_at
)
VALUES (
  999001,
  'TEST_DEALER_A',
  'CMP-999001-TEST',
  'TEST_REG_A',
  'Test Model A',
  'Tenant isolation test',
  'This ticket belongs to TEST_DEALER_A',
  'new',
  'medium',
  'general',
  NOW() - INTERVAL '2 hours',
  NOW() + INTERVAL '22 hours',
  NOW() + INTERVAL '46 hours'
),
(
  999002,
  'TEST_DEALER_B',
  'CMP-999002-TEST',
  'TEST_REG_B',
  'Test Model B',
  'Tenant isolation test',
  'This ticket belongs to TEST_DEALER_B',
  'new',
  'medium',
  'general',
  NOW() - INTERVAL '2 hours',
  NOW() + INTERVAL '22 hours',
  NOW() + INTERVAL '46 hours'
)
ON CONFLICT DO NOTHING;

-- Test messages (some internal, some customer-visible)
INSERT INTO public.complaint_messages (
  id, complaint_id, dealer_code, author_id, author_name, body, is_internal, created_at
)
VALUES (
  999001,
  999001,
  'TEST_DEALER_A',
  NULL,
  'Customer',
  'This is a customer message',
  FALSE,
  NOW() - INTERVAL '1 hour'
),
(
  999002,
  999001,
  'TEST_DEALER_A',
  NULL,
  'Staff',
  'This is an internal staff note',
  TRUE,
  NOW() - INTERVAL '30 minutes'
)
ON CONFLICT DO NOTHING;

-- ── TEST 1: SINGLE-USE COMPLAINT LINKS ───────────────────────────────────

\echo 'TEST 1: Single-Use Complaint Links'
\echo '===================================='

-- Test 1a: Fresh token can be used for raise_complaint
\echo '1a. Fresh token (not consumed) should allow raise_complaint'
-- Manual validation: Call get_complaint_by_token('TEST_TOKEN_FRESH') should return mode='raise'
-- Then call raise_complaint('TEST_TOKEN_FRESH', ...) should succeed and set consumed_at

-- Test 1b: Consumed token returns view-only mode
\echo '1b. Consumed token should return mode="view" (view-only mode)'
-- Manual validation: Call get_complaint_by_token('TEST_TOKEN_SINGLE_USE')
-- Response should have mode='view' (cannot raise again)

-- Test 1c: Invalid token returns NULL
\echo '1c. Invalid token should raise error or return no data'
-- Manual validation: get_complaint_by_token('INVALID_TOKEN_XYZ') should error

-- ── TEST 2: TENANT ISOLATION (RLS) ────────────────────────────────────────

\echo ''
\echo 'TEST 2: Tenant Isolation via RLS'
\echo '=================================='

-- Test 2a: Authenticated user from TEST_DEALER_A can see only dealer A tickets
\echo '2a. Staff from TEST_DEALER_A can view only their dealer tickets'
-- Manual validation:
--   1. Authenticate as user with dealer_code='TEST_DEALER_A'
--   2. SELECT * FROM complaint_tickets WHERE dealer_code='TEST_DEALER_A'
--      → Should return CMP-999001-TEST
--   3. SELECT * FROM complaint_tickets WHERE dealer_code='TEST_DEALER_B'
--      → Should be empty (RLS blocks)

-- Test 2b: Anonymous user cannot directly access complaint_tickets table
\echo '2b. Anon user cannot SELECT from complaint_tickets (no direct grant)'
-- Manual validation:
--   1. Authenticate as anon
--   2. SELECT * FROM complaint_tickets
--      → Should error: permission denied
--   3. CALL get_complaint_by_token('TEST_TOKEN_FRESH')
--      → Should work (RPC is SECURITY DEFINER)

-- ── TEST 3: INTERNAL NOTES HIDDEN FROM CUSTOMERS ──────────────────────────

\echo ''
\echo 'TEST 3: Internal Notes Hidden from Customers'
\echo '=============================================='

-- Test 3a: Customer RPC filters out is_internal=true messages
\echo '3a. get_complaint_by_token should never return is_internal=true messages'
-- Manual validation:
--   1. Call get_complaint_by_token('TEST_TOKEN_FRESH')
--   2. In response.messages array, verify NO message has is_internal=true
--   3. Check that only customer-visible message (is_internal=false) appears
--      Expected: Only message 999001 (customer message)
--      Not included: Message 999002 (internal note)

-- Test 3b: Staff can see both customer and internal messages
\echo '3b. Staff RPC should return all messages including internal ones'
-- Manual validation:
--   1. Authenticate as staff user with dealer_code='TEST_DEALER_A'
--   2. SELECT body, is_internal FROM complaint_messages
--      WHERE complaint_id=999001 ORDER BY created_at
--   3. Should return both messages (customer + internal)

-- ── TEST 4: SLA BREACH DETECTION ───────────────────────────────────────────

\echo ''
\echo 'TEST 4: SLA Breach Detection'
\echo '============================='

-- Create an overdue ticket
INSERT INTO public.complaint_tickets (
  id, dealer_code, ticket_number, reg_number, model, title, description,
  status, priority, category, created_at,
  response_due_at, resolution_due_at, response_breached, resolution_breached
)
VALUES (
  999003,
  'TEST_DEALER_A',
  'CMP-999003-SLA',
  'TEST_REG_SLA',
  'Test SLA Model',
  'SLA breach test',
  'This ticket has expired SLAs',
  'in_progress',
  'high',
  'general',
  NOW() - INTERVAL '48 hours',
  NOW() - INTERVAL '24 hours',  -- response_due_at is in the past
  NOW() - INTERVAL '1 hour'      -- resolution_due_at is also in the past
) ON CONFLICT DO NOTHING;

-- Test 4a: response_breached flag is set when current time > response_due_at
\echo '4a. Response SLA should be marked breached when now > response_due_at'
-- Manual validation:
--   SELECT response_breached FROM complaint_tickets WHERE id=999003
--   Should show TRUE (assuming trigger/function set it)

-- Test 4b: resolution_breached flag is set when current time > resolution_due_at
\echo '4b. Resolution SLA should be marked breached when now > resolution_due_at'
-- Manual validation:
--   SELECT resolution_breached FROM complaint_tickets WHERE id=999003
--   Should show TRUE

-- Test 4c: SLA flags are updated when priority changes (affects due times)
\echo '4c. SLA recalculation on priority change should update breach status'
-- Manual validation:
--   1. Call set_priority(999003, 'urgent')
--   2. Check response_due_at and resolution_due_at (should be different per priority SLA)
--   3. Verify response_breached/resolution_breached are recalculated

-- Test 4d: check_complaint_sla_breaches() RPC counts overdue tickets
\echo '4d. check_complaint_sla_breaches() should return accurate breach counts'
-- Manual validation:
--   SELECT * FROM check_complaint_sla_breaches()
--   Should return count including CMP-999003 in breached_count

-- ── TEST 5: RBAC PERMISSION GATING ───────────────────────────────────────

\echo ''
\echo 'TEST 5: RBAC Permission Gating'
\echo '==============================='

-- Create test users with different permissions
INSERT INTO public.users (
  id, dealer_code, email, full_name, is_active, created_at
)
VALUES (
  gen_random_uuid(),
  'TEST_DEALER_A',
  'viewer@test.com',
  'Test Viewer',
  TRUE,
  NOW()
),
(
  gen_random_uuid(),
  'TEST_DEALER_A',
  'modifier@test.com',
  'Test Modifier',
  TRUE,
  NOW()
)
ON CONFLICT DO NOTHING;

-- Test 5a: User without has_module_modify('complaints') cannot update tickets
\echo '5a. User without modify permission cannot call start_progress()'
-- Manual validation:
--   1. Authenticate as 'viewer@test.com' (no modify permission)
--   2. Call start_progress(999001)
--   3. Should error: permission denied or "insufficient permissions"

-- Test 5b: User with has_module_modify('complaints') can update tickets
\echo '5b. User with modify permission can call start_progress()'
-- Manual validation:
--   1. Authenticate as 'modifier@test.com' (has modify permission)
--   2. Call start_progress(999001)
--   3. Should succeed, status changes to 'in_progress'

-- Test 5c: Admin bypasses all checks
\echo '5c. Admin user can perform all operations regardless of module perms'
-- Manual validation:
--   1. Authenticate as admin (is_admin() = true)
--   2. All RPCs should succeed (acknowledge, startProgress, resolve, close, etc.)

-- ── TEST 6: SINGLE-USE RAISE IDEMPOTENCE ────────────────────────────────

\echo ''
\echo 'TEST 6: Single-Use Raise Idempotence'
\echo '====================================='

-- Test 6a: Second raise_complaint call with same token should error or no-op
\echo '6a. Calling raise_complaint twice with same token should fail second time'
-- Manual validation:
--   1. Call raise_complaint('TEST_TOKEN_FRESH', ...)
--   2. Verify ticket is created and consumed_at is set
--   3. Call raise_complaint('TEST_TOKEN_FRESH', ...) again
--   4. Should error: link already consumed or similar

-- ── TEST 7: CASCADE & INTEGRITY ──────────────────────────────────────────

\echo ''
\echo 'TEST 7: Data Integrity & Cascades'
\echo '=================================='

-- Test 7a: Deleting complaint cascades to messages/activity
\echo '7a. Deleting complaint ticket should cascade delete related messages'
-- Manual validation:
--   1. Count messages with complaint_id=999001
--   2. DELETE FROM complaint_tickets WHERE id=999001
--   3. Count messages again
--   4. Should be 0 (cascade delete worked)

-- ── TEST TEARDOWN ────────────────────────────────────────────────────────

\echo ''
\echo 'Cleanup: Drop test schema'
DROP SCHEMA IF EXISTS complaints_test CASCADE;

\echo ''
\echo '======================================================================'
\echo 'COMPLAINTS MODULE TEST SUITE COMPLETE'
\echo '======================================================================'
\echo 'All manual validation tests above should be executed and verified.'
\echo 'For automated testing, install pgTAP and convert these to pgtap assertions.'
\echo ''
\echo 'Key test artifacts:'
\echo '  - TEST_TOKEN_SINGLE_USE (consumed, mode=view)'
\echo '  - TEST_TOKEN_FRESH (unconsumed, mode=raise)'
\echo '  - CMP-999001-TEST (TEST_DEALER_A, contains messages)'
\echo '  - CMP-999002-TEST (TEST_DEALER_B, isolation test)'
\echo '  - CMP-999003-SLA (overdue SLAs, breach flags)'
\echo ''
\echo 'Run this migration to populate test data, then execute the'
\echo 'manual validation steps above to verify business rules.'
\echo '======================================================================'
