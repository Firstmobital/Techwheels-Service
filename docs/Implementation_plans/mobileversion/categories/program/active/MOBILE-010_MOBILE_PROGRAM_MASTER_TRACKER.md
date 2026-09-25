# MOBILE-010: Mobile Program Master Tracker

Created: 2026-06-17
Owner: Techwheels Product + Mobile Engineering + GitHub Copilot
Status: ACTIVE (Canonical Authority)
Last Updated: 2026-09-25

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
| MOBILE-000 | `docs/Implementation_plans/mobileversion/categories/program/active/MOBILE-000_OVERVIEW.md` | Legacy overview and orientation | Active (context) | Medium | Keep as entry overview, not execution authority |
| MOBILE-001 | `docs/Implementation_plans/mobileversion/categories/program/active/MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md` | Core implementation strategy | Active | High | Strategy baseline for all mobile workstreams |
| MOBILE-005 | `docs/Implementation_plans/mobileversion/categories/autodoc/active/MOBILE-005_AUTODOC_GPS_STAMP_PARITY_PLAN.md` | AutoDoc GPS stamp parity | In Progress | High | Aligns with MOBILE-001 parity and release gates |
| MOBILE-006 | `docs/Implementation_plans/mobileversion/categories/autodoc/active/MOBILE-006_GOOGLE_SATELLITE_HYBRID_STAMP_PLAN.md` | Satellite stamp provider plan | Pending | Medium | Depends on cost/quota guardrails and backend proxy |
| MOBILE-007 | `docs/Implementation_plans/mobileversion/categories/core-shell/active/MOBILE-007_PLATFORM_HOME_SUPERAPP_TRACKER.md` | Platform home rollout | In Progress | High | Child tracker for home/shell execution |
| MOBILE-008 | `docs/Implementation_plans/mobileversion/categories/operations/active/MOBILE-008_BACKGROUND_PROCESSING_STATE_UX_PLAN.md` | Async/background UX states | Pending | High | Child tracker for UX-state consistency |
| MOBILE-009 | `docs/Implementation_plans/mobileversion/categories/redesign/active/MOBILE-009_MOBILE_APP_REDESIGN_PARITY_TRACKER.md` | Redesign parity tracker (non-Body & Paint) | Active | High | Foundation + Auth + Shell + Reports + Operations redesign tracking |
| MOBILE-BP-RD | `docs/Implementation_plans/mobileversion/categories/redesign/active/redesign_bodypaint_module.md` | Body & Paint redesign (consolidated) | In Progress | Critical | Single source of truth for BP-01..BP-08 redesign execution |
| MOBILE-011 | `docs/Implementation_plans/mobileversion/categories/auth/active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md` | One Expo binary: customer + staff login shells + customer RPCs | In Progress | High | Phase 0 done. Phase 1–3 implemented in `mobile/` + web cutover. Apply `20260916120000_mobile_011_customer_sessions.sql` before the next prod APK/iOS. Do not ship `bodyshop/`. |
| MOBILE-012 | `docs/Implementation_plans/mobileversion/categories/release/active/MOBILE-012_PLAY_APP_STORE_PUBLISH_PLAN.md` | Play Store + App Store publish for `com.techwheels.service` (ASC `6774519420`) | In Progress | High | AAB 11 on Play + IPA 13 TestFlight. Next: finish Play App content (Advertising ID No + photo/video declaration), then send for review. App Store listing + screenshots. |
| MOBILE-013 | `docs/Implementation_plans/mobileversion/categories/customer/active/MOBILE-013_CUSTOMER_DOCUMENT_DRIVE_UPLOAD_PLAN.md` | Customer claim documents: autodoc staging, bodyshop document upsert, universal-drive-upload | In Progress | High | Code written 2026-09-25. Deploy `customer-portal-upload` and `universal-drive-upload` before customer Drive sync works. |

---

## 3.1) Immediate Program Priority (Override)

1. Highest priority now: Body & Paint mobile redesign parity execution.
2. Execution anchor: `docs/Implementation_plans/mobileversion/categories/redesign/active/redesign_bodypaint_module.md`.
3. Until this item reaches Review/Done in child tracking, no lower-priority item should preempt active execution except production blockers.
4. MOBILE-011 Phase 0: remove `service_role` from the `bodyshop/` client and tracked `.env` only. Do **not** rotate the dashboard key. Do not start customer Expo screens until Phase 1 RPCs exist.

---

