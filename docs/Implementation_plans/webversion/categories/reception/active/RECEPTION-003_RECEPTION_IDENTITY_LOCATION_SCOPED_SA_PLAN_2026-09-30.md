# RECEPTION-003 Reception Identity + Location-Scoped SA Dropdown Plan

**Plan ID:** RECEPTION-003  
**Status:** Not Started  
**Platform:** Web  
**Category:** reception  
**Owner:** Reception Team + RBAC Team + Platform Team  
**Created:** 2026-09-30  
**Last Updated:** 2026-09-30  
**Risk Level:** Medium  
**Estimated Effort:** 2-4 dev days + production-safe UAT

---

## 1) Executive Summary

### Problem

Settings -> Employee Master currently rejects `Reception` as a Business Role with:

> Unknown business role: "Reception".

The failure is deterministic: `src/lib/businessRoles.ts` validates Employee Master roles against a canonical role catalog, and `RECEPTION` is not currently in that catalog.

The Reception page also has an independent location defect for the requested workflow. `src/pages/ReceptionPage.tsx` currently hard-codes the SA dropdown to employees whose location is `Sitapura`. That does not support a receptionist whose own Employee Master location is Jagatpura, Ajmer Road, or another configured location.

### Final recommended model

Keep the three access dimensions separate:

1. **Platform/module access** -> existing `user_module_permissions` / `get_all_my_permissions()`.
2. **Business role** -> Employee Master `role = RECEPTION` for receptionist identity.
3. **Operational location** -> Employee Master `location`, resolved through the logged-in user's active `user_employee_links` mapping.

Do **not** make Reception role depend on department, fuel type, or SA-code/dealer-code text patterns.

Keep `dealer_code` as the existing tenancy/RLS security dimension. Do not use it as the source for the SA dropdown location filter.

### Target behavior

For a non-admin user:

- must have Reception module view access;
- must resolve to an active linked Employee Master row with Business Role `RECEPTION`;
- the linked employee's `location` becomes the Reception operational location;
- SA dropdown shows only active Service Advisor employees in the same location;
- existing service-type department and fuel-type filtering continues to apply after the location filter;
- no hard-coded Sitapura/Jagatpura/Ajmer Road branching is added.

For admin:

- existing admin route/module bypass remains;
- Reception SA dropdown is not restricted by the receptionist identity/location rule;
- admin can operate across locations, subject only to the existing form/business filters that intentionally apply to admins.

---

## 2) Evidence-Based Current State

### 2.1 Employee Master role validation

Current code:

- `src/lib/businessRoles.ts` is the web canonical parser/validator.
- `KNOWN_BUSINESS_ROLES` includes SA, CRM, SM, GM, TECHNICIAN, FLOOR_INCHARGE, CRE, DRIVER, EDP, SURVEY, bodyshop roles, etc.
- `RECEPTION` is absent.
- `validateAndCanonicalizeRoles()` therefore returns `Unknown business role: "Reception".`
- `src/pages/SettingsPage.tsx` calls this validator on add, edit, and import before writing `employee_master.role`.

Classification: **ACTION REQUIRED**.

### 2.2 Employee code derivation

`src/pages/SettingsPage.tsx` derives location/fuel only when an Employee Code contains one of the known dealer-code patterns.

For codes such as `Recep_001`, no rule matches, so manually entered location remains authoritative and fuel type can remain blank.

This is compatible with the requested Reception identity model and should be preserved.

Classification: **PASS** for dealer-code-agnostic receptionist codes.

### 2.3 Existing user-to-employee identity link

`src/lib/api/userEmployeeLinks.ts` already owns the login-to-employee relationship:

- `user_employee_links.user_id`
- `user_employee_links.employee_code`
- `user_employee_links.dealer_code`
- `is_primary`
- `is_active`

The mapping resolves the signed-in application user to one or more Employee Master rows. A new receptionist-specific identity table is not required.

Classification: **PASS / reuse existing architecture**.

### 2.4 Existing module access

`src/App.tsx` already:

- loads permissions through `get_all_my_permissions()`;
- gates `/reception` through the module route map;
- grants admin all active modules;
- uses `RequireAccess` for route access.

