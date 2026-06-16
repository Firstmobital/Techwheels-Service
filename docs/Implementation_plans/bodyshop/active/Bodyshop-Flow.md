# Techwheels Bodyshop Web Redesign - Implementation Plan (Master Tracker)

Status: ACTIVE
Plan owner: Execution team
Audit basis date: 2026-06-16
Primary source folder: local_folder/Reference/redesign_bs_flow
Reference root (from this file): ../../../../local_folder/Reference/redesign_bs_flow
Reference root (workspace-relative): local_folder/Reference/redesign_bs_flow
Deep audit pass: 2026-06-16 (prototype HTML + mirror TS + API + companion design assets)

Primary UI reference lock:
1. local_folder/Reference/redesign_bs_flow/bodyshop-redesign/bodyshop-floor.html
2. local_folder/Reference/redesign_bs_flow/bodyshop-redesign/bodyshop-repair.html

Path convention in this plan:
1. Any bare reference filename resolves under ../../../../local_folder/Reference/redesign_bs_flow.
2. Workspace files (for example src/pages/BodyshopFloorPage.tsx) are rooted at project root.

---

## 1. Purpose

This is the consolidated, phased implementation tracker for redesigning:
1. /bodyshop-floor
2. /bodyshop-repair

The redesign source of truth is the audited reference folder and its full-page HTML prototypes.

This plan is presentational-only. It explicitly forbids business-logic, API-contract, database, and workflow behavior changes.

---

## 2. Authority And Drift Guard

### 2.0 Schema authority lock (mandatory)

1. Treat local_folder/backups/full_database.sql as the authoritative schema and full database dump (authority never downgrades).
2. If direct file access is blocked by size limits, use local_folder/backups/chunks/full_database.sql.part_* as the access mirror of the same authoritative dump.
3. Do not assume schema entities, fields, or data contracts outside the authoritative dump.

### 2.1 Authority order

1. Bodyshop-Flow.md (this file, execution tracker)
2. ../../../../local_folder/Reference/redesign_bs_flow/bodyshop-redesign/IMPLEMENTATION_PLAN.md
3. ../../../../local_folder/Reference/redesign_bs_flow/bodyshop-redesign/COPILOT_INSTRUCTIONS.md
4. ../../../../local_folder/Reference/redesign_bs_flow/bodyshop-redesign/bodyshop-floor.html
5. ../../../../local_folder/Reference/redesign_bs_flow/bodyshop-redesign/bodyshop-repair.html
6. ../../../../local_folder/Reference/redesign_bs_flow/src/pages/BodyshopFloorPage.tsx
7. ../../../../local_folder/Reference/redesign_bs_flow/src/pages/BodyshopRepairPage.tsx
8. ../../../../local_folder/Reference/redesign_bs_flow/src/lib/api/bodyshopRepair.ts
9. ../../../../local_folder/Reference/redesign_bs_flow/design/BodyshopFloor.dc.html (secondary context only; not primary UI source)

### 2.2 Non-negotiable constraints

1. Redesign is presentational only; preserve all existing behavior.
2. Do not change Supabase query shapes, RPC calls, edge function usage, storage flow, stage progression rules, or gating rules.
3. Do not invent schema or add migrations for this redesign scope.
4. Preserve every disabled/enabled condition exactly as current runtime behavior.
5. Preserve all existing role visibility and access-control behavior.
6. Keep existing TopNav shell behavior; do not create standalone bespoke headers in app code.
7. Keep Stage 1-18 labels and group semantics exactly aligned with current API contract.
8. Keep Additional Approval and Floor Assignment concurrent behavior unchanged.
9. Keep all customer-type document requirements and no-doc cases (cash/foc) unchanged.
10. No new dependencies unless absolutely required and approved.
11. Do not use test data, trial data, assumed data, placeholder/mock records, or hardcoded fake counts in any redesigned surface.
12. All redesign surfaces must be wired to live database-backed data paths already used by production code.

### 2.3 Unknown handling protocol

If any visual behavior is ambiguous in references:
1. Mark task status = BLOCKED.
2. Add TODO(bodyshop-redesign) comment at unresolved implementation point.
3. Record blocker in section 12.
4. Do not guess missing UX or data behavior.

---

## 3. Deep Audit Register

### 3.1 Reference folder inventory (audited)

1. bodyshop-redesign/COPILOT_INSTRUCTIONS.md
2. bodyshop-redesign/IMPLEMENTATION_PLAN.md
3. bodyshop-redesign/bodyshop-floor.html
4. bodyshop-redesign/bodyshop-repair.html
5. design/BodyshopFloor.dc.html
6. design/support.js
7. src/App.css
8. src/App.tsx
9. src/components/Icon.tsx
10. src/components/TopNav.tsx
11. src/index.css
12. src/lib/api/bodyshopRepair.ts
13. src/lib/api/estimate.ts
14. src/lib/api/panels.ts
15. src/lib/api/photos.ts
16. src/pages/BodyshopFloorPage.tsx
17. src/pages/BodyshopRepairPage.tsx

