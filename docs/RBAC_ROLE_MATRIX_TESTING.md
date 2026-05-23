# Phase 5.1: Role Matrix Regression Testing

**Test Plan ID:** QA-001  
**Date:** 2026-05-23  
**Owner:** QA Team + GitHub Copilot  
**Status:** READY FOR EXECUTION  

---

## Overview

This document specifies comprehensive regression tests to verify RBAC enforcement across all user roles and module combinations.

---

## Test Environment Setup

### Prerequisites
1. Staging environment with current schema and migrations applied
2. Sample data: Job cards, invoices, parts, employees
3. Test users created for each role
4. Frontend deployed with latest RBAC guards

### Test User Accounts

Create the following test users in staging:

| Username | Role | Module Permissions | Dealer Code | Purpose |
|----------|------|-------------------|-------------|---------|
| `test.admin@techwheels.dev` | admin | All modules | N/A (sees all) | Admin role baseline |
| `test.manager@techwheels.dev` | manager | job_cards, reports, employees | AJMR001 | Manager typical access |
| `test.staff@techwheels.dev` | staff | job_cards, employees | AJMR001 | Staff typical access |
| `test.viewer@techwheels.dev` | viewer | reports | AJMR001 | Viewer role (read-only) |
| `test.newuser@techwheels.dev` | staff | **(none)** | AJMR001 | New signup (no permissions) |
| `test.nocards@techwheels.dev` | staff | reports, employees | AJMR001 | Limited access (no job cards) |

---

## Test Execution Matrix

### Test Suite 1: Admin Role (test.admin@techwheels.dev)

**Expected Behavior:** Admin can see and modify all modules

| Test ID | Route | Action | Expected Result | Status |
|---------|-------|--------|-----------------|--------|
| 1.1.1 | `/import` | Navigate directly | ✅ Route loads, can import files | ⏳ Pending |
| 1.1.2 | `/reports` | Navigate and view all reports | ✅ All report categories visible | ⏳ Pending |
| 1.1.3 | `/settings` | View and manage employees | ✅ Can create/edit/delete employees | ⏳ Pending |
| 1.1.4 | `/admin` | Access admin panel | ✅ Can see user list and assign modules | ⏳ Pending |
| 1.1.5 | `/autodoc` | Access vehicle docs | ✅ Can create/edit panels and estimates | ⏳ Pending |
| 1.1.6 | Sidebar | Check visible nav items | ✅ All 5 nav items visible | ⏳ Pending |
| 1.1.7 | Mobile nav | Check visible items | ✅ All 5 nav items visible | ⏳ Pending |

### Test Suite 2: Manager Role (test.manager@techwheels.dev)

**Expected Behavior:** Manager can access job_cards, reports, employees

| Test ID | Route | Action | Expected Result | Status |
|---------|-------|--------|-----------------|--------|
| 2.1.1 | `/import` | Navigate directly | ✅ Route loads (has job_cards permission) | ⏳ Pending |
| 2.1.2 | `/reports` | Navigate and view | ✅ Can view reports (has reports permission) | ⏳ Pending |
| 2.1.3 | `/settings` | Navigate and manage | ✅ Can manage employees (has employees permission) | ⏳ Pending |
| 2.1.4 | `/admin` | Navigate directly | ❌ AccessDenied (no admin permission) | ⏳ Pending |
| 2.1.5 | `/autodoc` | Navigate directly | ✅ Can access (has job_cards permission) | ⏳ Pending |
| 2.1.6 | Sidebar | Check visible items | ✅ Import, Reports, Settings, AutoDoc visible; Admin hidden | ⏳ Pending |
| 2.1.7 | Mobile nav | Check visible items | ✅ Same as sidebar | ⏳ Pending |
| 2.1.8 | Direct URL: `/admin` | Try to access admin | ❌ AccessDenied screen shown | ⏳ Pending |

### Test Suite 3: Staff Role (test.staff@techwheels.dev)

**Expected Behavior:** Staff can access job_cards, employees (limited reports)

| Test ID | Route | Action | Expected Result | Status |
|---------|-------|--------|-----------------|--------|
| 3.1.1 | `/import` | Navigate directly | ✅ Route loads (has job_cards permission) | ⏳ Pending |
| 3.1.2 | `/reports` | Navigate directly | ❌ AccessDenied (no reports permission) | ⏳ Pending |
| 3.1.3 | `/settings` | Navigate and manage | ✅ Can manage employees (has employees permission) | ⏳ Pending |
| 3.1.4 | `/admin` | Navigate directly | ❌ AccessDenied (no admin permission) | ⏳ Pending |
| 3.1.5 | `/autodoc` | Navigate directly | ✅ Can access (has job_cards permission) | ⏳ Pending |
| 3.1.6 | Sidebar | Check visible items | ✅ Import, Settings, AutoDoc visible; Reports, Admin hidden | ⏳ Pending |
| 3.1.7 | Direct URL: `/reports` | Try access reports | ❌ AccessDenied screen shown | ⏳ Pending |

