# Techwheels Web Redesign - Final Implementation Plan (Master Tracker)

Status: ACTIVE
Plan owner: Execution team
Audit basis date: 2026-06-02
Primary source folder: local_folder/Reference/WebVersionRedesignReference
Reference root (from this file): ../../local_folder/Reference/WebVersionRedesignReference
Reference root (workspace-relative): local_folder/Reference/WebVersionRedesignReference
Re-audit pass: 2026-06-02 (deep inventory + artifact delta capture)
Re-audit pass 2: 2026-06-02 (mirror TS constraints + instruction file reconciliation)

Path convention in this plan:
1. Any bare reference filename (for example IMPLEMENTATION_PLAN.md, styles.css, shell.jsx) resolves under ../../local_folder/Reference/WebVersionRedesignReference.
2. Workspace files (for example src/App.tsx) are rooted at project root.

---

## 1. Purpose

This is the fresh, consolidated, execution plan for implementing the full web redesign into the real project codebase.

This plan is built only from explicit content audited inside the reference folder. It does not add guessed requirements.

This document is also the live activity tracker. Every completed, in-progress, blocked, or pending step must be updated here to prevent drift.

---

## 2. Authority And Drift Guard

### 2.1 Authority order

1. Webredesign_IMPLEMENTATION_PLAN_MASTER_TRACKER.md (this file, execution tracker)
2. ../../local_folder/Reference/WebVersionRedesignReference/IMPLEMENTATION_PLAN.md (reference folder original design plan)
3. Prototype source files under ../../local_folder/Reference/WebVersionRedesignReference (styles.css, components.css, app-data.js, screen JSX, screen data JS)
4. Screenshot evidence under ../../local_folder/Reference/WebVersionRedesignReference/screens/
5. Mirror src/pages TypeScript files under ../../local_folder/Reference/WebVersionRedesignReference/src/pages/ for implementation behavior confirmation
6. ../../local_folder/Reference/WebVersionRedesignReference/copilot-instructions.md (currently present; reinstated in authority set)

### 2.2 Non-negotiable constraints (audited)

1. Redesign is presentational only; business logic must remain intact.
2. Do not change Supabase query contracts, RPC usage, RBAC gating logic, validation, exports, edge function behavior.
3. Do not fabricate data, labels, statuses, role names, dropdown options, counts, or module names.
4. Sidebar in app shell must become horizontal TopNav with RBAC-adaptive behavior.
5. TopNav must support overflow More and <=900px hamburger drawer.
6. Responsive behavior must satisfy 375, 768, 1280 checkpoints.
7. No new dependencies unless explicitly required.
8. Do not port tweaks-panel.jsx (preview-only tooling).

### 2.3 Unknown handling protocol (no assumptions)

If any implementation point is missing from audited artifacts:

1. Mark task status = BLOCKED.
2. Add a TODO(redesign) comment in code at exact unresolved spot.
3. Record blocker in section 13 (Blocker Log).
4. Do not invent missing visuals or behavior.

---

## 3. Audited Artifact Register

### 3.1 Core plan/instruction files

1. ../../local_folder/Reference/WebVersionRedesignReference/IMPLEMENTATION_PLAN.md
2. ../../local_folder/Reference/WebVersionRedesignReference/copilot-instructions.md

### 3.2 Shared design system and shell primitives

1. ../../local_folder/Reference/WebVersionRedesignReference/styles.css
2. ../../local_folder/Reference/WebVersionRedesignReference/components.css
3. ../../local_folder/Reference/WebVersionRedesignReference/app-data.js
4. ../../local_folder/Reference/WebVersionRedesignReference/shell.jsx
5. ../../local_folder/Reference/WebVersionRedesignReference/main.jsx

### 3.3 Screen prototype files

1. ../../local_folder/Reference/WebVersionRedesignReference/auth.jsx
2. ../../local_folder/Reference/WebVersionRedesignReference/home.jsx
3. ../../local_folder/Reference/WebVersionRedesignReference/reception.jsx
4. ../../local_folder/Reference/WebVersionRedesignReference/admin.jsx
5. ../../local_folder/Reference/WebVersionRedesignReference/settings.jsx
6. ../../local_folder/Reference/WebVersionRedesignReference/service-advisor.jsx
7. ../../local_folder/Reference/WebVersionRedesignReference/floor.jsx
8. ../../local_folder/Reference/WebVersionRedesignReference/technician.jsx
9. ../../local_folder/Reference/WebVersionRedesignReference/warranty.jsx

### 3.4 Screen data contracts (prototype data mirrors)

