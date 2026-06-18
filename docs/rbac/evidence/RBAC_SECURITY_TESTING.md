# Phase 5.2: Direct URL Bypass & Security Testing

**Test Plan ID:** SECURITY-001  
**Date:** 2026-05-23  
**Owner:** QA Team + Security Review  
**Status:** READY FOR EXECUTION  

---

## Overview

This document specifies security-focused tests to verify that direct URL access and API-level bypasses cannot circumvent RBAC controls.

---

## Threat Model

### Attack Vectors Tested

1. **Direct URL Navigation** — User types unauthorized route in address bar
2. **Deep Linking** — User follows external link to protected route
3. **Browser History** — User clicks back button to revisit restricted page
4. **Direct API Calls** — User bypasses frontend, calls API directly
5. **Parameter Manipulation** — User modifies URL/API params to access others' data
6. **Session Hijacking** — User attempts to use another user's token
7. **Token Expiration** — User continues action with expired JWT
8. **Cache Bypass** — User clears cache and tries old URL

---

## Test Suite 1: Direct URL Navigation (Frontend)

**Scenario:** User types URL directly in address bar for unauthorized route

### Test 1.1: New User Direct URL to Protected Routes

| Test ID | URL | User | Expected Behavior | Actual | Status |
|---------|-----|------|-------------------|--------|--------|
| 1.1.1 | `http://localhost:5173/import` | test.newuser@techwheels.dev (no modules) | ✅ AccessDenied component shown | ___ | ⏳ Pending |
| 1.1.2 | `http://localhost:5173/reports` | test.newuser@techwheels.dev (no modules) | ✅ AccessDenied component shown | ___ | ⏳ Pending |
| 1.1.3 | `http://localhost:5173/settings` | test.newuser@techwheels.dev (no modules) | ✅ AccessDenied component shown | ___ | ⏳ Pending |
| 1.1.4 | `http://localhost:5173/admin` | test.newuser@techwheels.dev (no modules) | ✅ AccessDenied component shown | ___ | ⏳ Pending |
| 1.1.5 | `http://localhost:5173/autodoc` | test.newuser@techwheels.dev (no modules) | ✅ AccessDenied component shown | ___ | ⏳ Pending |

### Test 1.2: Unauthorized User to Module-Specific Routes

| Test ID | URL | User | Module Permissions | Expected Behavior | Status |
|---------|-----|------|-------------------|-------------------|--------|
| 1.2.1 | `http://localhost:5173/admin` | test.staff@techwheels.dev | job_cards, employees | ✅ AccessDenied (no admin role) | ⏳ Pending |
| 1.2.2 | `http://localhost:5173/reports` | test.staff@techwheels.dev | job_cards, employees | ✅ AccessDenied (no reports module) | ⏳ Pending |
| 1.2.3 | `http://localhost:5173/import` | test.viewer@techwheels.dev | reports | ✅ AccessDenied (no job_cards module) | ⏳ Pending |
| 1.2.4 | `http://localhost:5173/settings` | test.viewer@techwheels.dev | reports | ✅ AccessDenied (no employees module) | ⏳ Pending |
| 1.2.5 | `http://localhost:5173/autodoc` | test.viewer@techwheels.dev | reports | ✅ AccessDenied (no job_cards module) | ⏳ Pending |

### Test 1.3: Sub-Routes and Deep Links