### Test Suite 4: Viewer Role (test.viewer@techwheels.dev)

**Expected Behavior:** Viewer can only access reports (read-only)

| Test ID | Route | Action | Expected Result | Status |
|---------|-------|--------|-----------------|--------|
| 4.1.1 | `/import` | Navigate directly | ❌ AccessDenied (no job_cards permission) | ⏳ Pending |
| 4.1.2 | `/reports` | Navigate and view | ✅ Can view reports (has reports permission) | ⏳ Pending |
| 4.1.3 | `/settings` | Navigate directly | ❌ AccessDenied (no employees permission) | ⏳ Pending |
| 4.1.4 | `/admin` | Navigate directly | ❌ AccessDenied (no admin permission) | ⏳ Pending |
| 4.1.5 | `/autodoc` | Navigate directly | ❌ AccessDenied (no job_cards permission) | ⏳ Pending |
| 4.1.6 | Sidebar | Check visible items | ✅ Only Reports visible | ⏳ Pending |
| 4.1.7 | Mobile nav | Check visible items | ✅ Only Reports visible | ⏳ Pending |
| 4.1.8 | Reports UI | Try to export data | ✅ Export works (if feature available) | ⏳ Pending |

### Test Suite 5: New User / No Permissions (test.newuser@techwheels.dev)

**Expected Behavior:** New users see AccessDenied on all protected routes

| Test ID | Route | Action | Expected Result | Status |
|---------|-------|--------|-----------------|--------|
| 5.1.1 | `/import` | Navigate directly | ❌ AccessDenied component shown | ⏳ Pending |
| 5.1.2 | `/reports` | Navigate directly | ❌ AccessDenied component shown | ⏳ Pending |
| 5.1.3 | `/settings` | Navigate directly | ❌ AccessDenied component shown | ⏳ Pending |
| 5.1.4 | `/admin` | Navigate directly | ❌ AccessDenied component shown | ⏳ Pending |
| 5.1.5 | `/autodoc` | Navigate directly | ❌ AccessDenied component shown | ⏳ Pending |
| 5.1.6 | Sidebar | Check visible items | ❌ No nav items visible | ⏳ Pending |
| 5.1.7 | AccessDenied message | Verify helpful copy | ✅ Message lists available modules and suggests contacting admin | ⏳ Pending |
| 5.1.8 | Root `/` | Navigate to root | ❌ Redirected to default route or AccessDenied | ⏳ Pending |
| 5.1.9 | Admin assigns module | Admin adds job_cards permission | ✅ User refreshes, sees import route in sidebar | ⏳ Pending |
| 5.1.10 | After assignment | User navigates to `/import` | ✅ Route loads and works | ⏳ Pending |

### Test Suite 6: Mixed Permissions (test.nocards@techwheels.dev)

**Expected Behavior:** Staff with only reports + employees (no job cards)

| Test ID | Route | Action | Expected Result | Status |
|---------|-------|--------|-----------------|--------|
| 6.1.1 | `/import` | Navigate directly | ❌ AccessDenied (no job_cards permission) | ⏳ Pending |
| 6.1.2 | `/reports` | Navigate and view | ✅ Can view reports (has reports permission) | ⏳ Pending |
| 6.1.3 | `/settings` | Navigate and manage | ✅ Can manage employees (has employees permission) | ⏳ Pending |
| 6.1.4 | `/admin` | Navigate directly | ❌ AccessDenied (no admin permission) | ⏳ Pending |
| 6.1.5 | `/autodoc` | Navigate directly | ❌ AccessDenied (no job_cards permission) | ⏳ Pending |
| 6.1.6 | Sidebar | Check visible items | ✅ Reports, Settings visible; Import, Admin, AutoDoc hidden | ⏳ Pending |

---

## Test Suite 7: Dealer Scoping (Data Isolation)

**Expected Behavior:** Users with job_cards permission can only see their own dealer's job cards

| Test ID | Setup | Action | Expected Result | Status |
|---------|-------|--------|-----------------|--------|
| 7.1.1 | User A (dealer AJMR001) with job_cards | Query `/import` job list | ✅ Only AJMR001 job cards shown | ⏳ Pending |
| 7.1.2 | User B (dealer AJMR002) with job_cards | Query `/import` job list | ✅ Only AJMR002 job cards shown | ⏳ Pending |
| 7.1.3 | User A attempts direct SQL | Query via API with user B's auth token | ❌ RLS policy blocks access to AJMR002 data | ⏳ Pending |
| 7.1.4 | Admin user | Query `/import` job list | ✅ All job cards visible (no dealer filtering) | ⏳ Pending |

---

## Test Suite 8: Session & Refresh Behavior

**Expected Behavior:** Permission changes take effect after logout/login or page refresh