1. ../../local_folder/Reference/WebVersionRedesignReference/reception-data.js
2. ../../local_folder/Reference/WebVersionRedesignReference/admin-data.js
3. ../../local_folder/Reference/WebVersionRedesignReference/settings-data.js
4. ../../local_folder/Reference/WebVersionRedesignReference/service-advisor-data.js
5. ../../local_folder/Reference/WebVersionRedesignReference/floor-data.js
6. ../../local_folder/Reference/WebVersionRedesignReference/technician-data.js
7. ../../local_folder/Reference/WebVersionRedesignReference/warranty-data.js

### 3.5 Entry points and runtime wiring

1. ../../local_folder/Reference/WebVersionRedesignReference/Techwheels Redesign.html
2. ../../local_folder/Reference/WebVersionRedesignReference/Reception.html
3. ../../local_folder/Reference/WebVersionRedesignReference/Admin.html
4. ../../local_folder/Reference/WebVersionRedesignReference/Settings.html
5. ../../local_folder/Reference/WebVersionRedesignReference/Service Advisor.html
6. ../../local_folder/Reference/WebVersionRedesignReference/Floor Incharge.html
7. ../../local_folder/Reference/WebVersionRedesignReference/Technician.html
8. ../../local_folder/Reference/WebVersionRedesignReference/Warranty Reports.html
9. ../../local_folder/Reference/WebVersionRedesignReference/reception-main.jsx
10. ../../local_folder/Reference/WebVersionRedesignReference/admin-main.jsx
11. ../../local_folder/Reference/WebVersionRedesignReference/settings-main.jsx
12. ../../local_folder/Reference/WebVersionRedesignReference/service-advisor-main.jsx
13. ../../local_folder/Reference/WebVersionRedesignReference/floor-main.jsx
14. ../../local_folder/Reference/WebVersionRedesignReference/technician-main.jsx
15. ../../local_folder/Reference/WebVersionRedesignReference/warranty-main.jsx

### 3.6 Visual evidence packs

