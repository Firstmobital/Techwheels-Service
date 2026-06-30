# Module-Route Canonical Contract

**Document ID:** MODULE-ROUTE-001  
**Version:** 1.0  
**Last Updated:** 2026-05-23  
**Owner:** Techwheels Dev Team + GitHub Copilot  

---

## Overview

This document defines the authoritative mapping between database modules and frontend routes. It serves as the single source of truth for RBAC permission-to-route resolution and frontend navigation logic.

### Principles
1. **Deny by default**: Routes not in this contract are not accessible.
2. **Explicit mapping**: Each module-route pair is intentional and documented.
3. **Module name integrity**: Module names from the `public.modules` table are the authority.
4. **Frontend route management**: Routes are managed in `src/App.tsx` using `ROUTE_MODULE_MAP`.

---

## Module-Route Matrix

| Module ID | Module Name | DB Route | Frontend Route(s) | Page Component | Status | Notes |
|-----------|-------------|----------|-------------------|-----------------|--------|-------|
| 1 | `job_cards` | `/job-cards` | `/import`, `/autodoc` | ImportPage, JobCardPage | Active | Import/AutoDoc both access job card data |
| 2 | `invoices` | `/invoices` | *(No frontend page)* | N/A | Defined | DB-only table; accessed via reports aggregation |
| 3 | `parts_inventory` | `/parts/inventory` | *(No frontend page)* | N/A | Defined | DB-only table; accessed via reports aggregation |
| 4 | `parts_orders` | `/parts/orders` | *(No frontend page)* | N/A | Defined | DB-only table; accessed via reports aggregation |
| 5 | `parts_consumption` | `/parts/consumption` | *(No frontend page)* | N/A | Defined | DB-only table; accessed via reports aggregation |
| 6 | `employees` | `/employees` | `/settings` | SettingsPage | Active | Employee master data management |
| 7 | `reports` | `/reports` | `/reports` | ReportsPage + sub-routes | Active | Analytics and cross-module dashboards |
| 8 | `admin` | `/admin` | `/admin` | AdminPage | Active | User and permission management |
| 10 | `reception` | `/reception` | `/reception` | ReceptionPage | Active | Front desk vehicle intake and SA assignment |

**Legend:**
- **Module Name**: Authoritative name from `public.modules.name`
- **DB Route**: Route defined in `public.modules.route`
- **Frontend Route(s)**: Actual routes served in React app
- **Page Component**: React component(s) rendering that route
- **Status**: Whether the module is currently in use and accessible

---

## Frontend Route-to-Module Resolution

### Primary Routes (with module guards)

```typescript
// From src/App.tsx :: ROUTE_MODULE_MAP
const ROUTE_MODULE_MAP: Record<AppRoute, ModuleName[]> = {
  '/import':   ['job_cards'],              // Import/Job Card creation
  '/reception':['reception'],              // Front desk intake records
  '/reports':  ['reports'],                // Reports & Analytics
  '/settings': ['employees'],              // Employee master data
  '/admin':    ['admin'],                  // Admin panel
  '/autodoc':  ['job_cards'],              // AutoDoc (vehicle documentation)
}
```

### Secondary Routes (no guard)

- `/` (root) → Always accessible
- `/reset-password` → Always accessible (auth flow)
- `/auth/callback` → Always accessible (auth flow)
- `*` (catch-all) → Denied by default if not in ROUTE_MODULE_MAP

---

## Permission Resolution Flow

When a user navigates to a route:

1. **Load permissions**: Call `supabase.rpc('get_all_my_permissions')` → returns `module_name` for each allowed module
2. **Check route access**: Verify `location.pathname` against `ROUTE_MODULE_MAP`
3. **Intersect modules**: If user has any module in `ROUTE_MODULE_MAP[route]`, allow access
4. **Default admin access**: If user role is `admin`, grant access to all active modules
5. **Render or deny**: If allowed, render page; else show `AccessDenied` component

---

## Adding a New Module

### Step 1: Database

1. Add row to `public.modules` with unique `name` and `route`
2. Create corresponding row in `public.user_module_permissions` for each user who needs access
3. Run migration and backup via `supabase db pull`

### Step 2: Frontend

1. Add **TypeScript type** to `ModuleName` union in `src/App.tsx`
2. Add **entry** to `ROUTE_MODULE_MAP` for each frontend route that should allow this module
3. Create or reuse **page component** for the new route
4. Add **nav item** to `NAV_ITEMS` if it should appear in sidebar/mobile nav (optional)
5. Build and test RBAC guards: `npm run build`

### Step 3: Documentation

1. Update this document's **Module-Route Matrix** table
2. Update [CURRENT_STATE.md](./CURRENT_STATE.md) if onboarding or role defaults changed
3. Notify QA for testing the new module access matrix

---

## Module-Route Audit Checklist

Run this checklist monthly to prevent drift:

- [ ] DB modules in `public.modules` match TypeScript `ModuleName` type
- [ ] All entries in `ROUTE_MODULE_MAP` have corresponding page components
- [ ] No routes in `src/App.tsx` bypass `canAccessPath()` check
- [ ] NAV_ITEMS filtering uses consistent `ROUTE_MODULE_MAP` logic
- [ ] Admin role gets access to all active modules (verified in test)
- [ ] New signup users see AccessDenied until permission assigned
- [ ] TypeScript build passes: `npm run build`

---

## Related Files

- [src/App.tsx](../../../src/App.tsx) — Route guards and ROUTE_MODULE_MAP
- [src/pages/AdminPage.tsx](../../../src/pages/AdminPage.tsx) — User permission assignment
- [public.modules](../../../local_folder/backups/full_database.sql) — Authoritative module list
- [CURRENT_STATE.md](./CURRENT_STATE.md) — Role and permission defaults

---

**Last Updated by:** GitHub Copilot  
**Next Review Date:** 2026-06-22