Admin -> Users/Permissions already writes `user_module_permissions`.

A second Reception authorization system must not be created.

Classification: **PASS / reuse existing architecture**.

### 2.5 Current Reception SA dropdown

`src/lib/api/reception.ts::listReceptionEmployees()`:

- loads active Employee Master rows;
- filters to Service Advisor Business Role using `isServiceAdvisorRole()`;
- returns department, fuel type, and location.

`src/pages/ReceptionPage.tsx` then filters the dropdown by:

1. required department;
2. **hard-coded `location === 'sitapura'`;**
3. fuel type where applicable.

The hard-coded location is the main page behavior that must be replaced.

Classification: **ACTION REQUIRED**.

### 2.6 Database authority boundary

Current database authority is `supabase/backups/full_metadata.sql`, documented in `docs/shared/reference/DATABASE_TRUTH.md`.

The current repo already contains the tables/functions used by this design in application code. This plan does not assume a schema change is necessary.

Before implementation, SQL role-helper parity must be checked in the authoritative metadata dump. If the SQL Business Role canonicalizer also maintains an allow-list and does not recognize `RECEPTION`, extend it through the normal DB change protocol so TypeScript/SQL role semantics do not drift.

---

## 3) Business Contract

### 3.1 Reception Business Role

Canonical stored token:

`RECEPTION`

Display label:

`Reception`

Rules:

- role is independent of department;
- role is independent of fuel type;
- role is independent of Employee Code pattern;
- role is independent of dealer-code text contained in Employee Code;
- location is required for a receptionist who will use location-scoped Reception behavior;
- role may continue to use the existing CSV Business Role contract if multi-role users are needed later.

### 3.2 Identity resolution

For a signed-in non-admin Reception user:

`auth user -> active user_employee_links -> employee_master -> RECEPTION role + location`

Resolution rules:

1. Use only active mappings.
2. Use only active Employee Master rows.
3. Candidate employee must have Business Role `RECEPTION`.
4. Candidate must have a non-empty location.
5. Prefer an active primary mapping when more than one valid receptionist mapping exists.
6. If multiple valid receptionist mappings remain ambiguous, fail closed with a clear admin-facing setup message; do not silently pick a location.
7. Do not infer location from email, employee name, SA Code text, or dealer code.

### 3.3 SA dropdown scoping

For non-admin Reception users:

`eligible SA = active SA role AND same normalized location AND existing department rule AND existing fuel rule`

Order of filters:

1. Service Advisor Business Role.
2. Current receptionist location.
3. Required department for service type.
4. Existing EV/PV filter where applicable.
5. Sort by employee name.

Location comparison should use one shared normalization helper (trim + case-insensitive canonical comparison). Do not add page-local string exceptions.

### 3.4 Admin bypass

Admin retains unrestricted Reception operational scope.

Admin must not require:

- a RECEPTION Employee Master role;
- a receptionist Employee Master mapping;
- a receptionist location.

Do not weaken existing database/RLS protections as part of this bypass. This is an application operational-scope bypass, not a tenancy-security bypass.

### 3.5 Failure states

Non-admin Reception page should show explicit setup errors:

- no active user/employee mapping;
- no linked employee with Business Role RECEPTION;
- receptionist mapping has no location;
- ambiguous receptionist mappings with different locations;
- no Reception module access remains handled by existing route protection.

Never fall back to Sitapura or to an arbitrary first location.

---

## 4) Recommended Implementation Architecture

### 4.1 Extend existing Business Role catalog

Update the existing shared role contract rather than creating a Reception-specific validator.

Web:

- `src/lib/businessRoles.ts`
  - add `RECEPTION` to canonical role catalog;
  - add alias `Reception -> RECEPTION`;
  - add `isReceptionBusinessRole()` only if a named domain helper improves reuse.

Mobile parity:

- inspect `mobile/src/lib/businessRoles.ts`;
- if it mirrors the web catalog, add `RECEPTION` in the same change to preserve cross-platform contract parity even if mobile Reception does not yet consume the role.

SQL parity:

