# RECEPTION-003 Reception Identity + Location-Scoped SA Dropdown Plan

**Plan ID:** RECEPTION-003  
**Status:** UAT Remediation In Progress - DBL-0091 applied; practical edit UAT pending  
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
| R3-001 | Re-read current `businessRoles.ts`, Reception page/API, auth/module gate, mapping API | DONE | Current implementation reconfirmed before edits |
| R3-002 | Inspect authoritative metadata for Employee Master, user mapping, role helper parity, relevant RLS/RPC | DONE | Fresh manifest + `full_metadata.sql` inspected; no DB objects assumed |
| R3-003 | Confirm no active plan already implements Reception location identity scope | DONE | RECEPTION-003 confirmed as the existing owner; no duplicate plan created |

### Phase 1 - Business Role support

| ID | Task | Status | Acceptance |
|---|---|---|---|
| R3-101 | Add canonical `RECEPTION` role + alias to web Business Role contract | DONE | Web Settings add/edit/import now accepts Reception and stores canonical `RECEPTION` |
| R3-102 | Mirror role catalog to mobile if current architecture requires parity | DEFERRED | Current request/runtime is web Reception; mobile has no Reception-identity consumer requiring this token in this change. MCP authorization also excludes `mobile/**`; revisit when mobile adopts this identity contract. |
| R3-103 | Verify SQL Business Role helper parity | DONE | Authoritative SQL normalizer accepts open-ended uppercase tokens through its `ELSE` branch; `RECEPTION` requires no SQL change |
| R3-104 | If required, add migration + SQL checks + DB ledger entry | N/A | No schema/function/RLS change required, so no migration/ledger work manufactured |

### Phase 2 - Logged-in Reception identity scope

| ID | Task | Status | Acceptance |
|---|---|---|---|
| R3-201 | Add reusable current-user Reception scope resolver | DONE | `getMyReceptionScope()` provides admin bypass + deterministic non-admin location |
| R3-202 | Resolve only active mappings and active employees | DONE | Existing SECURITY DEFINER mapping scope is reused, then linked Employee Master rows are rechecked with `is_active=true` |
| R3-203 | Require RECEPTION role and non-empty location for non-admin | DONE | Missing mapping/role/location fails closed with explicit setup guidance |
| R3-204 | Handle multiple mappings deterministically/ambiguously | DONE | Same-location mappings are deterministic; different normalized locations fail closed instead of picking one |

### Phase 3 - Location-scoped SA dropdown

| ID | Task | Status | Acceptance |
|---|---|---|---|
| R3-301 | Remove hard-coded Sitapura filter | DONE | No fixed reception location remains in the SA-option filter |
| R3-302 | Apply receptionist location scope to active SA options | DONE | Non-admin candidates are filtered by normalized mapped Employee Master location before advisor eligibility |
| R3-303 | Preserve department filter | DONE | Existing service-type department behavior remains after location scoping |
| R3-304 | Preserve EV/PV fuel filter | DONE | Existing fuel behavior remains after location scoping |
| R3-305 | Preserve admin unscoped behavior | DONE | Admin bypass returns all otherwise-eligible SA locations |

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
| R3-501 | Run repository code validation | DONE | Trusted MCP CI: web lint/build, mobile TypeScript/native compatibility, and Supabase validation all pass |
| R3-502 | Run docs validation | DONE | `docs:validate` passes in trusted MCP CI |
| R3-503 | Run DB checks only if a migration is required | N/A | DB audit proved no migration is required |
| R3-504 | Practical verification in deployed environment | PENDING | Requires merged/deployed build plus configured receptionist identities |
| R3-505 | Update truth docs/change log after implementation | DONE | `CURRENT_STATE.md`, shared README, and change log updated in this transaction |
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
| Multiple user mappings produce nondeterministic scope | Wrong branch dropdown | Normalize all linked RECEPTION locations; allow one unique location and fail closed when locations differ |
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
| 2026-09-30 | No schema change required | Fresh authoritative metadata proves SQL Business Role normalization accepts `RECEPTION` as an open-ended canonical token; existing mapping/table/RLS objects are sufficient |
| 2026-09-30 | Reuse `get_my_bodyshop_employee_scope()` for Reception identity resolution | Existing SECURITY DEFINER mapping path already returns current-user Employee Master scope in dealer context; avoids a parallel auth/mapping mechanism |
| 2026-09-30 | Multiple mapped receptionist rows are location-deterministic, not primary-driven | Existing shared scope RPC does not expose `is_primary`; one normalized location is accepted, multiple locations fail closed |

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

## 12.1) 2026-09-30 Production UAT Finding — Existing Reception History

Production UAT after PR #25 confirmed the receptionist identity itself resolves correctly (for example, Sitapura scope is displayed), but dedicated Reception users can see 0 historical entries while admin sees the full Reception population.

**Root cause (repository + authoritative DB audit):**
- `list_reception_entries_page()` treats any non-admin user with an active employee mapping as an assigned-SA user before its generic Reception dealer branch.
- A receptionist mapped to `Recep_001` / `Recep_002` therefore gets rows where `service_reception_entries.sa_employee_code = receptionist employee code`; historical rows are assigned to Service Advisors instead, so the result is empty.
- Historical Reception rows already contain stable SA identity in `sa_employee_code`. Existing DB logic and Employee Master data can resolve SA operational location. Legacy fallback is unambiguous for the known codes: `3001440` = Ajmer Road, `3000840` / `500A840` = Sitapura.
- This is a DB read-scope/history-classification defect, not a missing receptionist mapping and not a need to rewrite dealer tenancy.

