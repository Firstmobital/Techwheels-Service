# RBAC Home Dynamic Role Visibility Plan

Version: 2026-06-05
Status: In Progress
Owner: Web + RBAC Team
Scope: Web home screen after login (/home)
Last Updated: 2026-06-05

## Sync Contract (No Drift)

This file is the single execution tracker for Home RBAC dynamic visibility work.

Rules:

- Every change to Home RBAC behavior must update this file in the same session.
- No parallel tracker files for this scope.
- Status values must be one of: DONE, IN PROGRESS, PENDING, BLOCKED.
- If scope changes, add a new row in Change Log before implementation.

Session resume protocol:

1. Open this file first.
2. Read Activity Tracker and pick the first IN PROGRESS item; if none, pick the first PENDING item.
3. Execute only that scope unless user reprioritizes.
4. Update row status + evidence before ending session.

## Execution Update (2026-06-05)

Completed in web:

- Added Home Status section with Service Advisor subsection on /home.
- Added location filter chips in Status section.
- Added fuel type filter chips in Status section.
- Added Service Advisor summary counters in Status section:
  - Filtered entries
  - SR Type
  - Job Card
  - Estimate
  - Invoice
  - Completed cards
- Added default gap between Status and the next section to match existing page spacing rhythm.
- Added Unknown fallback fuel grouping for Home Status when fuel_type cannot be resolved.
- Added Unknown fallback fuel grouping on Service Advisor screen for parity.

Data-contract alignment:

- Reception entry enrichment now resolves both branch and fuel_type from employee_master where available.
- No schema migration was required.

Current implementation notes:

- Home Status is currently rendered when service_advisor module is visible.
- This is a concrete Phase A/B delivery slice from this plan; broader widget registry and full module-driven home composition are still pending.

## Activity Tracker

Legend:

- DONE: Completed and verified.
- IN PROGRESS: Actively being implemented.
- PENDING: Approved but not started.
- BLOCKED: Cannot proceed until dependency is resolved.

### Tracker Table

| ID | Workstream | Task | Status | Owner | Updated On | Evidence |
|---|---|---|---|---|---|---|
| HDS-001 | Home Status UI | Add Status section with Service Advisor subsection on /home | DONE | Web + Copilot | 2026-06-05 | src/pages/DashboardPage.tsx |
| HDS-002 | Home Status UI | Add location filter chips for status counters | DONE | Web + Copilot | 2026-06-05 | src/pages/DashboardPage.tsx |
| HDS-003 | Home Status UI | Add fuel type filter chips for status counters | DONE | Web + Copilot | 2026-06-05 | src/pages/DashboardPage.tsx |
| HDS-004 | Home Status UI | Add summary counters (Filtered entries, SR Type, Job Card, Estimate, Invoice, Completed cards) | DONE | Web + Copilot | 2026-06-05 | src/pages/DashboardPage.tsx |
| HDS-005 | UX Consistency | Restore default section gap after Status block | DONE | Web + Copilot | 2026-06-05 | src/pages/DashboardPage.tsx |
| HDS-006 | Data Enrichment | Enrich reception rows with branch + fuel_type via employee_master mapping | DONE | Web + Copilot | 2026-06-05 | src/lib/api/reception.ts |
| HDS-007 | Fuel Fallback | Add Unknown fuel grouping on Home Status | DONE | Web + Copilot | 2026-06-05 | src/pages/DashboardPage.tsx |
| HDS-008 | Fuel Fallback | Add Unknown fuel grouping on Service Advisor screen for parity | DONE | Web + Copilot | 2026-06-05 | src/pages/ServiceAdvisorPage.tsx |
| HDS-013 | Home Status UI | Add Floor Incharge subsection under Home Status | DONE | Web + Copilot | 2026-06-05 | src/pages/DashboardPage.tsx |
| HDS-014 | Home Status UI | Add Floor Incharge cards (Job cards, Unassigned, Assigned, Hold, In-Process, Completed) | DONE | Web + Copilot | 2026-06-05 | src/pages/DashboardPage.tsx |
| HDS-015 | Home Status UI | Add Floor Incharge location filter and branch-scoped counts | DONE | Web + Copilot | 2026-06-05 | src/pages/DashboardPage.tsx |
| HDS-009 | Phase A Platforming | Refactor home widgets into a registry (module -> widget map) | PENDING | Web | 2026-06-05 | Planned in Phase A |
| HDS-010 | Phase B Data | Replace broad dashboard Promise.all with module-conditional loaders | PENDING | Web | 2026-06-05 | Planned in Phase B |
| HDS-011 | Phase C UX | Personalize action rail and section subtitles by accessible modules | PENDING | Web | 2026-06-05 | Planned in Phase C |
| HDS-012 | QA | Execute role matrix for Home widget visibility and filter integrity | PENDING | QA + Web | 2026-06-05 | Pending test pass evidence |