## 4) Program-Level Tracker

Use: Not Started | In Progress | Blocked | Review | Done

| Item ID | Program Workstream | Source Plan(s) | Status | Owner | Next Action |
|---|---|---|---|---|---|
| M10-001 | Establish canonical authority and cross-links | MOBILE-000, MOBILE-001, MOBILE-010 | Done | Mobile Team | Keep links current when new plans are added |
| M10-002 | Body & Paint redesign consolidation and execution | MOBILE-BP-RD | In Progress | Mobile Team | Continue BP-01..BP-08 visual parity validation and evidence capture in consolidated plan file. |
| M10-003 | Platform home hardening phase | MOBILE-007 | In Progress | Mobile Team | Execute pending P4 tasks and verify end-to-end |
| M10-004 | Processing-state UX rollout | MOBILE-008 | Not Started | Mobile Team | Start Sprint 1 critical items (M8-001/2/6/11) |
| M10-005 | GPS stamp parity closure | MOBILE-005 | In Progress | Mobile Team | Complete remaining phases and QA gates |
| M10-006 | Satellite hybrid provider rollout decision | MOBILE-006 | Pending | Product + Mobile | Confirm budget/quota and backend proxy readiness |
| M10-007 | Single-app customer + staff identity (RPCs, Expo shells) | MOBILE-011 | Not Started | Mobile + Platform | Phase 0: delete client `service_role` (no dashboard rotation); do not copy `bodyshop/` into Expo |
| M10-008 | Play + App Store first public listing | MOBILE-012 | In Progress | Mobile + Platform | App Store: finish ASC 6774519420 listing + Add for Review on IPA 13 (no new IPA). Play: still AAB 12+ after picker policy. |
| M10-009 | Customer claim document Drive offload | MOBILE-013 | In Progress | Mobile + Platform | App and broker coded. Next: deploy the two edge functions, then upload one claim document as a customer and confirm `drive_url`. |

### 4.1) Current Session Kickoff (2026-06-18)

1. Active item: `M10-002`.
2. Immediate execution step: continue Body & Paint redesign validation in the consolidated plan file.
3. Sync rule: update this master file only with program-level summary, not screen-level redesign directives.

---

## 5) Sync Rules For Child Trackers

1. Every child tracker update must be reflected here in the same work session.
2. Child trackers keep implementation detail; this file keeps cross-plan status and priorities.
3. Do not mark a program item Done unless the child tracker has matching evidence.
4. Append-only update behavior is recommended for activity logs.

### 5.1) Mandatory End-of-Task Closeout Checklist (Strict)

Mark a task session complete only when all items below are true:

1. `MOBILE-010` updated: current active item status, blocker state, and next action refreshed.
2. `redesign_bodypaint_module.md` updated in same session with screen-level audit/evidence details for Body & Paint changes.
3. Status sync check passed: program-level state in `MOBILE-010` matches child-tracker state.
4. Scope check passed: no business-logic/functionality change introduced unless explicitly approved.
5. Duplication check passed: no duplicate rework performed without a newly documented parity gap.
6. Device-specific parity note captured where mobile intentionally differs from web.
7. `Last Updated` fields refreshed for files touched in the session.
8. Restart continuity set: next exact screen/task is written in both master and child tracker.

If any checklist item is not satisfied, keep session state as In Progress.

---

## 6) Resume Protocol

When restarting in a new chat:
1. Open this file first.
2. Continue from highest-priority non-Done item (`M10-002` currently).
3. Use child tracker by workstream:
   - Body & Paint redesign: `docs/Implementation_plans/mobileversion/categories/redesign/active/redesign_bodypaint_module.md`
   - Non-Body & Paint redesign: `docs/Implementation_plans/mobileversion/categories/redesign/active/MOBILE-009_MOBILE_APP_REDESIGN_PARITY_TRACKER.md`
4. Update this file and relevant child tracker together before ending the session.

Recommended restart prompt:

"Use MOBILE-010 as the only program-level authority. Continue the highest-priority non-Done item, sync the child tracker, and then update MOBILE-010 in the same session."

---

## 7) Definition of Program Completion

Program completion requires all to be true:
1. MOBILE-005 is Done.
2. MOBILE-007 is Done.
3. MOBILE-008 is Done.
4. MOBILE-BP-RD workstream is Done.
5. MOBILE-006 has an explicit outcome (Done or deferred with approved rationale).
6. MOBILE-001 success criteria are satisfied for production readiness.

