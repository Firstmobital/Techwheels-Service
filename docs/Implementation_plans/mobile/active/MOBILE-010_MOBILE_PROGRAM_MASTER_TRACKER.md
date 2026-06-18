# MOBILE-010: Mobile Program Master Tracker

Created: 2026-06-17
Owner: Techwheels Product + Mobile Engineering + GitHub Copilot
Status: ACTIVE (Canonical Authority)

---

## 1) Purpose

This is the single master file for cross-plan mobile program execution and status tracking.

Use this file to:
1. Track program-level progress across all active mobile plans.
2. Resolve status conflicts between plan-specific trackers.
3. Define current priorities, sequencing, and release gates.
4. Provide one restart-safe entry point for future chat sessions.

---

## 2) Authority Model (Enforced)

1. Program execution authority: this file (`MOBILE-010_MOBILE_PROGRAM_MASTER_TRACKER.md`).
2. Strategy baseline: `MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md`.
3. Historical/context overview: `MOBILE-000_OVERVIEW.md`.
4. Domain trackers remain active but subordinate to this file.

If any child tracker conflicts with this file, this file wins until explicitly updated.

---

## 3) Linked Plans (Single Program View)

| Plan ID | File | Scope | Current Status | Program Priority | Dependency Notes |
|---|---|---|---|---|---|
| MOBILE-000 | `docs/Implementation_plans/mobile/active/MOBILE-000_OVERVIEW.md` | Legacy overview and orientation | Active (context) | Medium | Keep as entry overview, not execution authority |
| MOBILE-001 | `docs/Implementation_plans/mobile/active/MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md` | Core implementation strategy | Active | High | Strategy baseline for all mobile workstreams |
| MOBILE-005 | `docs/Implementation_plans/mobile/active/MOBILE-005_AUTODOC_GPS_STAMP_PARITY_PLAN.md` | AutoDoc GPS stamp parity | In Progress | High | Aligns with MOBILE-001 parity and release gates |
| MOBILE-006 | `docs/Implementation_plans/mobile/active/MOBILE-006_GOOGLE_SATELLITE_HYBRID_STAMP_PLAN.md` | Satellite stamp provider plan | Pending | Medium | Depends on cost/quota guardrails and backend proxy |
| MOBILE-007 | `docs/Implementation_plans/mobile/active/MOBILE-007_PLATFORM_HOME_SUPERAPP_TRACKER.md` | Platform home rollout | In Progress | High | Child tracker for home/shell execution |
| MOBILE-008 | `docs/Implementation_plans/mobile/active/MOBILE-008_BACKGROUND_PROCESSING_STATE_UX_PLAN.md` | Async/background UX states | Pending | High | Child tracker for UX-state consistency |
| MOBILE-009 | `docs/Implementation_plans/mobile/active/MOBILE-009_MOBILE_APP_REDESIGN_PARITY_TRACKER.md` | Redesign parity and screen audits | In Progress | Critical | Child tracker for design parity sequence |

---

## 3.1) Immediate Program Priority (Override)

1. Highest priority now: mobile screen implementation/parity for web AutoDoc route: `http://localhost:5173/autodoc`.
2. Execution anchor: MOBILE-009 redesign parity tracker (current active screen focus).
3. Until this screen reaches Review/Done in child tracking, no lower-priority item should preempt active execution except production blockers.

## 3.2) AutoDoc Full-Flow Audit Directive (2026-06-17)

1. Scope: audit full AutoDoc flow parity across BP-01 through BP-08 (dashboard, create, job card, damage, capture, photos, estimate, submit).
2. Rule: no business logic or functionality changes are allowed under this priority task.
3. Rule: no duplicate implementation work; reuse existing mobile flow and audit/refine UI only where parity gaps are confirmed.
4. Device-specific parity standard: mobile UI does not need to be a web clone; layout and interaction can differ by form factor while preserving flow intent, information hierarchy, and state semantics.
5. Child plan synchronization: all audit findings and status transitions must be recorded in MOBILE-009 in the same session.

## 3.3) AutoDoc Stage Transition Governance Addendum (2026-06-18)

1. This addendum explicitly approves targeted AutoDoc workflow logic updates required to protect stage correctness and prevent stage drift from navigation-only actions.
2. Navigation safety rule: moving between Job Card, Damage, Estimate, and Submit screens (including back/chevron navigation) must not by itself change dashboard active stage.
3. Estimate readiness rule: dashboard stage can enter Estimate only when all selected panels have pre-repair photos.
4. Pre-Submit readiness rule: dashboard stage must move from Estimate to Pre-Submit when all selected panels also have complete estimate rows.
5. Estimate completeness definition: each selected panel requires action + defect, and part number when action is replace.
6. Estimate screen gate rule: "Next - Submit stage" must remain visually disabled and non-clickable until all selected panels are estimate-complete.
7. Cross-platform parity rule: stage derivation and readiness logic must remain aligned between mobile and web AutoDoc dashboards.
8. Post pre-submit guidance rule: after "Compose & Send" completes (Submitted), the pre-submit CTA must switch to guided damage-upload actions in sequence: `Estimate- Under Repair` -> `Estimate- Post Repair` -> disabled `Pre Repair - Submitted`.
9. Final submit unlock rule: "Generate Post-Repair PPT" becomes actionable only after both under-repair and post-repair photos exist panel-wise for all selected panels.
10. Final completion rule: "Submit claim · set Completed" is enabled only after Post-Repair PPT is generated/uploaded.

---

## 4) Program-Level Tracker

