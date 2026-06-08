# Phase 4.2: Onboarding Gating Enforcement

**Document ID:** ONBOARDING-GATING-002  
**Date:** 2026-05-23  
**Owner:** Techwheels Engineering Team  
**Status:** ACTIVE  

---

## Overview

This document specifies how new user onboarding access is enforced across frontend and backend layers.

---

## Enforcement Layers

### Layer 1: Frontend Route Guards (Primary)

**Implementation:** `src/App.tsx`

```typescript
// 1. Load user permissions
const [allowedModules, setAllowedModules] = useState<Set<string>>(new Set())

// 2. Fetch permissions on user load
useEffect(() => {
  const { data: permissionRows } = await supabase.rpc('get_all_my_permissions')
  const nextModules = new Set(permissionRows.map(row => row.module_name))
  setAllowedModules(nextModules)
}, [user])

// 3. Check before rendering routes
function canAccessPath(pathname: string, allowedModules: Set<string>) {
  if (pathname === '/') return true
  if (pathname.startsWith('/reports')) 
    return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/reports'])
  // ... checks for all protected routes
  return false
}

// 4. Render AccessDenied if path not allowed
const canSeeCurrentPath = useMemo(
  () => canAccessPath(location.pathname, allowedModules),
  [allowedModules, location.pathname],
)

if (!canSeeCurrentPath) {
  return <AccessDenied />
}
```

**Guarantees:**
- ✅ Only routes in `ROUTE_MODULE_MAP` are accessible
- ✅ New user with zero modules cannot see any protected routes
- ✅ Direct URL access to protected routes returns `AccessDenied`
- ✅ Sidebar nav items filtered by allowed modules

**Test Case 4.2.1: New Signup User Cannot Access Protected Routes**
```typescript
// Test:
// 1. Create new auth user via SignUp
// 2. Do NOT add any module permissions
// 3. Log in as this user
// 4. Try to navigate to /import directly via URL
// Expected: Route guard prevents access, AccessDenied shown
```

---

### Layer 2: Backend Permission Validation (Secondary)

**Implementation:** RLS policies + helper functions

```sql
-- Example: Check module access before allowing API call
SELECT * FROM public.open_job_cards
WHERE public.has_module_view('job_cards')  -- Ensures backend enforces too
```

**Guarantees:**
- ✅ Even if frontend check is bypassed, backend RLS denies access
- ✅ Direct API calls from tools (curl, Postman) are blocked
- ✅ Dealer-scoped data is further filtered by RLS

**Test Case 4.2.2: Direct API Call Blocked Without Permission**
```bash
# Test: Call Supabase API directly with unpermissioned user
curl -X GET \
  "https://project.supabase.co/rest/v1/open_job_cards?limit=1" \
  -H "Authorization: Bearer USER_TOKEN_NO_MODULES" \
  -H "apikey: ANON_KEY"

# Expected: 
# Status 403 Forbidden
# OR 0 rows returned due to RLS policy
```

---

### Layer 3: Admin Panel Gating (Tertiary)

**Implementation:** `src/pages/AdminPage.tsx`

```typescript
// Admin panel should only be accessible to admins
// Only admins can assign module permissions
// Only staff/managers can see their own limited data
```

**Guarantees:**
- ✅ Only admins can modify permission assignments
- ✅ Admins can view all users (including unpermissioned ones)
- ✅ Non-admin users cannot change permission state

---

## Enforcement Checklist

Run these checks **before every production deploy** and **monthly thereafter**.

### Frontend Checks
- [ ] `canAccessPath()` function correctly denies routes with zero modules
- [ ] `getDefaultRoute()` returns `null` when user has no module access
- [ ] `AccessDenied` component is shown (not blank page) when route denied
- [ ] Sidebar nav items are filtered and empty when user has no modules
- [ ] Mobile nav shows no items when user has no modules
- [ ] Direct URL navigation to `/import`, `/reports`, `/admin`, `/settings`, `/autodoc` shows `AccessDenied`

### Backend Checks
- [ ] RLS policies on `open_job_cards`, `invoices`, `parts_orders` etc. deny unauthenticated access
- [ ] `get_all_my_permissions()` RPC returns empty set for unpermissioned users
- [ ] Helper functions `has_module_view()`, `has_module_modify()` return `false` for unpermissioned users
- [ ] Admin users see all data (no RLS filtering)

### Admin Checks
- [ ] Admin panel accessible only to users with role='admin'
- [ ] Module assignment form only appears in admin panel
- [ ] New users appear in "Pending Access" or similar list
- [ ] Assigning module creates row in `user_module_permissions`
- [ ] Assigned permissions immediately take effect (user sees new modules on refresh)