### 3.2 Audited design-system findings

1. Prototypes use real token grammar aligned to production naming (accent, ink, border, surface, success/warn/danger/info, radius/shadow scales).
2. Typography target is Plus Jakarta Sans for UI and Geist Mono for numeric/coded values.
3. Header target mirrors existing TopNav structure (utility strip + nav row), not a disconnected page-local shell.
4. Floor page redesign introduces KPI-as-filter, roster card architecture, role lanes, and footer action blocks.
5. Repair page redesign introduces pipeline rail, stage queue, card board, full-screen detail shell, stepper, and 7-tab content model.
6. Color-coded status semantics are explicit and consistent across both modules.
7. Primary UI source lock is bodyshop-redesign/bodyshop-floor.html and bodyshop-redesign/bodyshop-repair.html; design/BodyshopFloor.dc.html is non-primary context only.

### 3.3 Audited behavior-contract findings

1. Stage catalog is 1-18 and must remain unchanged.
2. Floor role model is fixed to DENTOR, PAINTER, TECHNICIAN, ELECTRICIAN, DET.
3. Additional Approval supports multi-part request and per-part decisions.
4. Stage 11 and Stage 12 have concurrent visibility/queue behavior.
5. Survey and approved-parts gating must remain strict (including photo/doc dependencies).
6. New Intake and card filtering logic in repair tracker must remain behaviorally equivalent.
7. Floor completion gating must remain dependent on active work + approval resolution rules.

---

## 4. Target Implementation Map (Real Repo)

1. src/pages/BodyshopFloorPage.tsx
2. src/pages/BodyshopRepairPage.tsx
3. src/lib/api/bodyshopRepair.ts (read-only compatibility validation only; no contract drift)
4. src/App.css
5. src/index.css
6. src/components/TopNav.tsx (integration verification only)

---

## 5. Visual Contract To Port

### 5.1 Bodyshop Floor visual contract

1. Page header with module context and stable action controls.
2. KPI strip with clickable status filtering.
3. Unified filter bar: search, branch chips, floor chips, role filter.
4. Vehicle roster cards replacing table-first scanning as default layout.
5. Per-role lane cards with assignee, support picker, status controls, remark, save action.
6. Footer split blocks:
   - BS Floor completion state and action.
   - Additional Approval action/state with part chips and view hooks.
7. Modal redesign for Additional Approval request form (multi-part rows, image field, submit flow).

### 5.2 Repair Tracker visual contract

1. Toolbar with period/filter/search and New Intake entry point.
2. Pipeline rail grouped by stage bands and delivered summary.
3. Stage Queue grid with count-bearing stage cards.
4. Repair cards board with stage-colored accents and concise metadata.
5. Full-screen detail shell:
   - Top bar summary
   - Left stage stepper (with floor substages and Additional Approval status)
   - Right tabbed work area
6. Seven tab surfaces: Overview, SA, Approval, Survey, Floor, QC, Billing.
7. Document and approval visual states with consistent badge/tag language.

### 5.3 Responsiveness contract

1. Desktop-first operational layout for high-density workflows.
2. Tablet compaction without logic loss.
3. Mobile-safe fallback for key actions, filters, and tab navigation.
4. No horizontal-break regressions for critical workflow controls.

---

## 6. Execution Sequence (Mandatory)

1. Baseline parity lock: capture current behavior snapshots for both pages before UI changes.
2. Shared style normalization: tokens, typography, badges, buttons, panel primitives.
3. Bodyshop Floor redesign in slices:
   - Header + KPI + filters
   - Roster card shell
   - Role lanes
   - Footer actions
   - Additional Approval modal
4. Repair Tracker redesign in slices:
   - Toolbar + pipeline + queue + card board
   - Detail shell + stepper
   - Tab-by-tab restyling
5. Cross-page visual harmonization and anti-drift cleanup.
6. End-phase regression pass and sign-off evidence.
7. Visual Sync Lock end-phase pass across all touched files (global drift check).

---

## 7. Phased Tasks

### Phase R0 - Audit Lock And Baseline

- [ ] R0.1 Capture baseline screenshots/video for /bodyshop-floor and /bodyshop-repair.
- [ ] R0.2 Document current gating-critical controls (disabled states, role visibility, stage transitions).
- [ ] R0.3 Freeze behavior-contract checklist from audited TS/API sources.

### Phase R1 - Shared Styling Foundation

- [ ] R1.1 Align shared token usage in src/index.css and src/App.css to audited reference grammar.
- [ ] R1.2 Normalize component primitives (btn, inp, sel, card, badge, modal, table wrappers).
- [ ] R1.3 Ensure mono typography application for codes/timestamps/amounts.
- [ ] R1.4 Remove emoji-first styling patterns where replaced by icon system.