- inspect authoritative `full_metadata.sql` for `normalize_business_role_token` / related helpers;
- if `RECEPTION` is absent, create one minimal migration + SQL check through DB governance;
- if SQL already accepts unknown canonical tokens safely, record that evidence and do not create a migration.

### 4.2 Add one reusable Reception identity scope resolver

Preferred location: existing Reception API/service layer, not the page component.

Candidate API contract:

`getMyReceptionScope()`

Return shape:

```ts
type ReceptionScope =
  | { isAdmin: true; location: null }
  | {
      isAdmin: false
      employeeCode: string
      employeeName: string
      location: string
    }
```

Responsibilities:

- read current session;
- resolve platform admin status using the existing users role convention;
- for non-admin, resolve active `user_employee_links`;
- join/lookup linked `employee_master` records;
- enforce `RECEPTION` Business Role;
- return one deterministic location or a typed setup error.

Do not add a second user-profile location source unless current repository authority proves one is already canonical.

### 4.3 Make Reception employee loading scope-aware

Preferred approach:

- resolve Reception scope first;
- for non-admin, query/filter advisor options by that location;
- for admin, return all active SA options;
- preserve department/fuel information for existing page filters.

Avoid fetching unrelated employee rows where possible.

### 4.4 Remove hard-coded Sitapura from page behavior

Replace:

`employee.location === 'sitapura'`

with the resolved scope.

The page should not know Jagatpura/Ajmer Road-specific rules. It should only consume:

- admin/unscoped, or
- one resolved normalized location.

### 4.5 Preserve dealer/RLS isolation

Do not repurpose `employee_master.location` as a replacement for `dealer_code`.

Dealer code continues to control the existing data tenancy/security path through:

- user/dealer context;
- Reception RPC/RLS behavior;
- existing module and database permissions.

Location controls the operational SA selection dimension only unless a separate audited requirement later expands row visibility by location.

---

## 5) Setup Contract for Reception Users

For each receptionist login:

1. Auth/application user exists and is active.
2. User receives Reception module permission in Admin -> Permissions.
3. Employee Master contains one active employee identity row:
   - Employee Code: may be dealer-code agnostic, e.g. a receptionist-specific code;
   - Employee Name: actual employee;
   - Location: explicit operational location;
   - Department: optional for Reception identity;
   - Fuel Type: optional for Reception identity;
   - Business Role: `RECEPTION`.
4. Admin -> Mappings links the auth user to that Employee Code through `user_employee_links`.
5. Mapping dealer code remains configured for the existing tenancy/RLS contract; it is not used to decide the SA dropdown location.

For the currently discussed users, the implementation/UAT should configure each person's Employee Master location from the actual business assignment before testing. Do not infer a location from email/name.

---

## 6) Implementation Phases

### Phase 0 - Pre-change audit and governance

| ID | Task | Status | Acceptance |
|---|---|---|---|
| R3-001 | Re-read current `businessRoles.ts`, Reception page/API, auth/module gate, mapping API | PENDING | Current implementation reconfirmed before edits |
| R3-002 | Inspect authoritative metadata for Employee Master, user mapping, role helper parity, relevant RLS/RPC | PENDING | No DB objects assumed |
| R3-003 | Confirm no active plan already implements Reception location identity scope | PENDING | No duplicate architecture |

### Phase 1 - Business Role support

| ID | Task | Status | Acceptance |
|---|---|---|---|
| R3-101 | Add canonical `RECEPTION` role + alias to web Business Role contract | PENDING | Settings add/edit/import accepts Reception and stores canonical token |
| R3-102 | Mirror role catalog to mobile if current architecture requires parity | PENDING | Web/mobile catalogs stay aligned |
| R3-103 | Verify SQL Business Role helper parity | PENDING | Evidence says migration required or not required |
| R3-104 | If required, add migration + SQL checks + DB ledger entry | PENDING | SQL helper recognizes RECEPTION; checks pass; no unrelated DB change |

### Phase 2 - Logged-in Reception identity scope

| ID | Task | Status | Acceptance |
|---|---|---|---|
| R3-201 | Add reusable current-user Reception scope resolver | PENDING | Admin bypass + deterministic non-admin location |
| R3-202 | Resolve only active mappings and active employees | PENDING | Inactive identity cannot grant scope |
| R3-203 | Require RECEPTION role and non-empty location for non-admin | PENDING | Invalid setup fails closed with useful message |
| R3-204 | Handle multiple mappings deterministically/ambiguously | PENDING | No arbitrary location selection |