| Test ID | Action | Expected Result | Status |
|---------|--------|-----------------|--------|
| 8.1.1 | User logs in with no permissions | ✅ AccessDenied on all routes | ⏳ Pending |
| 8.1.2 | Admin assigns module to user | ✅ Module appears in admin UI | ⏳ Pending |
| 8.1.3 | Same user logs out, logs back in | ✅ New module visible in sidebar | ⏳ Pending |
| 8.1.4 | User page refresh (F5) with new permissions | ✅ Sidebar updates, new route accessible | ⏳ Pending |
| 8.1.5 | Admin revokes module from user | ✅ Module removed from admin UI | ⏳ Pending |
| 8.1.6 | User logs out, logs back in after revocation | ❌ AccessDenied for revoked route | ⏳ Pending |

---

## Test Suite 9: Edge Cases & Security

**Expected Behavior:** Edge cases and potential bypasses are blocked

| Test ID | Scenario | Action | Expected Result | Status |
|---------|----------|--------|-----------------|--------|
| 9.1.1 | User with no modules | Try direct API call with curl | ❌ 403 Forbidden or 0 rows due to RLS | ⏳ Pending |
| 9.1.2 | User tries to modify API params | Change `user_id` in browser DevTools | ❌ Backend rejects (security_definer functions) | ⏳ Pending |
| 9.1.3 | Anon/unauthenticated access | Try to access `/import` without login | ❌ Redirected to login | ⏳ Pending |
| 9.1.4 | Expired JWT token | Wait for session to expire, try API call | ❌ 401 Unauthorized | ⏳ Pending |
| 9.1.5 | Mobile nav CSS breakpoint | Resize browser, verify nav filtering works | ✅ Mobile nav filters same as desktop | ⏳ Pending |
| 9.1.6 | Deep link in new tab | Open `/admin` in new tab as non-admin | ❌ Page loads, AccessDenied shown | ⏳ Pending |

---

## Test Execution Instructions

### Manual Testing (Recommended for Phase 5)

1. **Prepare environment:**
   ```bash
   # Deploy latest code
   npm run build
   # Verify staging env is current
   ```

2. **Create test users:**
   - Via Supabase dashboard or admin API
   - Record credentials in secure location

3. **Run test suites:**
   - For each test row: 
     - Log in as specified user
     - Navigate to route or perform action
     - Check result against "Expected Result"
     - Mark ✅ (passed) or ❌ (failed) with notes

4. **Document failures:**
   - Screenshot of failure state
   - Browser console errors
   - Network tab (API responses)
   - Expected vs actual result

5. **Escalate blockers:**
   - Critical (security bypass): Stop rollout
   - High (feature broken): Fix before rollout
   - Medium (UI issue): Fix post-rollout
   - Low (cosmetic): Future sprint

### Automated Testing (Future Enhancement)

```typescript
// Example: Playwright test
import { test, expect } from '@playwright/test'

test('manager cannot access admin route', async ({ page }) => {
  await page.goto('http://localhost:5173/admin')
  
  // Should show AccessDenied, not admin panel
  await expect(page.getByText('Module access required')).toBeVisible()
})

test('new user sees helpful AccessDenied message', async ({ page }) => {
  await page.goto('http://localhost:5173/import')
  
  await expect(page.getByText('Module access required')).toBeVisible()
  await expect(page.getByText('Job Cards')).toBeVisible()
  await expect(page.getByText('Request access')).toBeVisible()
})
```

---

## Success Criteria

- ✅ All tests in Matrix completed and documented
- ✅ Admin role passes all tests (can access all modules)
- ✅ Manager role passes all tests (correct permission subset)
- ✅ Staff role passes all tests (limited access)
- ✅ Viewer role passes all tests (read-only)
- ✅ New users pass all tests (blocked until permissions assigned)
- ✅ No security bypasses discovered
- ✅ Dealer scoping verified
- ✅ Session refresh behavior verified

---

## Rollout Checkpoint

✅ **Phase 5.1 Checklist:**
- [ ] All test suites executed
- [ ] No critical/high blockers
- [ ] QA sign-off obtained
- [ ] Results documented

**Next Step:** Phase 5.2 Direct URL bypass testing → Phase 5.3 Operations runbook → **SHIP** 🚀

---

## Related Documentation

- [RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md](../Implementation_plans/RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md) — Overall plan
- [MODULE_ROUTE_CONTRACT.md](./MODULE_ROUTE_CONTRACT.md) — Module/route mapping
- [ROUTE_STRATEGY_DECISION.md](./ROUTE_STRATEGY_DECISION.md) — Route design
- [ONBOARDING_POLICY.md](./ONBOARDING_POLICY.md) — New user behavior
- [RBAC_TABLE_ACCESS_VALIDATION_TESTS.md](../RBAC_TABLE_ACCESS_VALIDATION_TESTS.md) — Backend validation

---

**Last Updated:** 2026-05-23 by GitHub Copilot  
**QA Lead Signature:** _________________ (Date)  
**Ready for Execution:** ✅ 2026-05-23