1. ../../local_folder/Reference/WebVersionRedesignReference/screens/* (all provided PNG snapshots)
2. ../../local_folder/Reference/WebVersionRedesignReference/uploads/* (uploaded screenshots and SQL chunks in reference folder)

Deep re-audit deltas captured from visual artifacts and prototypes:
1. Warranty-specific evidence artifacts are present (for example 01-wty.png, 02-wty.png).
2. Reception redesign artifact now reflects front-desk console split layout (intake form + live recent feed), not only table-first list layout.

Note: src/ inside this reference folder was inventoried and treated as context mirror, not as primary visual source unless explicitly referenced by IMPLEMENTATION_PLAN.md.

---

## 4. Target Implementation Map (Real Repo)

### 4.1 Core shell and routing

1. src/App.tsx

### 4.2 Authentication

1. src/pages/LoginPage.tsx
2. src/pages/SignUpPage.tsx
3. src/pages/PasswordUpdatePage.tsx

### 4.3 Dashboard and modules

1. src/pages/ReceptionPage.tsx
2. src/pages/AdminPage.tsx
3. src/pages/SettingsPage.tsx
4. src/pages/ServiceAdvisorPage.tsx
5. src/pages/FloorInchargePage.tsx
6. src/pages/TechnicianPage.tsx
7. src/pages/ReportsPage.tsx
8. src/pages/ImportPage.tsx
9. src/pages/AutoDocPage.tsx
10. src/pages/JobCardPage.tsx

### 4.4 Shared styling layer

1. src/index.css
2. src/App.css
3. Optional shared component CSS file if needed (same class names as reference)

---

## 5. Design System Contract (Must Port Exactly)

### 5.1 Theme tokens

From styles.css root tokens:

1. Accent and accent derivatives
2. Ink and neutral palette
3. Border and surface tokens
4. Status tokens (success, danger, warn)
5. Radius scale
6. Shadow scale
7. Density variables
8. Content max width token (--maxw = 1680px)
9. Font stacks (Plus Jakarta Sans, Geist Mono)

### 5.2 Shared class system

Classes that must be available in real app styling:

1. btn variants
2. inp, sel, inp-wrap
3. card, card__head, card__body
4. tbl and tbl-wrap
5. pill and badge system
6. tabs and tab
7. switch
8. cbx
9. modal family
10. note/callout styles
11. kpi and summary chip styles
12. menu/dropdown classes
13. action button classes (tbtn, mini)

### 5.3 Responsive requirements

1. <=1080: KPI 4->2, two-column content to one-column
2. <=900: module nav collapses to hamburger drawer
3. <=720: tab strip scroll, utility reductions, form grid compaction
4. <=600: tighter page paddings and typography scaling
5. <=420: KPI 1-column fallback
6. all widths: data tables in horizontal scroll container

---

## 6. Navigation And RBAC Contract

### 6.1 TopNav behavior

1. Utility strip (dealer identity, search, notifications, version)
2. Main nav row with module items
3. Inline module limit with overflow More menu
4. Reports dropdown menu categories in nav
5. User chip menu with profile/dealer/preferences/sign out entries
6. Mobile drawer for full module list
7. Support light and dark header variant

### 6.2 RBAC invariants

1. Render nav from existing visibleNavItems logic in real app.
2. Preserve route-level guards and permission checks.
3. Preserve default route resolution and existing access checks.

---

## 7. Screen-by-Screen Execution Scope

### 7.1 Auth set

1. Login visual redesign in LoginPage.tsx
2. Forgot password dedicated state/screen behavior using existing reset flow
3. Request access redesign in SignUpPage.tsx with password strength rules aligned with existing constraints
4. Preserve auth API calls and validation paths
5. Explicit auth constraint reconciliation required:
- SignUpPage mirror flow currently enforces minimum 8 chars.
- PasswordUpdate flow enforces 12+ with upper/lower/number/special.
- Prototype request-access design guidance expects 12+ strength-meter behavior.
- Final execution must preserve existing runtime logic unless user explicitly requests logic change.

### 7.2 Home and shell

1. App shell migration from sidebar to TopNav
2. Dashboard KPIs and cards visual redesign using real live counts
3. Recent reception table visual redesign
4. Activity feed visual redesign
5. RBAC module launcher visual redesign

### 7.3 Reception

1. Intake form layout parity
2. Required field behavior parity (Reg No, SA, Source)
3. Source option set parity
4. Console split layout parity: left sticky intake form + right live recent intake feed with newest-first prepend behavior
5. Feed item visual states parity including fresh-entry highlight animation
6. Import parser constraints from mirror TS implementation:
- required headers: reg_number and sa_employee_code
- row-level skip behavior when required fields are missing
- owner phone validation remains exact 10 digits

### 7.4 Admin

1. Four-tab structure parity (Users, Permissions, Modules, Mappings)
2. Users tab search/show inactive/cards/table/actions visual parity
3. Permissions matrix visual parity (View/Modify/Delete + quick full/none)
4. Modules tab table visual parity
5. Mappings tab table visual parity
6. Toast and modal visual parity
7. Dealer assignment constraint must remain explicit in UX/help text:
- dealer code is required for AutoDoc visibility
- user must sign out and sign back in after dealer updates for JWT/claims refresh

### 7.5 Settings

1. Section index card launcher parity
2. selectedSectionId gating behavior parity (single section open, default index-only)
3. Branch Management section parity
4. Employee Master section parity
5. Models section parity
6. AutoDoc Rate Cards section parity
7. Unmapped SR Entries section parity

### 7.6 Service Advisor

1. Advisor-only assigned rows presentation parity
2. Per-row editable controls parity (service type, JC number, remark)
3. Estimate upload/replace visual actions parity
4. Per-row save affordance parity
5. Service type editor must preserve current non-standard values by retaining current value as selectable option when it is outside standard option list

### 7.7 Floor Incharge

1. Assignment dashboard cards parity
2. Branch filter/search toolbar parity
3. Per-row assignment controls parity (bay, technician, status, remark)
4. Save-stage gating parity

### 7.8 Technician

1. Technician picker parity
2. Income tracker cards/table parity
3. Assigned rows table parity

### 7.9 Remaining modules without final redesign specs

1. ReportsPage.tsx - warranty report redesign is explicitly available in this bundle via warranty.jsx/warranty-data.js/warranty-main.jsx and Warranty Reports.html
2. ImportPage.tsx - shell + design system parity only until dedicated reference arrives
3. AutoDocPage.tsx and JobCardPage.tsx - shell + design system parity only until dedicated reference arrives

These are explicitly tracked as partially blocked-for-full-parity due to missing dedicated redesign specs for non-warranty report categories, Import, and AutoDoc/JobCard in the audited folder.

### 7.10 Reports - Warranty DB-backed scope (authoritative)

1. Warranty report implementation scope is constrained to the 7 authoritative warranty source tables present in the active dump:
- public.warranty_claim_settlement_report_data
- public.warranty_part_wc_data
- public.warranty_updation_claim_data
- public.warranty_goodwill_data
- public.warranty_amc_data
- public.warranty_fsb_data
- public.warranty_wc_data
2. Shared column contract across these 7 tables is fixed to:
- id, branch, location, portal, source_row_hash, source_row_number, source_file_name, source_row_data, created_at, updated_at.
3. Constraint/trigger contract from active dump:
- check constraints restrict branch/location to Ajmer Road or Sitapura, and portal to PV or EV.
- unique key is (branch, portal, source_row_hash) on all 7 tables.
- BEFORE UPDATE trigger exists on each table, executing public.set_updated_at().
4. Security contract from active dump:
- no CREATE POLICY entries were found for the 7 warranty tables.
- no ALTER TABLE public.warranty_* ENABLE ROW LEVEL SECURITY entries were found for the 7 warranty tables.
5. Snapshot row counts from authoritative dump COPY blocks (2026-06-02 validation):
- warranty_claim_settlement_report_data: 4110
- warranty_part_wc_data: 115
- warranty_updation_claim_data: 1939
- warranty_goodwill_data: 97
- warranty_amc_data: 403
- warranty_fsb_data: 2554
- warranty_wc_data: 2365
6. UI tab layout (Overview/Critical Alerts/Financial/Operations) remains a reference-driven redesign concern, but must only read from the DB-backed table/column contract above.
7. Non-warranty report categories remain blocked for full redesign parity until dedicated visual references are supplied (tracked under T-038/B-001).

---

## 8. Implementation Phases And Gates

### Phase 0 - Baseline lock

1. Confirm current branch state and build passes before redesign edits.
2. Snapshot existing UI references for before/after comparison.

Gate: baseline build green.

### Phase 1 - Design system foundation

1. Port tokens and class primitives.
2. Add shared Icon renderer compatible with audited icon paths.

Gate: style tokens and primitives render in sandbox page.

### Phase 2 - App shell migration

1. Replace sidebar with TopNav in App.tsx.
2. Preserve routing and RBAC logic.
3. Implement responsive drawer and overflow menus.

Gate: role presets (2/4/all modules equivalent) pass manual checks.

### Phase 3 - Auth screens

1. Login
2. Forgot
3. Request access

Gate: sign-in, reset flow, signup flow work unchanged.

### Phase 4 - Home dashboard and module launcher

1. Dashboard visuals and cards.
2. Reception summary/activity shells.

Gate: live data displays with no hardcoded fake values.

### Phase 5 - Operational modules designed in reference

1. Reception
2. Admin
3. Settings
4. Service Advisor
5. Floor Incharge
6. Technician

Gate: each screen passes acceptance checklist before next screen close.

### Phase 6 - Remaining modules (limited scope)

1. Reports:
- apply full redesign parity for Warranty report workflow using warranty prototypes in this bundle.
- keep non-warranty report categories blocked until dedicated redesign references are added.
2. Import and AutoDoc/JobCard shell parity only.
3. Mark full visual parity blocked where specific redesign references are still missing.

Gate: consistent shell/design system across all remaining pages.

### Phase 7 - Regression and release hardening

1. Responsive verification at 375/768/1280.
2. RBAC verification.
3. Build and runtime check.
4. Visual parity review against screens/ evidence.

Gate: no blockers, no logic regression, sign-off checklist complete.

---

## 9. Master Activity Tracker (Live)

Status codes: PENDING | IN_PROGRESS | REVIEW | DONE | BLOCKED

| ID | Workstream | Task | Source Evidence | Target Files | Status | Owner | Start | Last Update | Done | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| T-001 | Baseline | Baseline build and route sanity capture | IMPLEMENTATION_PLAN.md | src/* | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Build clean (718 modules, 983ms), lint clean, git clean, dev server running, login baseline UI captured |
| T-002 | Foundation | Port theme tokens (colors/type/radius/shadow/density) | styles.css | src/index.css, src/App.css | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Ported all token definitions: accent, ink, borders, status, radius, shadows, density, fonts. CSS variables ready in :root |
| T-003 | Foundation | Port shared component classes (btn/card/tbl/tabs/badge/modal/etc.) | styles.css + components.css | src/index.css or shared css | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Ported 200+ component classes from reference: auth, form, button, table, tabs, modal, badge, pill, feed, reception, warranty. Added responsive breakpoints. |
| T-004 | Foundation | Add/reuse shared Icon component with audited path set | app-data.js + shell.jsx | src/components or equivalent | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Created src/components/Icon.tsx with all 50 icon paths from reference ICON_PATHS library. Accepts name, size, className, strokeWidth props. |
| T-005 | Shell | Replace sidebar with TopNav utility+nav rows | shell.jsx + IMPLEMENTATION_PLAN.md | src/App.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Sidebar shell replaced with utility strip + horizontal TopNav, user chip menu, and reference brand treatment in App.tsx. |
| T-006 | Shell | Implement More overflow for nav | shell.jsx | src/App.tsx or nav component | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Added MAX_INLINE overflow behavior with More menu and active-state carryover for overflowed modules. |
| T-007 | Shell | Implement <=900 hamburger drawer nav | styles.css + shell.jsx | src/App.tsx + css | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Wired mobile hamburger drawer using existing nav__drawer/navdrawer__item responsive styles and route navigation handling. |
| T-008 | Shell | Preserve RBAC visibleNavItems and route guards | IMPLEMENTATION_PLAN.md + copilot-instructions.md | src/App.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Retained permission gating, default-route logic, and RequireAccess route wrappers while rendering nav from RBAC-filtered items. |
| T-009 | Auth | Redesign login screen visuals | auth.jsx | src/pages/LoginPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Login visual parity aligned with reference shell/auth grammar; error alert style normalized to shared alert variant. |
| T-010 | Auth | Redesign forgot-password flow visuals in login recovery UI | auth.jsx | src/pages/LoginPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Forgot page updated with reference pitch copy, back action, recovery note card, success state, and sign-in return flow. |
| T-011 | Auth | Redesign request-access screen visuals | auth.jsx | src/pages/SignUpPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Sign-up page aligned to reference layout (back action, role cards, password bar/rules, submitted confirmation block). |
| T-012 | Auth | Keep auth handlers and validation intact | copilot-instructions.md | src/pages/LoginPage.tsx, src/pages/SignUpPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Supabase auth calls and validation gates preserved; only presentational structure/class grammar changed. |
| T-013 | Home | Redesign dashboard hero/KPI/feeds/module launcher | home.jsx + app-data.js | src/App.tsx plus home target page | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Added /home landing dashboard with live KPI counts, recent reception table, activity feed shell, and RBAC-driven module launcher cards; Home entry added in TopNav and mobile drawer. |
| T-014 | Reception | Redesign intake form layout and controls | reception.jsx + reception-data.js | src/pages/ReceptionPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-015 | Reception | Redesign reception entries table and search toolbar | reception.jsx | src/pages/ReceptionPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-016 | Admin | Redesign tabs shell and summary chips | admin.jsx | src/pages/AdminPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-017 | Admin | Redesign Users tab | admin.jsx + admin-data.js | src/pages/AdminPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-018 | Admin | Redesign Permissions matrix tab | admin.jsx + admin-data.js | src/pages/AdminPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-019 | Admin | Redesign Modules tab | admin.jsx + admin-data.js | src/pages/AdminPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-020 | Admin | Redesign Mappings tab | admin.jsx + admin-data.js | src/pages/AdminPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-021 | Settings | Redesign section index cards | settings.jsx | src/pages/SettingsPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-022 | Settings | Enforce selectedSectionId single-open gating | settings.jsx + IMPLEMENTATION_PLAN.md | src/pages/SettingsPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-023 | Settings | Redesign Branch Management section | settings.jsx + settings-data.js | src/pages/SettingsPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-024 | Settings | Redesign Employee Master section | settings.jsx + settings-data.js | src/pages/SettingsPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-025 | Settings | Redesign Models section | settings.jsx + settings-data.js | src/pages/SettingsPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-026 | Settings | Redesign AutoDoc Rate Cards section | settings.jsx + settings-data.js | src/pages/SettingsPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-027 | Settings | Redesign Unmapped SR Entries section | settings.jsx + settings-data.js | src/pages/SettingsPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-028 | Service Advisor | Redesign advisor assigned-rows workspace | service-advisor.jsx + service-advisor-data.js | src/pages/ServiceAdvisorPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-029 | Floor Incharge | Redesign assignment workspace and controls | floor.jsx + floor-data.js | src/pages/FloorInchargePage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-030 | Technician | Redesign technician picker/income/rows workspace | technician.jsx + technician-data.js | src/pages/TechnicianPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-031 | Remaining Modules | Apply warranty report redesign parity in Reports | warranty.jsx + warranty-data.js + warranty-main.jsx + Warranty Reports.html | src/pages/ReportsPage.tsx and reports/warranty views | PENDING | unassigned | - | 2026-06-02 | - | Scope locked to 7 warranty source tables + shared metadata columns from authoritative dump; no inferred report-count taxonomy claims |
| T-032 | Remaining Modules | Apply shell + design-system parity to Import | IMPLEMENTATION_PLAN.md section pending | src/pages/ImportPage.tsx | PENDING | unassigned | - | 2026-06-02 | - | Full redesign spec not present in audited files |
| T-033 | Remaining Modules | Apply shell + design-system parity to AutoDoc and JobCard | IMPLEMENTATION_PLAN.md section pending | src/pages/AutoDocPage.tsx, src/pages/JobCardPage.tsx | PENDING | unassigned | - | 2026-06-02 | - | Full redesign spec not present in audited files |
| T-038 | Reports | Keep non-warranty report categories in blocked/pending state until dedicated redesign artifacts arrive | IMPLEMENTATION_PLAN.md + folder audit | src/pages/ReportsPage.tsx and reports/* (non-warranty) | BLOCKED | unassigned | - | 2026-06-02 | - | Needs dedicated redesign prototypes for labour-revenue, revenue, parts categories |
| T-039 | Governance | Reconcile reference instruction artifact status (copilot-instructions.md) | folder audit recheck | local_folder/Reference/WebVersionRedesignReference | DONE | unassigned | - | 2026-06-02 | 2026-06-02 | File present in second-pass re-audit; blocker closed |
| T-040 | Auth Governance | Resolve password-policy spec mismatch across redesign prototype and mirror TS flows | IMPLEMENTATION_PLAN.md + auth.jsx + src/pages/SignUpPage.tsx + src/pages/PasswordUpdatePage.tsx | src/pages/SignUpPage.tsx, src/pages/PasswordUpdatePage.tsx | BLOCKED | unassigned | - | 2026-06-02 | - | Needs explicit product decision before any logic normalization |
| T-041 | Reception Import | Preserve and verify import-required-header and row-skip behavior during redesign port | src/pages/ReceptionPage.tsx + reception.jsx | src/pages/ReceptionPage.tsx | PENDING | unassigned | - | 2026-06-02 | - | Required headers reg_number and sa_employee_code are explicit constraints |
| T-042 | Admin Dealer Flow | Preserve dealer assignment/re-login guidance and behavior in redesigned Admin UX | src/pages/AdminPage.tsx + admin.jsx | src/pages/AdminPage.tsx | PENDING | unassigned | - | 2026-06-02 | - | Dealer code assignment affects JWT/RLS visibility for AutoDoc |
| T-034 | QA | Responsive parity verification (375/768/1280) | IMPLEMENTATION_PLAN.md + styles.css | all touched pages | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Browser-validated shell/auth checkpoints at 1280, 768, 375; mobile drawer/menu density and top-shell spacing deltas corrected. |
| T-035 | QA | RBAC scenario verification (2/4/all equivalent) | app-data.js + IMPLEMENTATION_PLAN.md | src/App.tsx + module routes | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-036 | QA | Build, lint, runtime sanity and regression check | IMPLEMENTATION_PLAN.md acceptance checklist | workspace | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-037 | Release | Final parity audit against screens/ evidence | screens/* | all touched pages | PENDING | unassigned | - | 2026-06-02 | - |  |

---

## 10. Per-Task Update Protocol (Mandatory)

For every activity change, update section 9 immediately.

Rules:

1. Only one task should be IN_PROGRESS per executor at a time.
2. Move task to REVIEW only after local checks for that task are complete.
3. Move task to DONE only after acceptance evidence is captured.
4. Add concise notes in task Notes column: what changed, what was validated.
5. If blocked, move status to BLOCKED and add blocker ID in section 13.

---

## 11. Acceptance Checklist (Global)

1. No fabricated UI data appears.
2. Existing logic paths remain intact.
3. Existing RBAC enforcement unchanged.
4. TopNav parity and responsive collapse behavior validated.
5. Screen visuals match reference structure and token system.
6. Tables use horizontal overflow wrappers where needed.
7. Build passes clean.
8. Runtime has no new console errors tied to redesign.

---

## 12. Activity Log

| Date | Activity | Tracker IDs | Result | Evidence |
|---|---|---|---|---|
| 2026-06-02 | Phase 1 design system foundation completed: tokens ported, component classes ported, Icon component created. Build passes, dev server running. | T-002, T-003, T-004 | COMPLETE | src/index.css (tokens + base styles), src/App.css (200+ component classes + responsive), src/components/Icon.tsx (50 icon paths), npm run build ✓ 718 modules, screenshot of login with new token system |
| 2026-06-02 | Phase 0 baseline lock completed: build passes, lint clean, dev server running, login baseline UI captured | T-001 | COMPLETE | npm run build ✓, npm run lint ✓, git clean, dev server on :5173, login baseline screenshot |
| 2026-06-02 | Deep audit completed and fresh final plan created from reference artifacts | T-001 to T-037 initialized | COMPLETE | Audited files listed in section 3 |
| 2026-06-02 | Deep re-audit completed; warranty and reception-console deltas added; tracker updated with new tasks and blockers | T-031, T-038, T-039 and section updates | COMPLETE | Warranty Reports.html, warranty.jsx/data/main, reception.jsx, components.css, full file inventory |
| 2026-06-02 | Deep re-audit pass 2 completed; mirror TS constraints extracted and instruction-file status reconciled | T-039, T-040, T-041, T-042 and section updates | COMPLETE | src/pages/ReceptionPage.tsx, src/pages/AdminPage.tsx, src/pages/SignUpPage.tsx, src/pages/PasswordUpdatePage.tsx, src/pages/ServiceAdvisorPage.tsx, copilot-instructions.md |
| 2026-06-02 | Warranty DB authority validation completed; non-authoritative report-count/taxonomy claims removed and replaced with dump-backed schema contract | T-031, T-038 and section updates | COMPLETE | local_folder/backups/full_database.sql and local_folder/backups/chunks/full_database.sql.part_* warranty table/constraint/trigger/COPY audit |
| 2026-06-02 | Phase 2 shell migration completed in App.tsx: sidebar removed, TopNav utility strip/overflow/mobile drawer added, RBAC route guards preserved, build validated | T-005, T-006, T-007, T-008 | COMPLETE | src/App.tsx TopNav component + App shell refactor, npm run build ✓ |
| 2026-06-02 | Responsive parity pass completed at 1280/768/375 and Phase 3 auth refinements implemented/validated in browser | T-034, T-009, T-010, T-011, T-012 | COMPLETE | Browser checks on /import, /forgot-password, /signup plus updated src/App.css, src/pages/LoginPage.tsx, src/pages/ForgotPasswordPage.tsx, src/pages/SignUpPage.tsx, npm run build ✓ |
| 2026-06-02 | Phase 4 dashboard parity implemented with live data bindings and shell integration | T-013 | COMPLETE | src/pages/DashboardPage.tsx (live KPIs/reception/activity + module launcher), src/App.tsx (/home route + Home nav wiring), npm run build ✓ |

---

## 13. Blocker Log

| Blocker ID | Date | Related Task IDs | Blocker Description | Required Input To Unblock | Status |
|---|---|---|---|---|---|
| B-001 | 2026-06-02 | T-032, T-033, T-038 | Dedicated redesign prototypes are still missing for Import, AutoDoc/JobCard, and non-warranty report categories. | Provide finalized redesign reference files/snapshots/spec for Import, AutoDoc/JobCard, and non-warranty report pages. | OPEN |
| B-002 | 2026-06-02 | T-039 | Reference instruction file status reconciliation. | Verified in second-pass re-audit: file exists and is readable. | CLOSED |
| B-003 | 2026-06-02 | T-040 | Password policy mismatch across audited sources (prototype request-access guidance vs mirror SignUp minimum 8 chars vs PasswordUpdate 12+ strong policy). | Provide explicit product decision on whether sign-up policy remains 8+ (logic-preserving) or is elevated to 12+ strong policy. | OPEN |

---

## 14. Traceability Matrix (Source -> Implementation Work)

| Source Artifact | Extracted Requirement | Tracker IDs |
|---|---|---|
| ../../local_folder/Reference/WebVersionRedesignReference/IMPLEMENTATION_PLAN.md | Golden rules, no-fabrication, presentational-only lock, screen mapping, acceptance checks | T-001 to T-037 |
| ../../local_folder/Reference/WebVersionRedesignReference/copilot-instructions.md | Rule lock for logic preservation, no guessing, nav replacement, responsive requirements | T-005, T-008, T-012, T-034, T-035 |
| ../../local_folder/Reference/WebVersionRedesignReference/styles.css | Token palette, layout primitives, responsive breakpoints, shell anatomy | T-002, T-003, T-005, T-007, T-034 |
| ../../local_folder/Reference/WebVersionRedesignReference/components.css | Tabs/switch/checkbox/modal/badge/action component styles | T-003, T-016 to T-030 |
| ../../local_folder/Reference/WebVersionRedesignReference/app-data.js | Icons, module metadata, RBAC presets, dashboard mock contract | T-004, T-005, T-006, T-013, T-035 |
| ../../local_folder/Reference/WebVersionRedesignReference/shell.jsx | TopNav contract and interactive behavior | T-005, T-006, T-007 |
| ../../local_folder/Reference/WebVersionRedesignReference/auth.jsx | Login/Forgot/Request visual contract | T-009, T-010, T-011 |
| ../../local_folder/Reference/WebVersionRedesignReference/home.jsx | Dashboard, launcher, reception workspace visual structure | T-013, T-014, T-015 |
| ../../local_folder/Reference/WebVersionRedesignReference/reception.jsx + ../../local_folder/Reference/WebVersionRedesignReference/reception-data.js | Reception field/table/action contract | T-014, T-015 |
| ../../local_folder/Reference/WebVersionRedesignReference/admin.jsx + ../../local_folder/Reference/WebVersionRedesignReference/admin-data.js | Admin tabbed UI and table/matrix structures | T-016 to T-020 |
| ../../local_folder/Reference/WebVersionRedesignReference/settings.jsx + ../../local_folder/Reference/WebVersionRedesignReference/settings-data.js | Settings section-gating and 5-section content contract | T-021 to T-027 |
| ../../local_folder/Reference/WebVersionRedesignReference/service-advisor.jsx + ../../local_folder/Reference/WebVersionRedesignReference/service-advisor-data.js | Advisor assigned-rows workspace contract | T-028 |
| ../../local_folder/Reference/WebVersionRedesignReference/floor.jsx + ../../local_folder/Reference/WebVersionRedesignReference/floor-data.js | Floor assignment workflow contract | T-029 |
| ../../local_folder/Reference/WebVersionRedesignReference/technician.jsx + ../../local_folder/Reference/WebVersionRedesignReference/technician-data.js | Technician income and assigned-row contract | T-030 |
| ../../local_folder/Reference/WebVersionRedesignReference/warranty.jsx + ../../local_folder/Reference/WebVersionRedesignReference/warranty-data.js + ../../local_folder/Reference/WebVersionRedesignReference/warranty-main.jsx + ../../local_folder/Reference/WebVersionRedesignReference/Warranty Reports.html | Warranty UI redesign contract (4-tab layout and interaction model), with data binding constrained by authoritative DB schema | T-031 |
| local_folder/backups/full_database.sql + local_folder/backups/chunks/full_database.sql.part_* | Warranty DB contract: 7 source tables, fixed shared columns, branch/location/portal checks, unique(branch, portal, source_row_hash), updated_at triggers; no warranty-specific RLS policy/enable entries in active dump | T-031, T-038 |
| ../../local_folder/Reference/WebVersionRedesignReference/src/pages/SettingsPage.tsx | selectedSectionId section-gating, hash-deep-link behavior, single-section rendering contract | T-022 |
| ../../local_folder/Reference/WebVersionRedesignReference/reception.jsx + ../../local_folder/Reference/WebVersionRedesignReference/components.css | Reception console split-layout contract with sticky intake + live feed + fresh-item animation | T-014, T-015 |
| ../../local_folder/Reference/WebVersionRedesignReference/src/pages/ReceptionPage.tsx | Reception import contract: required headers reg_number and sa_employee_code, row skip handling, exact 10-digit owner phone validation | T-041 |
| ../../local_folder/Reference/WebVersionRedesignReference/src/pages/AdminPage.tsx | Dealer assignment contract: dealer code required for AutoDoc visibility and re-login required after dealer update | T-042 |
| ../../local_folder/Reference/WebVersionRedesignReference/src/pages/ServiceAdvisorPage.tsx | Service type selector contract: preserve non-standard existing values as selectable option | T-028 |
| ../../local_folder/Reference/WebVersionRedesignReference/src/pages/SignUpPage.tsx + ../../local_folder/Reference/WebVersionRedesignReference/src/pages/PasswordUpdatePage.tsx + ../../local_folder/Reference/WebVersionRedesignReference/auth.jsx + ../../local_folder/Reference/WebVersionRedesignReference/IMPLEMENTATION_PLAN.md | Auth password-policy conflict map requiring explicit product decision before logic normalization | T-040, B-003 |
| ../../local_folder/Reference/WebVersionRedesignReference/copilot-instructions.md | Copilot instruction rule lock confirmed present in second-pass re-audit | T-039 |
| ../../local_folder/Reference/WebVersionRedesignReference/*.html + ../../local_folder/Reference/WebVersionRedesignReference/*-main.jsx entrypoints | Per-screen composition wiring and role context assumptions for preview | T-005, T-013 to T-030 |
| ../../local_folder/Reference/WebVersionRedesignReference/screens/* | Visual parity evidence set | T-037 |

---

## 16. Re-Audit Delta Notes (2026-06-02)

1. Newly discovered explicit prototype screen set for Reports -> Warranty exists and is implementation-ready in reference folder.
2. Reception prototype is now an explicit front-desk console (form + live feed) and should be ported accordingly.
3. Components stylesheet includes reception and warranty-specific primitives that were not fully listed in first-pass tracker.
4. Mirror TypeScript settings page confirms hash-driven section selection behavior in addition to selectedSectionId gating.
5. Second-pass re-audit confirms copilot-instructions.md is present; prior missing-file blocker is closed.
6. Mirror TypeScript pages add explicit implementation constraints for reception import validation, dealer assignment re-login behavior, and service-advisor non-standard service-type retention.
7. Auth password policy mismatch across sources is now explicitly tracked as a decision blocker to prevent unintended logic drift.
8. Warranty scope is now explicitly constrained to the active dump's 7-table schema contract; non-authoritative report-count and taxonomy claims were removed to prevent assumption drift.

---

## 15. Execution Notes

1. This plan supersedes ad-hoc implementation sequencing.
2. Any new task must be appended to section 9 before work starts.
3. Any done task without tracker update is considered incomplete.