Use: Not Started | In Progress | Blocked | Review | Done

| Item ID | Program Workstream | Source Plan(s) | Status | Owner | Next Action |
|---|---|---|---|---|---|
| M10-001 | Establish canonical authority and cross-links | MOBILE-000, MOBILE-001, MOBILE-010 | Done | Mobile Team | Keep links current when new plans are added |
| M10-002 | AutoDoc mobile screen parity (full flow audit + stage governance hardening) | MOBILE-009 | In Progress | Mobile Team | Logic hardening shipped: navigation-safe stage behavior, Estimate -> Pre-Submit progression by complete estimate coverage, disabled Estimate "Next - Submit" gate until all selected panels are complete, and submit-stage guided CTA progression (`Under` -> `Post` -> submitted lock) before final PPT/claim enablement. BP-08 submit UI parity pass is active with this flow. Next: Expo Go validation + evidence capture for stage-flow correctness (Damage/Estimate/Pre-Submit/Final Submit) and BP-08 parity in one run. |
| M10-003 | Platform home hardening phase | MOBILE-007 | In Progress | Mobile Team | Execute pending P4 tasks and verify end-to-end |
| M10-004 | Processing-state UX rollout | MOBILE-008 | Not Started | Mobile Team | Start Sprint 1 critical items (M8-001/2/6/11) |
| M10-005 | GPS stamp parity closure | MOBILE-005 | In Progress | Mobile Team | Complete remaining phases and QA gates |
| M10-006 | Satellite hybrid provider rollout decision | MOBILE-006 | Pending | Product + Mobile | Confirm budget/quota and backend proxy readiness |

### 4.1) Current Session Kickoff (2026-06-17)

1. Active item: `M10-002` (AutoDoc full-flow parity audit + stage governance hardening).
2. Immediate execution step: run Expo Go validation for dashboard stage-line transitions across Damage -> Estimate -> Pre-Submit and confirm button gating behavior in Estimate.
3. Scope lock update: UI parity audit remains primary; AutoDoc stage-governance logic updates are now explicitly permitted under Section 3.3.
4. Closeout requirement: complete strict checklist in both files before marking the session handoff complete.

### 4.2) Step-by-Step Runtime State

1. Step 1: BP-01 dashboard audit kickoff in MOBILE-009 - In Progress.
2. Step 1 target outcome: complete BP-01 baseline gap log with fresh evidence (iOS, Android, stage-strip crop).
3. Step 2: BP-02 intake business-logic parity update - Completed in code, pending device validation evidence.
4. Step 3: BP-02/BP-04 live-test defect fixes - Completed in code (fetch sync fallback, Next persistence hardening, damage focus refresh).
5. Step 4: Stage navigation safety fix - Completed in code (back/navigation no longer demotes active stage).
6. Step 5: Estimate completeness gating + Pre-Submit stage promotion logic - Completed in code (mobile + web parity).
7. Step 6: BP-08 Submit screen reference UI parity refactor - Completed in code.
8. Step 7: Submit-stage progression implementation - Completed in code (`Compose & Send` replacement CTA flow: Under -> Post -> Submitted lock; final PPT gate now requires both under and post panel coverage).
9. Next step: Expo Go end-to-end evidence run for stage transitions, disabled/enabled submit-gate states, under/post panel upload guidance flow, and BP-08 visual parity proof, then sync evidence and final status into MOBILE-009.

---

## 5) Sync Rules For Child Trackers

1. Every child tracker update must be reflected here in the same work session.
2. Child trackers keep implementation detail; this file keeps cross-plan status and priorities.
3. Do not mark a program item Done unless the child tracker has matching evidence.
4. Append-only update behavior is recommended for activity logs.

### 5.1) Mandatory End-of-Task Closeout Checklist (Strict)

Mark a task session complete only when all items below are true:

1. `MOBILE-010` updated: current active item status, blocker state, and next action refreshed.
2. `MOBILE-009` updated in same session with screen-level audit/evidence details.
3. Status sync check passed: program-level state in `MOBILE-010` matches child-tracker state in `MOBILE-009`.
4. Scope check passed: no business-logic/functionality change introduced unless explicitly approved.
5. Duplication check passed: no duplicate rework performed without a newly documented parity gap.
6. Device-specific parity note captured where mobile intentionally differs from web.
7. `Last Updated` fields refreshed in both files for the current task closeout.
8. Restart continuity set: next exact screen/task is written in both files.

If any checklist item is not satisfied, keep session state as In Progress.

---

## 6) Resume Protocol

When restarting in a new chat:
1. Open this file first.
2. Continue from M10-002 first (AutoDoc mobile screen parity for `/autodoc`) until it is Review/Done.
3. Complete the strict end-of-task closeout checklist (Section 5.1) before ending the session.
4. Update this file and the relevant child tracker together before ending the session.

Recommended restart prompt:

"Use MOBILE-010 as the only program-level authority. Continue the highest-priority non-Done item, sync the child tracker, and then update MOBILE-010 in the same session."

---

## 7) Definition of Program Completion

Program completion requires all to be true:
1. MOBILE-005 is Done.
2. MOBILE-007 is Done.
3. MOBILE-008 is Done.
4. MOBILE-009 is Done.
5. MOBILE-006 has an explicit outcome (Done or deferred with approved rationale).
6. MOBILE-001 success criteria are satisfied for production readiness.

---

Last Updated: 2026-06-18 (AutoDoc stage-governance updates retained; BP-08 Submit screen parity and guided pre-submit->under/post progression implemented; pending Expo Go evidence capture)