### Phase R2 - Bodyshop Floor Redesign

- [ ] R2.1 Implement page header, KPI strip, and filter bar redesign.
- [ ] R2.2 Implement roster-card container and vehicle identity summary sections.
- [ ] R2.3 Implement 5-role lane UI redesign while preserving existing handlers.
- [ ] R2.4 Implement lane-level save/remark/status visual states without logic changes.
- [ ] R2.5 Implement footer redesign for floor completion and approval summary.
- [ ] R2.6 Redesign Additional Approval modal and multipart form visuals.
- [ ] R2.7 Validate floor completion and approval gating parity after redesign.

### Phase R3 - Repair Tracker List Surface

- [ ] R3.1 Implement toolbar redesign (search, period, branch, advisor, status, new intake trigger).
- [ ] R3.2 Implement pipeline rail with group color semantics and counts.
- [ ] R3.3 Implement stage queue visual redesign with count cards.
- [ ] R3.4 Implement card board redesign (stage accent, metadata hierarchy, progress readability).
- [ ] R3.5 Redesign New Intake modal visuals preserving existing field flow.

### Phase R4 - Repair Tracker Detail Surface

- [ ] R4.1 Implement full-screen detail shell redesign (top bar + layout skeleton).
- [ ] R4.2 Implement stage stepper redesign with done/current states.
- [ ] R4.3 Implement floor substages and Additional Approval concurrent indicators in stepper.
- [ ] R4.4 Redesign tab bar and tab containers.
- [ ] R4.5 Redesign Overview tab visuals.
- [ ] R4.6 Redesign SA tab visual subsections (Receiving, Docs, Estimate, Claim Intimation).
- [ ] R4.7 Redesign Approval tab visuals.
- [ ] R4.8 Redesign Survey tab visuals including approved parts and additional approval decisions.
- [ ] R4.9 Redesign Floor tab visuals for snapshot read-only context.
- [ ] R4.10 Redesign QC and Billing tab visuals.

### Phase R5 - Regression And Parity Validation

- [ ] R5.1 Validate no query/contract drift in bodyshop pages.
- [ ] R5.2 Validate all stage gating and disabled states match baseline behavior.
- [ ] R5.3 Validate role-gated visibility remains unchanged.
- [ ] R5.4 Validate Additional Approval request/decision workflow parity.
- [ ] R5.5 Validate Stage 10/11/12 concurrent semantics parity.
- [ ] R5.6 Validate responsive behavior at 375, 768, 1280 widths.
- [ ] R5.7 Capture before/after evidence pack for sign-off.
- [ ] R5.8 Visual Sync Lock end-phase pass across all touched files (global drift check).

### Phase R6 - Release Readiness

- [ ] R6.1 Final visual QA walkthrough with operations stakeholders.
- [ ] R6.2 Build verification and smoke checks.
- [ ] R6.3 Rollout plan and rollback notes (UI-only rollback path).

---

## 8. Activity Tracker

Legend:
- COMPLETED
- IN PROGRESS
- PENDING
- BLOCKED

### Phase R0

IN PROGRESS | R0.1 | Capture baseline evidence | Web QA | 2026-06-16 | 2026-06-16 | Baseline capture started (bodyshop-floor and bodyshop-repair)
PENDING | R0.2 | Gating-critical control inventory | Web QA | - | - | Pending baseline capture
PENDING | R0.3 | Behavior-contract freeze doc | Web Dev | - | - | Pending source lock

### Phase R1

PENDING | R1.1 | Token alignment in shared CSS | Web Dev | - | - | Not started
PENDING | R1.2 | Primitive component visual normalization | Web Dev | - | - | Not started
PENDING | R1.3 | Mono typography normalization | Web Dev | - | - | Not started
PENDING | R1.4 | Emoji to icon replacement pass | Web Dev | - | - | Not started

### Phase R2

PENDING | R2.1 | Floor header/KPI/filter redesign | Web Dev | - | - | Not started
PENDING | R2.2 | Floor roster-card shell | Web Dev | - | - | Not started
PENDING | R2.3 | Role lanes redesign | Web Dev | - | - | Not started
PENDING | R2.4 | Lane status/save/remark visual states | Web Dev | - | - | Not started
PENDING | R2.5 | Footer status/action redesign | Web Dev | - | - | Not started
PENDING | R2.6 | Additional Approval modal redesign | Web Dev | - | - | Not started
PENDING | R2.7 | Floor gating parity validation | QA + Web Dev | - | - | Not started

### Phase R3