### Done vs Pending Snapshot

- Done: 11
- In Progress: 0
- Pending: 4
- Blocked: 0

## Change Log

| Date | Change | Reason | Updated By |
|---|---|---|---|
| 2026-06-05 | Added Floor Incharge subsection/cards in Home Status (HDS-013 to HDS-015) | Keep Home status aligned with Floor Incharge operational dashboard | Copilot |
| 2026-06-05 | Created live tracker rows HDS-001 to HDS-012 | Prevent execution drift and keep done/pending transparent | Copilot |

## 1) Objective

Make the home screen dynamically adapt to each logged-in user based on real module access and row visibility.

- Admin users should continue to see full platform-level overview.
- Non-admin users should see a role-appropriate home experience that only surfaces modules and data they can access.
- Home widgets, CTAs, counts, and activity should be visibility-aware and not imply global access where none exists.

## 2) Authoritative Inputs Used

This plan is based on:

- docs/Implementation_plans/rbac/active/RBAC_IMPLEMENTATION_MASTER_2026-06-01.md
- local_folder/backups/full_database.sql (authoritative)
- local_folder/backups/chunks/full_database.sql.part_* (authoritative access mirror)
- src/App.tsx
- src/pages/DashboardPage.tsx

No schema assumptions outside the authoritative dump are used.

## 3) Current-State Audit (Web)

### 3.1 Already Working

- Route-level and nav-level module gating is active in src/App.tsx.
- Allowed modules are loaded from get_all_my_permissions().
- Admin gets full module coverage via users.role = 'admin' logic.
- Dashboard launcher section already shows only visible modules.

### 3.2 Gaps On /home

- DashboardPage currently runs mostly fixed/global queries regardless of role.
- KPI labels can be misleading for non-admin users:
  - Platform Users count is not a true global count for non-admin due RLS on users.
  - Employees can be global because employee_master select policy is currently open to authenticated users.
- New intake CTA is always shown, even when a role does not have reception workflow access.
- Activity and table sections are reception-centric even for users whose primary module is not reception.
- Widget composition is static, not module-driven.

### 3.3 Verified DB/RLS Contract To Honor

From authoritative dump mirror:

- get_all_my_permissions() returns active modules where can_view = true.
- has_module_view/modify/delete() and is_admin() are active helper functions.
- users table RLS includes users_self_read and users_admin_all.
- modules table RLS allows active module read (modules_read_all) and admin write.
- service_reception_entries policies are role/action aware:
  - reception module checks + dealer scope
  - service_advisor checks via user_has_employee_code(sa_employee_code)
  - floor_incharge checks via user_has_floor_incharge_scope_for_sa_code(sa_employee_code)

## 4) Target UX Behavior

### 4.1 Home Composition Rules

- All users:
  - See greeting and module launcher for allowed modules only.
  - See only widgets whose required module is present in allowedModules.
- Admin:
  - See full KPI set and full operational widgets.
- Non-admin:
  - See scope-safe KPIs and widgets only for permitted modules.
  - No platform-wide labels unless data is truly global for that role.

### 4.2 Widget Matrix (Phase 1)

- reception module:
  - Recent reception entries widget
  - New intake CTA (only when role has modify path through reception flow)
- service_advisor module:
  - My assigned reception rows summary
- floor_incharge module:
  - Floor queue summary card (from visible reception scope)
