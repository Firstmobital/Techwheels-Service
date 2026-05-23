# Phase 2.2: Route Strategy Decision

**Decision ID:** ROUTE-STRATEGY-001  
**Date:** 2026-05-23  
**Owner:** Techwheels Engineering Team  
**Status:** APPROVED  

---

## Question

Should frontend application routes migrate to DB routes (e.g., `/job-cards` instead of `/import`), or should we maintain an explicit mapping layer in the frontend?

---

## Decision: Keep Explicit Mapping Layer

**Recommendation:** Continue using the explicit `ROUTE_MODULE_MAP` in [src/App.tsx](../../src/App.tsx) rather than migrate frontend paths to match DB module routes.

### Reasoning

#### 1. **Semantic Separation** ✅
- **DB routes** (`/job-cards`, `/invoices`, `/parts/inventory`) describe data entities
- **Frontend routes** (`/import`, `/reports`, `/settings`) describe user workflows
- Users think in terms of workflows, not data tables. Keeping these separate is clearer for UX.

#### 2. **Multi-Module Workflows** ✅
- `/import` consolidates job card creation/editing
- `/autodoc` builds documentation from job cards but is a separate workflow
- `/reports` aggregates data from multiple modules (job cards, invoices, parts, employees)
- A single DB route cannot map to multiple frontend workflows effectively

#### 3. **DB-Only Modules** ✅
- `invoices`, `parts_inventory`, `parts_orders`, `parts_consumption` are data sources for reports
- They do not need direct frontend routes; they are accessed via aggregation
- Attempting to migrate frontend routes to DB routes would create unused routes

#### 4. **RBAC Flexibility** ✅
- Mapping layer allows fine-grained control: one module can enable multiple routes
- Example: `job_cards` module enables both `/import` and `/autodoc`
- Adds expressiveness for future permission models

#### 5. **Reduced Refactoring Risk** ⏳
- DB routes are authoritative; changing them requires migration
- Frontend routes are implementation details; keeping them separate reduces coupling
- Future changes to DB structure won't require React rewrites

---

## Decision: Explicit Mapping Layer is Canonical

The `ROUTE_MODULE_MAP` in `src/App.tsx` is the frontend's canonical source for route-to-module resolution.

### Rules

1. **Every route** in `src/App.tsx` routing tree must have an entry in `ROUTE_MODULE_MAP`
   - Exception: `/`, `/reset-password`, `/auth/callback` (always accessible)

2. **Every entry** in `ROUTE_MODULE_MAP` must exist as a corresponding page component
   - Example: `/admin` → `AdminPage.tsx`, `/reports` → `ReportsPage.tsx`

3. **Module names** must exactly match `public.modules.name` (case-sensitive)
   - Authority: `local_folder/backups/full_database.sql`

4. **New modules** must follow the addition checklist in [MODULE_ROUTE_CONTRACT.md](./MODULE_ROUTE_CONTRACT.md)

---

## Validation Strategy

### Build-Time Validation (Recommended Future Enhancement)

```typescript
// TypeScript will catch:
// ✗ Missing module names in TypeScript ModuleName union
// ✗ Routes with no corresponding entry in ROUTE_MODULE_MAP
// ✗ Hardcoded path strings that bypass canAccessPath()
```

### Runtime Validation (Current)

- `canAccessPath()` enforces deny-by-default
- `hasAnyModuleAccess()` validates module membership
- `getDefaultRoute()` ensures only accessible routes are default targets

### Testing Validation (Recommended)

- [Phase 5.1] Role matrix tests verify each role sees only assigned modules
- [Phase 5.2] Direct URL tests verify unauthorized routes return AccessDenied

---

## Timeline & Implementation

| Phase | Task | Owner | Est. Date |
|-------|------|-------|-----------|
| **2** | ✅ Document mapping layer decision | GitHub Copilot | 2026-05-23 |
| **2.3** | Update handbook with this decision | Dev Team | 2026-05-23 |
| **5.1** | Build role matrix regression tests | QA | 2026-05-24 |
| **5.2** | Execute URL bypass tests | QA | 2026-05-24 |

---

## Rollback

If this decision needs reversal (i.e., migrate to DB routes):

1. Rename all frontend routes to match DB routes
2. Update `ROUTE_MODULE_MAP` to use DB routes
3. Add nav item rework for `/reports` multi-module aggregation
4. Execute full regression testing (high effort)

**Estimated effort:** 1-2 days of development + QA

---

## Related Documentation

- [MODULE_ROUTE_CONTRACT.md](./MODULE_ROUTE_CONTRACT.md) — Authoritative mapping
- [src/App.tsx](../../src/App.tsx) — Implementation
- [RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md](../Implementation_plans/RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md) — Overall RBAC hardening plan

---

**Approval Sign-Off:**
- [x] GitHub Copilot (Technical Decision) — 2026-05-23
- [ ] Techwheels Admin (Business) — _________
- [ ] QA Lead (Test Plan) — _________

**Last Updated:** 2026-05-23 by GitHub Copilot  
**Next Review:** 2026-06-23