### Phase 3 - Location-scoped SA dropdown

| ID | Task | Status | Acceptance |
|---|---|---|---|
| R3-301 | Remove hard-coded Sitapura filter | PENDING | No fixed branch/location in ReceptionPage |
| R3-302 | Apply receptionist location scope to active SA options | PENDING | Jagatpura user sees Jagatpura SAs only; Ajmer Road user sees Ajmer Road SAs only |
| R3-303 | Preserve department filter | PENDING | Existing service-type department behavior unchanged |
| R3-304 | Preserve EV/PV fuel filter | PENDING | Existing fuel behavior unchanged |
| R3-305 | Preserve admin unscoped behavior | PENDING | Admin can select across locations |

### Phase 4 - User setup and production-safe UAT

| ID | Task | Status | Acceptance |
|---|---|---|---|
| R3-401 | Create/update receptionist Employee Master identities | PENDING | Role/location stored correctly |
| R3-402 | Link each login to correct receptionist employee identity | PENDING | Active mapping exists |
| R3-403 | Grant Reception module permission where intended | PENDING | Route visible and accessible |
| R3-404 | UAT Jagatpura receptionist | PENDING | Only Jagatpura advisor options appear |
| R3-405 | UAT Ajmer Road receptionist | PENDING | Only Ajmer Road advisor options appear |
| R3-406 | UAT admin | PENDING | Location restriction bypassed |
| R3-407 | Negative UAT missing/ambiguous mapping/location | PENDING | Clear failure; no fallback location |

### Phase 5 - Validation and documentation promotion

| ID | Task | Status | Acceptance |
|---|---|---|---|
| R3-501 | Run repository code validation | PENDING | CI/build/type checks pass |
| R3-502 | Run docs validation | PENDING | Plan/index/tracker remain valid |
| R3-503 | Run DB checks only if a migration is required | PENDING | SQL checks pass |
| R3-504 | Practical verification in deployed environment | PENDING | Intended logged-in behavior demonstrated |
| R3-505 | Update truth docs/change log after implementation | PENDING | Completed behavior promoted per SYNC_PROTOCOL |
| R3-506 | Archive plan after verified sign-off | PENDING | Active tracker no longer carries completed work |

---

## 7) Test Matrix

| Scenario | Module Access | Platform Role | Business Role | Reception Location | Expected SA Dropdown |
|---|---|---|---|---|---|
| Admin | Any / bypass | admin | none required | none required | All otherwise-eligible SAs across locations |
| Jagatpura receptionist | Reception view | non-admin | RECEPTION | Jagatpura | Jagatpura only |
| Ajmer Road receptionist | Reception view | non-admin | RECEPTION | Ajmer Road | Ajmer Road only |
| Reception module but no RECEPTION identity | Reception view | non-admin | other/none | any | Setup error; no silent fallback |
| RECEPTION identity but no module access | none | non-admin | RECEPTION | valid | Existing Module access required screen |
| RECEPTION identity missing location | Reception view | non-admin | RECEPTION | blank | Setup error |
| Two RECEPTION mappings, same location | Reception view | non-admin | RECEPTION | same | Allowed if deterministic policy accepts it |
| Two RECEPTION mappings, different locations | Reception view | non-admin | RECEPTION | ambiguous | Fail closed / require admin correction |
| Jagatpura + EV service | Reception view | non-admin | RECEPTION | Jagatpura | Jagatpura + existing EV eligibility only |
| Ajmer Road + PV service | Reception view | non-admin | RECEPTION | Ajmer Road | Ajmer Road + existing PV eligibility only |

---

## 8) Risks and Controls

