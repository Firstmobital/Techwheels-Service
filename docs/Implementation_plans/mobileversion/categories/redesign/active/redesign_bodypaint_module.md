# redesign_bodypaint_module

Created: 2026-06-18
Last Updated: 2026-06-18
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

Database authority lock:
- Primary authority: `local_folder/backups/full_database.sql`
- If direct read is blocked by file size, use mirror chunks only:
  - `local_folder/backups/chunks/full_database.sql.part_000`
  - `local_folder/backups/chunks/full_database.sql.part_001`
  - `local_folder/backups/chunks/full_database.sql.part_002`
  - `local_folder/backups/chunks/full_database.sql.part_003`
  - `local_folder/backups/chunks/full_database.sql.part_004`
- Authority never downgrades to older snapshots.

---

## 1) Purpose

This is the implementation anchor for the mobile Body and Paint redesign.

This file is now aligned to the locked reference package and includes a schema-truth section so UI migration does not accidentally drift into data contract changes.

---

## 2) Scope Lock

In scope:
1. UI redesign parity for Body and Paint AutoDoc screens.
2. Shared presentational primitives reused by module screens.
3. Screen-level parity for layout, spacing, typography, token usage, and interaction styling.

Out of scope:
1. Business logic and workflow behavior changes.
2. API/Supabase query/schema/RLS/edge-function changes.
3. Navigation target or route contract changes.

Hard rules:
1. UI-only migration: edit markup, style objects, and className styling only.
2. Do not modify hooks, handlers, validation, stage-gating, upload logic, or fetch contracts.
3. Keep all existing field labels, content, and action verbs.

---

## 3) Reference-Derived Flow Map

Primary flow order from `Body & Paint Flow.dc.html`:
1. Dashboard
2. Create Job Card
3. Job Card
4. Damage
5. Panel Photos
6. Capture Photo
7. Estimate
8. Submit

Visual baseline from HTML prototype:
1. Mobile canvas at 392px device width with consistent top chrome.
2. One brand blue system (`#2a4cd0` family), one ink ramp, one background system.
3. Repeated header, tab, and progress patterns across screens.
4. Mobile-safe type cap (normal UI <= 20px, hero numbers may exceed).

---

## 4) Screen Inventory and Status

| ID | Screen | Mobile File | Current Status |
|---|---|---|---|
| BP-01 | Dashboard | `mobile/src/app/(tabs)/autodoc.tsx` | RV |
| BP-02 | Create Job Card | `mobile/src/app/job-cards/create.tsx` | RV |
| BP-03 | Job Card | `mobile/src/app/job-cards/[id]/jobcard.tsx` | RV |
| BP-04 | Damage | `mobile/src/app/job-cards/[id]/damage.tsx` | RV |
| BP-05 | Capture Photo | `mobile/src/app/job-cards/[id]/capture-photo.tsx` | RV |
| BP-06 | Panel Photos | `mobile/src/app/job-cards/[id]/panel-photos.tsx` | RV |
| BP-07 | Estimate | `mobile/src/app/job-cards/[id]/estimate.tsx` | RV |
| BP-08 | Submit | `mobile/src/app/job-cards/[id]/submit.tsx` | RV |

Notes:
1. Update statuses only in this file.
2. `mobile/src/app/(tabs)/bodyshop-repair.tsx` remains out of scope for this pass.

---

## 5) Design System Authority

Token authority:
1. `mobile/tailwind.config.js` is the only valid token source.
2. Off-system legacy values must be removed from Body and Paint screen code.

Mandatory implementation constraints:
1. One blue family and one ink/background system across all module screens.
2. Replace duplicated inline steppers and tab rows with shared components.
3. Use icon wrapper components, no emoji iconography.
4. Keep touch targets >= 44px.

High-priority delete list from final references:
1. `#4a43df`, `#3359d4`, `#2563eb`
2. `#1f9a6b` (replace with `#1c8f63`)
3. `#1f2430`, `#495063`, `#7a7d89`
4. `#e9e7e2`, `bg-amber-50`
5. Generic NativeWind color utilities in these screens (`bg-blue-600`, `text-gray-700`, `border-slate-200`, and similar)

---

## 6) Database Truth Lock (Authoritative Dump)

Schema truth source used for this plan update:
1. Read from chunk mirror because direct full dump read is blocked by size in tooling.
2. Source chunk verified: `local_folder/backups/chunks/full_database.sql.part_000`.

Body and Paint core tables (authoritative):
1. `public.job_cards`
2. `public.panels`
3. `public.panel_photos`
4. `public.estimate_rows`
5. `public.vehicles`
6. `public.autodoc_panel_master`
7. `public.autodoc_rate_cards`
8. `public.autodoc_rate_rows`
9. `public.bodyshop_intake_vehicle_photos`
10. `public.bodyshop_repair_cards`
11. `public.bodyshop_repair_card_documents`

Schema-backed constraints to preserve in UI behavior (no logic changes):
1. `panel_photos.repair_stage` is restricted to `pre-repair`, `under-repair`, `post-repair`.
2. `panel_photos` enforces GPS range checks for latitude and longitude.
3. `estimate_rows.row_total` is generated in DB; UI must not redefine row-total formula semantics.
4. `job_cards.status` uses enum-backed status semantics and must not be remapped in UI logic.
5. `vehicles.paint_type` and related vehicle metadata are data truth fields and should only be restyled, not reinterpreted.