- technician module:
  - My technician assignment summary
- reports module:
  - Report quick links widget
- employees/admin modules:
  - Admin or management utility cards only when module visible

If none of the above module widgets apply, show launcher-first dashboard with contextual empty state.

## 5) Implementation Plan

### Phase A: Home Capability Registry (Frontend)

1. Introduce a module-to-widget registry in web code (no DB change).
2. Define each widget with:
   - requiredModules
   - loader key
   - render priority
   - optional CTA route
3. Use allowedModules from App to compute active widgets.

Deliverables:

- src/pages/DashboardPage.tsx refactor to declarative widget composition.
- Optional helper file under src/pages/home/* for widget config and types.

Progress:

- Partially complete: Status section for Service Advisor delivered directly in DashboardPage.
- Pending: generalized registry abstraction for all module widgets.

### Phase B: Scope-Safe Data Loading

1. Replace unconditional Promise.all fetches in DashboardPage with conditional loaders based on active widgets.
2. Keep all reads through existing tables/functions; do not add schema objects in this phase.
3. Gate each loader by required module to avoid irrelevant queries.
4. For non-admin users, avoid presenting counts as platform totals unless contract guarantees global visibility.

Deliverables:

- Role-aware KPI model (label + definition changes for non-admin).
- Query execution map driven by module visibility.

Progress:

- Partially complete: role-aware status data loading and filter counts wired for Service Advisor.
- Pending: full conditional loader map across all module widgets.

### Phase C: CTA and Section Personalization

1. Show New intake CTA only when reception flow is available.
2. Rename section subtitles by scope:
   - Admin: Across all modules
   - Non-admin: Across your accessible modules
3. Hide reception-specific table/feed when reception module is absent; replace with module-relevant cards.

Deliverables:

- Personalized action rail and section headers.
- Clean fallback states for narrow-access users.

Progress:

- Not started for non-Service-Advisor widgets.

### Phase D: Validation and Hardening

1. Test role matrix for home composition:
   - admin, manager, staff, viewer, no-module user
   - reception-only, reports-only, technician-only, mixed roles
2. Validate deep-link and refresh behavior remains unchanged.
3. Verify no unauthorized module widget appears on /home.

Deliverables:

- QA checklist update in RBAC testing docs.
- Screenshot evidence set for each role profile.

## 6) File-Level Change Plan

Primary:

- src/pages/DashboardPage.tsx
- src/App.tsx

Potential supporting additions:

- src/pages/home/widgetRegistry.ts
- src/pages/home/homeDataLoaders.ts
- src/pages/home/types.ts

No database migration is required for Phase A-D.

## 7) Acceptance Criteria

1. A user sees only module widgets tied to modules returned by get_all_my_permissions() (plus admin override behavior).
2. Users without reception access do not see reception-specific CTA/table/feed on home.
3. Non-admin users are not shown misleading platform-wide labels for counts constrained by RLS.
4. Admin home remains complete and operationally equivalent to current behavior.
5. Home renders correctly for desktop and mobile nav contexts.

## 8) Risk Register

- Risk: Existing KPI expectations rely on global semantics.
  - Mitigation: Keep admin view unchanged; only relabel/re-scope non-admin KPIs.
- Risk: Conditional loaders may cause fragmented loading states.
  - Mitigation: Per-widget loading placeholders and isolated error boundaries.
- Risk: Hidden reception widgets may reduce visibility for some hybrid roles.
  - Mitigation: Keep module launcher always visible and prioritize actionable cards.

## 9) Rollout Strategy

1. Implement behind a frontend feature flag (home_dynamic_role_layout).
2. Deploy to staging and execute role matrix checks.
3. Enable for internal admin/test users first.
4. Gradually enable for all users after validation.

Rollback:

- Disable feature flag to return to current static dashboard composition.

## 10) Audit Notes for Next Iteration

- If product wants richer per-module KPIs, define them from existing tables and current RLS boundaries first.
- Keep module-route contract centralized in frontend mapping while permission truth remains DB-driven.
- Continue treating local_folder/backups/full_database.sql as authority and chunk mirror as read fallback.