| Test ID | URL | User | Expected Behavior | Status |
|---------|-----|------|-------------------|--------|
| 1.3.1 | `http://localhost:5173/reports/labour-revenue/open_labour_kms` | test.staff (no reports module) | ✅ AccessDenied (RLS on sub-route) | ⏳ Pending |
| 1.3.2 | `http://localhost:5173/autodoc/12345` | test.viewer (no job_cards module) | ✅ AccessDenied (no job_cards permission) | ⏳ Pending |
| 1.3.3 | `http://localhost:5173/import?tab=history` | test.viewer (no job_cards module) | ✅ AccessDenied (params don't bypass guard) | ⏳ Pending |

---

## Test Suite 2: Browser History & Back Button

**Scenario:** User navigates through app, then tries to use browser back button to revisit restricted page

### Test 2.1: Back Button Does Not Restore Access

| Test ID | Sequence | Expected | Status |
|---------|----------|----------|--------|
| 2.1.1 | 1. Admin logs in to `/admin` ✅ 2. Admin views `/reports` ✅ 3. Logout 4. New user logs in 5. User presses back (browser) | ✅ Cannot restore to `/admin` (different user context) | ⏳ Pending |
| 2.1.2 | 1. Manager views `/import` (allowed) 2. Manager tries to navigate to `/admin` (blocked) 3. Back button | ✅ Returns to `/import` (last allowed page) | ⏳ Pending |
| 2.1.3 | 1. View protected page in tab A 2. Use back button repeatedly | ✅ Cannot go past login/auth boundaries | ⏳ Pending |

---

## Test Suite 3: Direct API Calls (Backend Security)

**Scenario:** User uses curl, Postman, or dev console to call API directly

### Test 3.1: Unauthenticated API Access

```bash
# Test 3.1.1: Query without token
curl -X GET "http://localhost:3000/rest/v1/open_job_cards?limit=1" \
  -H "apikey: ANON_KEY"

# Expected: 403 Forbidden or 0 rows due to RLS
```

```bash
# Test 3.1.2: Query without apikey
curl -X GET "http://localhost:3000/rest/v1/open_job_cards?limit=1"

# Expected: 401 Unauthorized
```

### Test 3.2: Authenticated but Unpermissioned Access

```bash
# Setup: Get auth token for test.newuser (no modules)
# Test 3.2.1: Query job_cards table
curl -X GET "http://localhost:3000/rest/v1/open_job_cards?limit=1" \
  -H "Authorization: Bearer TOKEN_NEWUSER" \
  -H "apikey: ANON_KEY"

# Expected: 0 rows returned (RLS filters due to lack of has_module_view('job_cards'))
```

```bash
# Test 3.2.2: Query invoices table without invoices permission
curl -X GET "http://localhost:3000/rest/v1/invoices?limit=1" \
  -H "Authorization: Bearer TOKEN_STAFF" \  # staff has job_cards, employees only
  -H "apikey: ANON_KEY"

# Expected: 0 rows (RLS policy checks has_module_view('invoices'))
```

### Test 3.3: Parameter Tampering

```bash
# Setup: User has job_cards permission for dealer AJMR001
# Test 3.3.1: Try to filter by different dealer in WHERE clause
curl -X GET "http://localhost:3000/rest/v1/open_job_cards?branch=eq.AJMR002" \
  -H "Authorization: Bearer TOKEN_STAFF_AJMR001" \
  -H "apikey: ANON_KEY"

# Expected: 0 rows (RLS enforces dealer_code match regardless of WHERE clause)
```

```bash
# Test 3.3.2: Try to SELECT user_id of another user
curl -X GET "http://localhost:3000/rest/v1/users?id=eq.OTHER_USER_ID" \
  -H "Authorization: Bearer TOKEN_STAFF" \
  -H "apikey: ANON_KEY"

# Expected: 0 rows or 403 (users table has RLS)
```

### Test 3.4: RPC Function Bypass Attempts

```bash
# Test 3.4.1: Call permission check function as unpermissioned user
curl -X POST "http://localhost:3000/rest/v1/rpc/has_module_view" \
  -H "Authorization: Bearer TOKEN_NEWUSER" \
  -H "Content-Type: application/json" \
  -d '{"p_module": "job_cards"}'

# Expected: false (function correctly denies access)
```

```bash
# Test 3.4.2: Try to call admin-only RPC as staff user
curl -X POST "http://localhost:3000/rest/v1/rpc/assign_module_permission" \
  -H "Authorization: Bearer TOKEN_STAFF" \
  -H "Content-Type: application/json" \
  -d '{"p_user_id": "...", "p_module_id": 1}'

# Expected: 403 Forbidden (security_definer function rejects non-admin)
```

---

## Test Suite 4: Session & Token Attacks

**Scenario:** User attempts to manipulate or reuse tokens

### Test 4.1: Token Expiration Enforcement

| Test ID | Action | Expected | Status |
|---------|--------|----------|--------|
| 4.1.1 | Get valid auth token, wait 24h (or force expiry) | ✅ API returns 401 Unauthorized | ⏳ Pending |
| 4.1.2 | Use expired token to call RPC | ✅ 401 Unauthorized (backend rejects) | ⏳ Pending |
| 4.1.3 | Use expired token for row-level queries | ✅ RLS enforces auth check, returns 401 | ⏳ Pending |

### Test 4.2: Cross-User Token Injection

```bash
# Setup: Two users with different permissions
# User A: admin, User B: staff (job_cards only)
# Test: User A gets User B's token, tries to query as User B

curl -X GET "http://localhost:3000/rest/v1/open_job_cards?limit=1" \
  -H "Authorization: Bearer TOKEN_USER_B" \
  -H "apikey: ANON_KEY"

# Expected: 
# - If User B has no dealer set: 0 rows
# - If User B has dealer set: Only User B's dealer data visible (isolation works)
# - User A cannot escalate to User B's context
```

### Test 4.3: JWT Claim Tampering

| Test ID | Modification | Expected | Status |
|---------|--------------|----------|--------|
| 4.3.1 | Modify JWT sub (user ID) | ✅ Signature invalid, 401 Unauthorized | ⏳ Pending |
| 4.3.2 | Modify JWT exp (expiration) | ✅ Signature invalid, 401 Unauthorized | ⏳ Pending |
| 4.3.3 | Add fake JWT claim | ✅ Backend ignores (Supabase validates signature) | ⏳ Pending |

---

## Test Suite 5: Cache & Storage Attacks

**Scenario:** User manipulates browser cache or local storage

### Test 5.1: LocalStorage Bypass

| Test ID | Action | Expected | Status |
|---------|--------|----------|--------|
| 5.1.1 | Delete localStorage.permissions | ✅ App reloads permissions from RPC on mount | ⏳ Pending |
| 5.1.2 | Modify localStorage to add fake modules | ✅ Frontend permission check reloads from RPC (not LocalStorage) | ⏳ Pending |
| 5.1.3 | Inspect React component state | ✅ Frontend state only reflects actual RPC response | ⏳ Pending |

### Test 5.2: Browser Cache

| Test ID | Action | Expected | Status |
|---------|--------|----------|--------|
| 5.2.1 | Access `/import` (allowed), then clear all cache | ✅ Page request goes to server, permission re-checked | ⏳ Pending |
| 5.2.2 | Old page cached in browser history | ✅ Page loads but permissions re-validated on mount | ⏳ Pending |

---

## Test Suite 6: CORS & CSRF Bypass Attempts

**Scenario:** Attacker tries cross-origin or cross-site attacks

### Test 6.1: Cross-Origin Requests

```bash
# Attempt from different origin
curl -X GET "http://localhost:3000/rest/v1/open_job_cards" \
  -H "Authorization: Bearer TOKEN" \
  -H "Origin: https://attacker.com"

# Expected: 
# - Browser: CORS error (blocked)
# - Backend: Request accepted but CORS header not sent
# Either way: Attacker cannot access data
```

### Test 6.2: CSRF Token Check

| Test ID | Scenario | Expected | Status |
|---------|----------|----------|--------|
| 6.2.1 | POST to admin panel without CSRF token | ✅ Request rejected (if CSRF protection in place) | ⏳ Pending |
| 6.2.2 | Embedded form from different domain | ✅ Same-origin policy blocks submission | ⏳ Pending |

---

## Test Suite 7: Admin Panel Abuse

**Scenario:** Non-admin tries to access admin functions

### Test 7.1: Admin Endpoint Restrictions

| Test ID | Endpoint | User | Action | Expected | Status |
|---------|----------|------|--------|----------|--------|
| 7.1.1 | `/admin` page load | test.staff | Navigate to `/admin` | ✅ AccessDenied component | ⏳ Pending |
| 7.1.2 | User assignment API | test.staff | POST to assign module to user | ✅ 403 Forbidden (security_definer rejects) | ⏳ Pending |
| 7.1.3 | User list query | test.staff | Query `public.users` table | ✅ RLS hides other users (only see self) | ⏳ Pending |

---

## Test Execution Checklist

### Before Testing

- [ ] Staging environment deployed with latest code
- [ ] All test users created with documented permissions
- [ ] Backend API endpoint and auth token retrieval method known
- [ ] Postman/curl environment configured
- [ ] Browser DevTools console/Network tab ready

### During Testing

- [ ] Run each test case in order
- [ ] Document PASS/FAIL with evidence (screenshots, logs)
- [ ] Record any unexpected behavior
- [ ] Note timing (does it take 100ms? 5s?)

### After Testing

- [ ] Summarize results (pass rate, failures)
- [ ] Escalate critical findings (security bypasses)
- [ ] Create bug tickets for medium/low issues
- [ ] Document any environmental quirks
- [ ] Sign off on QA approval

---

## Success Criteria

✅ **All Direct URL Access is Blocked**
- No route accessible without proper permissions
- AccessDenied component shown consistently

✅ **All API Calls are Enforced**
- Unauthenticated requests return 401/403
- Unpermissioned requests return 0 rows (RLS)
- Parameter tampering doesn't bypass RLS

✅ **Token Security Verified**
- Expired tokens rejected
- Token tampering detected
- Cross-user token injection fails

✅ **No Cache/Storage Bypass**
- Clearing cache doesn't grant access
- Browser history doesn't restore permissions

✅ **Admin Functions Protected**
- Only admins can access admin routes
- Only admins can modify permissions
- Staff cannot escalate privileges

---

## Critical Findings Escalation

| Severity | Example | Action |
|----------|---------|--------|
| **CRITICAL** | User can bypass frontend and query another dealer's data | Stop rollout, fix immediately |
| **CRITICAL** | Non-admin can call admin RPC functions | Stop rollout, fix immediately |
| **HIGH** | AccessDenied not shown on some direct URLs | Fix before rollout |
| **MEDIUM** | Edge case in sub-route permission check | Fix in next sprint |
| **LOW** | Copy/formatting in error message | Document for next update |

---

## Related Documentation

- [RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md](../../Implementation_plans/webversion/categories/rbac/active/RBAC_IMPLEMENTATION_MASTER_2026-06-01.md) — Overall plan
- [RBAC_TABLE_ACCESS_VALIDATION_TESTS.md](RBAC_TABLE_ACCESS_VALIDATION_TESTS.md) — Backend validation
- [RBAC_ROLE_MATRIX_TESTING.md](RBAC_ROLE_MATRIX_TESTING.md) — Role matrix tests

---

**Last Updated:** 2026-05-23 by GitHub Copilot  
**Security Review Required:** ✅ Yes  
**Ready for Execution:** ✅ 2026-05-23