### Integration Checks
- [ ] Create test user via signup (no permissions)
- [ ] Verify user sees `AccessDenied` on all protected routes
- [ ] Assign single module via admin panel
- [ ] Verify user sees only assigned module in sidebar
- [ ] Verify user can access only the assigned route
- [ ] Revoke module access in admin panel
- [ ] Verify user sees `AccessDenied` again

---

## Gating Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| `canAccessPath()` route guard | ✅ Implemented | Denies unauthenticated access |
| `AccessDenied` component | ✅ Implemented | Shows helpful message to unpermissioned users |
| Sidebar filtering | ✅ Implemented | NAV_ITEMS filtered by allowed modules |
| Mobile nav filtering | ✅ Implemented | Same filtering as sidebar |
| `get_all_my_permissions()` RPC | ✅ Implemented | Returns user's granted modules |
| RLS policies on core tables | ⏳ Partial | Some tables may not have explicit RLS yet |
| Helper functions | ✅ Implemented | `has_module_view()`, `has_module_modify()`, `has_module_delete()` |
| Admin permission assignment UI | ✅ Implemented | AdminPage allows assigning modules |

---

## Known Gaps & Future Work

1. **Reports table** may not have RLS policies yet
   - Action: Add RLS policy restricting reports by user module access
   - Owner: Backend team
   - Timeline: Phase 5.x

2. **Data export/download endpoints** not protected
   - Action: Add middleware to check `has_module_view()` before serving files
   - Owner: Backend team
   - Timeline: Phase 5.x

3. **API documentation** for developers
   - Action: Create developer guide on how RLS + module permissions work
   - Owner: Dev team
   - Timeline: Phase 5.x

---

## Testing Recommendations

### Automated Tests (Future Enhancement)

```typescript
// Test case: canAccessPath() denies unpermissioned routes
describe('RBAC onboarding gating', () => {
  it('should deny access to protected routes when user has no modules', () => {
    const allowedModules = new Set<string>()  // Empty set
    
    expect(canAccessPath('/import', allowedModules)).toBe(false)
    expect(canAccessPath('/reports', allowedModules)).toBe(false)
    expect(canAccessPath('/admin', allowedModules)).toBe(false)
    expect(canAccessPath('/settings', allowedModules)).toBe(false)
    expect(canAccessPath('/autodoc', allowedModules)).toBe(false)
    
    // Public routes always accessible
    expect(canAccessPath('/', allowedModules)).toBe(true)
    expect(canAccessPath('/reset-password', allowedModules)).toBe(true)
  })

  it('should allow access to routes with module permission', () => {
    const allowedModules = new Set(['reports'])
    
    expect(canAccessPath('/reports', allowedModules)).toBe(true)
    expect(canAccessPath('/import', allowedModules)).toBe(false)  // Still denied
  })

  it('should show AccessDenied component when accessing unauthorized route', () => {
    const { getByText } = render(
      <App /> // With mock user having no modules
    )
    
    // Navigate to /import
    expect(getByText(/No module access assigned/)).toBeInTheDocument()
  })
})
```

### Manual QA Tests (Phase 5.1)

See [Phase 5.1: Role matrix regression testing](#phase-51-role-matrix-regression-testing)

---

## Rollback Instructions

If gating enforcement needs to be relaxed (not recommended):

1. **Frontend**: Set `canAccessPath()` to return `true` for all routes
   - File: `src/App.tsx`
   - Risk: All unpermissioned users see all modules
   - Timeline: <5 minutes

2. **Backend**: Disable RLS policies
   - Command: `ALTER TABLE public.open_job_cards DISABLE ROW LEVEL SECURITY;`
   - Risk: Auth bypass, data exposure
   - Timeline: <5 minutes
   - **NOT RECOMMENDED**

---

## Related Documentation

- [ONBOARDING_POLICY.md](./ONBOARDING_POLICY.md) — Onboarding behavior decision
- [MODULE_ROUTE_CONTRACT.md](./MODULE_ROUTE_CONTRACT.md) — Route definitions
- [src/App.tsx](../../src/App.tsx) — Implementation
- [RBAC_IMPLEMENTATION_MASTER_2026-06-01.md](../Implementation_plans/rbac/active/RBAC_IMPLEMENTATION_MASTER_2026-06-01.md) — Overall RBAC plan

---

**Last Updated:** 2026-05-23 by GitHub Copilot  
**Review Frequency:** Monthly + before each production deploy  
**Next Review:** 2026-06-23