PENDING | R3.1 | Repair toolbar redesign | Web Dev | - | - | Not started
PENDING | R3.2 | Pipeline rail redesign | Web Dev | - | - | Not started
PENDING | R3.3 | Stage queue redesign | Web Dev | - | - | Not started
PENDING | R3.4 | Repair card board redesign | Web Dev | - | - | Not started
PENDING | R3.5 | New Intake modal redesign | Web Dev | - | - | Not started

### Phase R4

PENDING | R4.1 | Detail shell redesign | Web Dev | - | - | Not started
PENDING | R4.2 | Stepper redesign | Web Dev | - | - | Not started
PENDING | R4.3 | Floor/AA concurrent indicators | Web Dev | - | - | Not started
PENDING | R4.4 | Tab shell redesign | Web Dev | - | - | Not started
PENDING | R4.5 | Overview tab redesign | Web Dev | - | - | Not started
PENDING | R4.6 | SA tab redesign | Web Dev | - | - | Not started
PENDING | R4.7 | Approval tab redesign | Web Dev | - | - | Not started
PENDING | R4.8 | Survey tab redesign | Web Dev | - | - | Not started
PENDING | R4.9 | Floor tab redesign | Web Dev | - | - | Not started
PENDING | R4.10 | QC/Billing tab redesign | Web Dev | - | - | Not started

### Phase R5

PENDING | R5.1 | Query/contract drift check | Web Dev | - | - | Not started
PENDING | R5.2 | Gating parity check | QA | - | - | Not started
PENDING | R5.3 | Role visibility parity | QA | - | - | Not started
PENDING | R5.4 | Additional Approval parity | QA | - | - | Not started
PENDING | R5.5 | Stage 10/11/12 concurrency parity | QA | - | - | Not started
PENDING | R5.6 | Responsive matrix | QA | - | - | Not started
PENDING | R5.7 | Sign-off evidence pack | QA + Product | - | - | Not started
PENDING | R5.8 | Visual Sync Lock end-phase pass (all touched files) | QA + Web Dev | - | - | Not started

### Phase R6

PENDING | R6.1 | Final visual walkthrough | Product + Ops | - | - | Not started
PENDING | R6.2 | Build and smoke verification | Web Dev | - | - | Not started
PENDING | R6.3 | Rollout and rollback notes | Web Dev + Ops | - | - | Not started

---

## 9. Acceptance Gates

1. No behavior drift in stage logic, gating, or data writes.
2. No API query/contract drift from baseline.
3. Floor and Repair both visually aligned to audited prototypes.
4. TopNav integration remains consistent with app shell.
5. Additional Approval and floor completion flows pass parity checks.
6. Responsive checkpoints pass for operational usage.
7. Visual Sync Lock end-phase global drift check passes across all touched files.
8. No test/trial/assumed/mock data appears in UI; all rendered data is DB-wired through production data paths.

---

## 9A. Final Visual Sync Lock Checklist

Run this checklist in end-phase validation before release sign-off.

1. Grep page sources for style={{ and confirm only state-driven conditionals remain.
2. Verify page components return plain <div> wrappers (no inner .page wrapper).
3. Ensure form control sizing is class-based (.sel-sm/.sel-md/.sel-lg and .inp-md/.inp-lg), not inline.
4. Ensure text/cell styling is class-based (for example accent/muted/timestamp/nowrap states), not inline.
5. Ensure spacing, padding, and visual sizing are class-driven from shared CSS primitives.
6. Compare side-by-side with the Home baseline in the same browser session and confirm parity for margins, typography, card rhythm, controls, and table density.
7. If any visual difference is found, trace root cause (wrapper, class mismatch, inline style drift) and fix before marking release-ready.

---

## 10. Risks And Mitigations

1. Risk: Visual refactor accidentally alters logic wiring.
   Mitigation: keep handlers/state untouched, JSX/CSS-only slices, per-slice parity testing.
2. Risk: Stage concurrency (11/12) regresses due to UI restructuring.
   Mitigation: dedicated R5.5 validation with explicit scenario matrix.
3. Risk: Role-based access visuals expose hidden actions.
   Mitigation: R5.3 role matrix pass before sign-off.
4. Risk: Dense UI redesign hurts mobile usability.
   Mitigation: R5.6 responsive checks and compact-mode adjustments.

---

## 11. Notes And Lessons Learned

2026-06-16:
1. Reference package is sufficiently complete for phased production redesign of both pages.
2. The prototype contract is explicit that this initiative is UI-only and must preserve all runtime behavior.
3. The reference set includes both high-fidelity HTML prototypes and TS/API mirrors, reducing ambiguity.
4. Redesign execution officially started with Phase R0 baseline evidence capture (R0.1 set to IN PROGRESS).

---

## 12. Blocker Log

None currently.

---

## 13. Change Control

When updating this tracker:
1. Update checkbox status in section 7.
2. Update corresponding activity rows in section 8.
3. Append a dated note in section 11.
4. Add blocker entries in section 12 when needed.