| Risk | Impact | Control |
|---|---|---|
| Adding RECEPTION only in TypeScript but not SQL role helper | Future RBAC drift | Mandatory SQL parity audit before implementation completion |
| Treating location as tenancy security | Cross-tenant security regression | Keep dealer/RLS contract unchanged |
| Hard-coding Jagatpura/Ajmer Road | Future branch drift | Resolve location from mapped Employee Master identity |
| Multiple user mappings produce nondeterministic scope | Wrong branch dropdown | Primary preference + ambiguity fail-closed rule |
| Admin accidentally scoped like staff | Operational regression | Explicit admin bypass test |
| Reception change breaks SA department/fuel rules | Wrong advisor choices | Preserve existing filters and test combinations |
| Frontend-only filtering exposes unnecessary employee data | Data minimization concern | Scope query in API layer where current RLS/API permits |
| Existing production user setup is incomplete | False code failure | Separate configuration UAT from code validation |

---

## 9) Success Criteria

Implementation is complete only when all are true:

- Settings accepts `Reception` and stores canonical `RECEPTION`.
- Reception Business Role is not coupled to department/fuel/dealer-code-derived Employee Code.
- A non-admin Reception user is resolved through the existing user-to-employee mapping.
- The user's Employee Master location drives the SA dropdown.
- Hard-coded Sitapura filtering is removed.
- Jagatpura and Ajmer Road behavior is data-driven, not branch-name-specific code.
- Existing SA role, department, and fuel rules still apply.
- Existing module permission system remains the route/access authority.
- Existing dealer/RLS security remains unchanged unless separately proven necessary.
- Admin remains operationally unscoped.
- Missing/ambiguous mappings fail clearly.
- Formal validation passes.
- Practical logged-in UAT demonstrates the intended behavior.

---

## 10) Files Expected to Change During Implementation

### Application

- `src/lib/businessRoles.ts`
- `src/lib/api/reception.ts`
- `src/pages/ReceptionPage.tsx`
- potentially `mobile/src/lib/businessRoles.ts` for catalog parity

### Database - only if parity audit proves required

- `supabase/migrations/<timestamp>_add_reception_business_role.sql`
- `supabase/sql_checks/<timestamp>_add_reception_business_role_checks.sql`
- `docs/shared/reference/DB_CHANGE_LEDGER.md`

### Documentation after implementation

- this plan
- `docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md`
- `docs/Implementation_plans/webversion/INDEX.md`
- relevant truth docs required by `DOCS_IMPACT_MATRIX.md`
- `docs/shared/active/CHANGE_LOG.md`

No new auth table, employee-location table, module-permission table, or Reception-specific parallel RBAC framework is recommended.

---

## 11) Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-09-30 | Canonical receptionist Business Role is `RECEPTION` | Fixes current validator defect using existing Business Role architecture |
| 2026-09-30 | Location comes from mapped Employee Master identity | SA Code patterns are not reliable for receptionist identity/location |
| 2026-09-30 | Dealer code remains tenancy/security scope, not SA dropdown location | Keeps security and operational dimensions separate |
| 2026-09-30 | Existing module permissions remain access authority | Avoids parallel authorization |
| 2026-09-30 | Admin bypasses receptionist identity/location scope | Matches current admin architecture |
| 2026-09-30 | No schema change assumed | Existing tables already represent user mapping, role, and location; SQL parity is verified before proposing DB work |

---

## 12) Related Authorities

- `.instructions.md`
- `docs/STRUCTURE_GUIDE.md`
- `docs/shared/reference/DATABASE_TRUTH.md`
- `docs/shared/reference/SYNC_PROTOCOL.md`
- `docs/shared/reference/CURRENT_STATE.md`
- `docs/shared/README.md`
- `docs/Implementation_plans/webversion/categories/reception/active/RECEPTION-001_RECEPTION_MODULE_PLAN.md`
- `docs/Implementation_plans/webversion/categories/rbac/active/RBAC-001_MASTER_PLAN_ACTIVE.md`
- `docs/Implementation_plans/webversion/categories/rbac/active/RBAC-003_EMPLOYEE_MASTER_MULTI_BUSINESS_ROLE_CSV_PLAN_2026-07-18.md`

---

## 13) Activity Summary

- PENDING: 22
- IN PROGRESS: 0
- BLOCKED: 0
- DONE: 0

**Next action:** implement Phase 0 audit first, then the smallest verified Phase 1/2 change. Do not start with database changes unless authoritative metadata proves they are required.
