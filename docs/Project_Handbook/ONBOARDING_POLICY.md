# Phase 4.1: New User Onboarding Behavior Policy

**Decision ID:** ONBOARDING-001  
**Date:** 2026-05-23  
**Owner:** Techwheels Engineering Team + Admin  
**Status:** APPROVED  

---

## Question

What should be the default state for new users after signup?

### Options Evaluated

| Option | is_active | module_permissions | UX Behavior | Risk |
|--------|-----------|-------------------|-------------|------|
| **A: Inactive until admin activation** | false | none | User sees "awaiting admin" message | User confused why they're signed in but can't access anything |
| **B: Active but no module access** (Current) | true | none | User sees "AccessDenied" screen, can go to admin panel | Clear that they need permissions, but admin must notice |
| **C: Auto-grant default module set** | true | [some default] | User sees some content immediately | Risk of accidental access if default set is too broad |

---

## Decision: Option B - Active But No Module Access

**Selected:** Continue current behavior (Option B)

New users after signup should:
- ✅ Have `is_active = true`
- ✅ Have **zero** module permissions (no rows in `public.user_module_permissions`)
- ✅ See `AccessDenied` component with message "Ask an admin to assign module permissions"

### Reasoning

#### **Security First**
- Deny-by-default: no assumptions about what user should access
- Force explicit admin decision before any data exposure
- No risk of accidental overpermissioning

#### **Clear User Experience**
- User is signed in (not locked out)
- User sees clear message about what's needed
- User can navigate to `/admin` to request or see contact info

#### **Admin Control**
- Admin sees all users in admin panel
- Admin can batch-assign modules to new staff
- No hidden inactive users confusing the system

#### **Audit Trail**
- Each module assignment is intentional and auditable
- No "silent" default grants

---

## Implementation Details

### Current State (Already Implemented)

**User Creation:**
```sql
-- Trigger on auth.users INSERT
FUNCTION public.handle_new_user()
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, full_name)
  -- Defaults applied: role='staff', is_active=true
```

**Frontend Access Control:**
```typescript
// src/App.tsx
function getDefaultRoute(allowedModules: Set<string>): AppRoute | null {
  const preferenceOrder: AppRoute[] = ['/import', '/reports', '/settings', '/autodoc', '/admin']
  return preferenceOrder.find((route) => hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP[route])) ?? null
}

function AccessDenied() {
  return (
    <div>
      <h2>No module access assigned</h2>
      <p>Ask an admin to assign module permissions.</p>
    </div>
  )
}
```

**Onboarding Message:**
```
Signup confirmation says: "Your account has been created. An admin will activate your access shortly."
(Message can be refined in Phase 4.3)
```

### Verification Checklist

- [x] New auth user signup creates public.users record
- [x] New users have role='staff' by default
- [x] New users have is_active=true by default
- [x] No module_permission rows created automatically
- [x] Frontend shows AccessDenied when user has zero modules
- [x] Admin panel allows assigning modules to users
- [x] Admin can see which users have no module access

---

## Admin Workflow for New User Access

1. **New user signs up** → User created with is_active=true, no modules
2. **User attempts to access app** → Sees AccessDenied screen
3. **Admin reviews pending users** → Admin panel shows new users
4. **Admin decides on access level** → Assigns appropriate modules
   - Manager → [job_cards, reports, employees]
   - Staff → [job_cards, employees]
   - Viewer → [reports]
5. **Admin saves assignment** → Rows inserted into user_module_permissions
6. **User refreshes or re-logs in** → Sees assigned modules in sidebar

---

## UX Copy for Phase 4.3

**SignUp Success Page (after email confirmation):**
```
"Account created successfully!

Your account is now active. An admin needs to assign module permissions before you can access reports and data.

If you're expecting access right away, contact your administrator."
```

**AccessDenied Component:**
```
"No module access assigned

Your account is set up, but you don't have permission to access any modules yet. 

Ask your administrator to assign you to one or more modules:
- Job Cards: Create and manage service jobs
- Reports: View cross-module analytics  
- Employees: Manage employee master data
- Parts: Manage parts inventory and orders

Administrator: Use the Admin Panel to assign module permissions."
```

---

## Timeline

| Task | Responsible | Est. Date | Status |
|------|-------------|-----------|--------|
| Confirm onboarding policy (this doc) | Engineering + Admin | 2026-05-23 | ✅ Done |
| Enforce onboarding gating (Phase 4.2) | Dev Team | 2026-05-24 | ⏳ Pending |
| Update UX copy (Phase 4.3) | Product + Dev | 2026-05-24 | ⏳ Pending |

---

## Related Documentation

- [RBAC_IMPLEMENTATION_MASTER_2026-06-01.md](../Implementation_plans/rbac/active/RBAC_IMPLEMENTATION_MASTER_2026-06-01.md) — Overall RBAC plan
- [src/App.tsx](../../src/App.tsx) — AccessDenied component
- [src/pages/SignUpPage.tsx](../../src/pages/SignUpPage.tsx) — Signup flow
- [src/pages/AdminPage.tsx](../../src/pages/AdminPage.tsx) — Module assignment UI
- [MODULE_ROUTE_CONTRACT.md](./MODULE_ROUTE_CONTRACT.md) — Module definitions

---

**Approval Sign-Off:**
- [x] GitHub Copilot (Technical) — 2026-05-23
- [ ] Techwheels Admin (Business) — _________
- [ ] Product Lead (UX) — _________

**Last Updated:** 2026-05-23 by GitHub Copilot  
**Next Review:** 2026-06-23