Execution implication:
1. This redesign must remain a visual-only pass that preserves existing data contracts to these tables.
2. Any data-contract proposal requires a separate migration plan file; do not include in this redesign track.

---

## 7) Mandatory Shared Components

Build or standardize these before full screen migration:
1. `mobile/src/components/autodoc/ScreenHeader.tsx`
2. `mobile/src/components/autodoc/WorkflowTabs.tsx`
3. `mobile/src/components/autodoc/WorkflowProgress.tsx`
4. `mobile/src/components/ui/Field.tsx`
5. `mobile/src/components/ui/PrimaryButton.tsx`
6. `mobile/src/components/ui/SecondaryButton.tsx`
7. `mobile/src/components/ui/Chip.tsx` (token-consistent active/inactive states)
8. `mobile/src/components/autodoc/StatusPill.tsx` (single status-pill implementation)

---

## 8) Execution Order

1. Token audit and off-system value cleanup.
2. Shared component primitives.
3. `JobWorkflowHeader` migration to shared tabs/progress patterns.
4. Screen migration sequence:
   - `capture-photo.tsx`
   - `panel-photos.tsx`
   - `jobcard.tsx`
   - `submit.tsx`
   - `estimate.tsx`
   - `damage.tsx`
   - `create.tsx`
5. `_layout.tsx` tab icon and token alignment pass.
6. Dashboard parity tune-up for shared progress style.
7. iOS + Android parity audit evidence run.

---

## 9) Per-Screen Acceptance Criteria

A screen can move to `RV` only if all are true:
1. Visual parity validated against reference HTML and screenshots for that screen.
2. Shared header/tabs/progress and token system applied consistently.
3. No disallowed color/utility drift remains.
4. No logic/data/navigation contract changes introduced.
5. iOS and Android evidence captured.

A screen can move to `DN` only if all are true:
1. `RV` conditions pass.
2. Cross-screen continuity verified (Create -> Damage -> Estimate -> Submit).
3. No blocker remains in visual drift checklist.

---

## 10) Drift Prevention Rules

1. Any Body and Paint redesign instruction outside this file is non-authoritative.
2. `MOBILE-010` may summarize status only; implementation detail remains here.
3. If old notes conflict with this file, this file wins.
4. Keep updates append-only by date in the activity log.
5. DB authority remains `full_database.sql` (or chunk mirror as access path only), never older snapshots.

---

## 11) Activity Log

### 2026-06-18 Consolidation Entry

1. Consolidated Body and Paint redesign planning into this file from scattered active plans.
2. Locked final design reference source to `local_folder/Reference/redesign_bodypaint_module/*`.
3. Preserved non-Body and Paint redesign tracking in `MOBILE-009`.
4. Updated `MOBILE-010` reference behavior to treat this file as execution anchor.

### 2026-06-18 Reference + DB Truth Alignment

1. Synced flow and design constraints from:
   - `Body & Paint Flow.dc.html`
   - `implementation-plan.md`
   - `copilot-instructions.md`
2. Added explicit database authority lock and chunk-mirror fallback rule.
3. Added authoritative Body and Paint table list from dump mirror for UI-only guardrails.
4. Added schema-backed constraints to prevent accidental behavior drift during redesign.

### 2026-06-18 Final Cross-Screen Parity Sweep

1. Completed sweep across: `create`, `damage`, `estimate`, `submit`, `jobcard`, `panel-photos`, `capture-photo`, and dashboard (`autodoc`).
2. Verified diagnostics clean on all migrated files.
3. Removed remaining `className` drift from `submit.tsx` and `estimate.tsx`.
4. Verified high-priority forbidden color/utility drift is clean across all migrated files.
5. Kept hero metric typography >20px only where intentional (dashboard stage counts, estimate totals, damage stage metrics, create step badge).

### 2026-06-18 Dashboard Visual-Lock Accepted

1. Dashboard resemblance accepted from latest iOS screenshot review (post polish pass).
2. Locked dashboard polish pattern as baseline for remaining screen finalization.
3. Required parity details to replicate screen-by-screen:
   - stage summary cards use top color strips (not icon tiles)
   - card workflow uses compact segmented pipeline bars with stage label
   - status indicator dot color reflects live status state
   - tightened spacing and type-weight hierarchy to match reference density
4. This baseline now applies to all Body and Paint screens before `DN` promotion.

---

## 12) Immediate Next Action

1. Apply the dashboard-approved final polish pattern to each remaining `RV` screen in flow order: `create`, `jobcard`, `damage`, `panel-photos`, `capture-photo`, `estimate`, `submit`.
2. For each screen, compare against reference HTML + latest device screenshot pair before status change.
3. Record per-screen evidence and residual deltas in this file.
4. Promote each screen from `RV` to `DN` only after parity checklist passes on both iOS and Android.
5. Sync high-level progress summary into `MOBILE-010` after each screen-level `DN` promotion.