**Remediation owned by DBL-0088:**
- add SA→Reception location helper (Employee Master location first, legacy code fallback second);
- add fail-closed authenticated Reception location-scope helper;
- update the existing paginated Reception list and recent-registration RPC branches so dedicated Reception identities use location scope before own-SA mapping logic;
- backfill only missing `branch` / `location` / `branch_label` display fields for resolvable historical rows;
- do **not** rewrite `dealer_code`;
- preserve admin, Service Advisor, Floor Incharge, and Bodyshop branches;
- require governed migration apply + paired read-only verification before production sign-off.

## 12.2) 2026-09-30 Production UAT Finding — DBL-0088 Statement Timeout

The operator applied DBL-0088 and supplied its read-only check output. The database objects and historical backfill are present and internally consistent:

- required SECURITY DEFINER functions exist;
- known SA-code fallback resolves correctly;
- both Reception list RPC definitions contain the location scope;
- 7,023 historical rows are resolvable to Sitapura/Ajmer Road;
- 0 resolvable rows remain without persisted display location;
- 0 stored/resolved location mismatches were reported.

Runtime UAT then produced PostgreSQL SQLSTATE `57014` (`canceling statement due to statement timeout`) on `list_reception_entries_page`.

Postgres context identifies the expensive path as:

`list_reception_entries_page -> user_has_reception_location_scope_for_sa_code -> employee_has_business_role -> normalize_business_role_token`

The DBL-0088 implementation invokes that authenticated scope helper for each candidate Reception row. That repeats user/employee mapping and Business Role parsing thousands of times and is the direct cause of the timeout.

**DBL-0089 remediation:**
- resolve the signed-in receptionist's unique active RECEPTION Employee Master location once per RPC invocation;
- use the already-persisted `service_reception_entries.location` / `branch` values populated/backfilled by DBL-0088 for row filtering;
- remove per-row calls to `user_has_reception_location_scope_for_sa_code(r.sa_employee_code)` from the two list RPCs;
- preserve the existing admin, Service Advisor, Floor Incharge, Bodyshop, and dealer-fallback branches;
- perform no additional historical data rewrite.

## 12.3) 2026-10-01 Production UAT Finding — Reception Edit Scope

Production UAT confirmed the location-scoped Reception list is now loading correctly after DBL-0089, but a dedicated receptionist with Reception VIEW + MODIFY can still receive HTTP 403 when saving an edit to a visible same-location historical entry.

**Root cause (current authoritative metadata + application call path):**
- web edit calls the existing SECURITY DEFINER `update_reception_entry()` RPC;
- the RPC currently authorizes non-admin Reception edits only with `dealer_code_in_scope(existing_row.dealer_code)`;
- DBL-0089 visibility intentionally uses the receptionist's Employee Master location instead of historical row dealer code;
- Sitapura legitimately spans `3000840` and `500A840`, so a Sitapura receptionist can see a same-location historical row that is outside the login's single dealer-code scope and then be denied on save;
- the module permission is therefore present and correct; the inconsistency is between Reception read scope and Reception update scope.

**DBL-0091 remediation contract:**
- admin remains unrestricted;
- a dedicated non-admin RECEPTION identity still requires Reception MODIFY;
- resolve exactly one active RECEPTION Employee Master location using the same identity criteria as DBL-0089;
- allow edit only when the existing entry resolves to that same location;
- also require the newly selected Service Advisor to resolve to that same location, preventing cross-location reassignment during edit;
- non-dedicated Reception-capable users preserve the prior dealer-code authorization path;
- no table, RLS policy, grant, or historical data rewrite.

### DBL-0091 production apply evidence — 2026-10-01

The operator merged PR #28, applied the DBL-0091 migration, and supplied the paired structural check output. The live function evidence confirms:

- `update_reception_entry` remains SECURITY DEFINER;
- dedicated Reception edit scope is present;
- existing-entry location authorization is present;
- selected-SA location authorization is present;
- dealer-scoped fallback is preserved;
- helper functions required by the contract exist with expected security posture;
- Reception MODIFY remains mandatory.

This proves the production function contract was applied. It does not yet prove practical end-user edit behavior; DBL-0091 remains APPLIED until same-location/cross-location UAT is completed.

## 13) Activity Summary

- DONE: 17
- PENDING: 9 (production user setup/UAT, practical verification, archive)
- DEFERRED: 1 (mobile catalog parity; not required by current web runtime)
- N/A: 2 (DB migration/check path not required)
- BLOCKED: 0

**Validation evidence:** trusted MCP CI run `36690358015` passed Root/web lint + build + docs validation, Mobile/Expo validation, and Supabase validation. The first validation attempt exposed one pre-existing `no-explicit-any` error in `CustomerPortalPage.tsx` already present on the base commit; it was repaired with a type-safe object projection without runtime behavior change before the passing run.

**Next action:** run practical edit UAT: Sitapura same-location edit across 3000840/500A840, Ajmer Road same-location edit for 3001440, and negative cross-location SA reassignment. If all pass, refresh authoritative metadata, mark DBL-0091 VERIFIED, and complete/archive RECEPTION-003.