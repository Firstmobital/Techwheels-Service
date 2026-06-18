# redesign_bodypaint_module

Created: 2026-06-18
Owner: Techwheels Product + Mobile Engineering + GitHub Copilot
Status: ACTIVE (Single Source of Truth)
Priority: CRITICAL

Reference lock (final source):
- `local_folder/Reference/redesign_bodypaint_module/Body & Paint Flow.dc.html`
- `local_folder/Reference/redesign_bodypaint_module/implementation-plan.md`
- `local_folder/Reference/redesign_bodypaint_module/copilot-instructions.md`
- `local_folder/Reference/redesign_bodypaint_module/mobile/*`
- `local_folder/Reference/redesign_bodypaint_module/screenshots/*`
- `local_folder/Reference/redesign_bodypaint_module/support.js`

---

## 1) Purpose

This is the only implementation plan for the mobile Body & Paint redesign.

This file consolidates and replaces Body & Paint redesign directives that were previously scattered across other active mobile planning files.

---

## 2) Scope Lock

In scope:
1. UI redesign parity for Body & Paint (AutoDoc) screens only.
2. Shared presentational primitives used by these screens.
3. Screen-level visual parity, spacing, typography, token consistency, and interaction styling.

Out of scope:
1. Business logic changes.
2. Data-layer, API, Supabase query, schema, RLS, edge function, and workflow contract changes.
3. Navigation target changes and route contract changes.

Hard rule:
1. This is a visual/interaction refactor only. Keep flow behavior and data semantics unchanged unless explicitly approved in chat.

---

## 3) Screen Inventory (Body & Paint)

| ID | Screen | Mobile File | Current Status |
|---|---|---|---|
| BP-01 | Dashboard | `mobile/src/app/(tabs)/autodoc.tsx` | IP |
| BP-02 | Create Job Card | `mobile/src/app/job-cards/create.tsx` | IP |
| BP-03 | Job Card | `mobile/src/app/job-cards/[id]/jobcard.tsx` | RV |
| BP-04 | Damage | `mobile/src/app/job-cards/[id]/damage.tsx` | IP |
| BP-05 | Capture Photo | `mobile/src/app/job-cards/[id]/capture-photo.tsx` | IP |
| BP-06 | Panel Photos | `mobile/src/app/job-cards/[id]/panel-photos.tsx` | IP |
| BP-07 | Estimate | `mobile/src/app/job-cards/[id]/estimate.tsx` | IP |
| BP-08 | Submit | `mobile/src/app/job-cards/[id]/submit.tsx` | IP |

Notes:
1. Statuses above are migrated from prior tracker state and should be updated only in this file.
2. `mobile/src/app/(tabs)/bodyshop-repair.tsx` is explicitly out of scope for this pass.

---

## 4) Design System Authority (Final)

Token authority:
1. `mobile/tailwind.config.js` token values are the only valid source for module colors/typography semantics in implementation.
2. Off-system values from legacy files must be removed as directed by the final reference instructions.

Implementation constraints (from final reference instructions):
1. Use one consistent blue family and one ink/background system for all Body & Paint screens.
2. Cap normal UI type to mobile-safe scale; only hero numbers may exceed title scale.
3. Replace duplicated inline steppers/tabs with shared components.
4. Use shared icon wrapper and avoid emoji iconography.
5. Keep touch targets at least 44px.

---

## 5) Mandatory Shared Components

Build/reuse these shared presentational components before full screen pass:
1. `mobile/src/components/autodoc/ScreenHeader.tsx`
2. `mobile/src/components/autodoc/WorkflowTabs.tsx`
3. `mobile/src/components/autodoc/WorkflowProgress.tsx`
4. `mobile/src/components/ui/Field.tsx`
5. `mobile/src/components/ui/PrimaryButton.tsx`
6. `mobile/src/components/ui/SecondaryButton.tsx`
7. `mobile/src/components/ui/Chip.tsx` (token-consistent states)
8. `mobile/src/components/autodoc/StatusPill.tsx` (reuse and standardize usage)

---

## 6) Execution Order

1. Token audit and off-system value cleanup.
2. Shared component primitives.
3. `JobWorkflowHeader` migration to shared tabs/progress.
4. Screen migration sequence:
   - `capture-photo.tsx`
   - `panel-photos.tsx`
   - `jobcard.tsx`
   - `submit.tsx`
   - `estimate.tsx`
   - `damage.tsx`
   - `create.tsx`
5. `_layout.tsx` tab icon and token alignment pass.
6. Dashboard fine-tune pass for consistency with shared progress styling.
7. iOS + Android parity audit evidence run.

---

## 7) Per-Screen Acceptance Criteria

A screen can move to `RV` only if all are true:
1. Visual parity checked against final reference artboard/screenshot for that screen.
2. Shared header/tabs/progress and token system applied consistently where relevant.
3. No disallowed color/utility drift remains.
4. No logic/data/navigation contract changes introduced.
5. iOS and Android evidence captured.

A screen can move to `DN` only if all are true:
1. `RV` conditions pass.
2. Cross-screen flow continuity verified (Create -> Damage -> Estimate -> Submit where applicable).
3. No blocker remains in known visual drift list.

---

## 8) Drift Prevention Rules

1. Any Body & Paint redesign note outside this file is non-authoritative.
2. `MOBILE-010` may summarize status, but implementation detail must live here.
3. If conflict occurs between old notes and this file, this file wins.
4. Keep updates append-only by date in Section 9 to avoid losing decision history.

---

## 9) Activity Log

### 2026-06-18 Consolidation Entry

1. Consolidated Body & Paint redesign planning into this file from scattered active plans.
2. Locked final reference source to `local_folder/Reference/redesign_bodypaint_module/*`.
3. Preserved non-Body & Paint redesign tracking in `MOBILE-009`.
4. Updated `MOBILE-010` to reference this file as Body & Paint redesign execution anchor.

---

## 10) Immediate Next Action

1. Run device validation pass for current in-progress screens (BP-01, BP-02, BP-04, BP-05, BP-06, BP-07, BP-08).
2. Record evidence and status transitions in this file only.
3. Sync summary status in `MOBILE-010` after each session.

