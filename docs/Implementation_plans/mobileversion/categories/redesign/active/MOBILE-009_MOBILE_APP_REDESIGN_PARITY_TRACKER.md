# MOBILE-009: Mobile App Redesign Parity Tracker (Non-Body & Paint)

Created: 2026-06-17
Owner: Techwheels Product + Mobile Engineering + GitHub Copilot
Status: ACTIVE (Non-Body & Paint redesign authority)
Last Updated: 2026-06-18

---

## 1) Purpose

This tracker remains active and is not deleted.

Scope of this file:
1. Track redesign parity for shared foundation, AUTH, shell/tabs, reports, and operations screens.
2. Preserve historical redesign context that is unrelated to Body & Paint.
3. Keep restart-safe status for non-Body & Paint redesign execution.

Out of scope for this file:
1. Body & Paint module redesign planning, audit logs, and BP-01..BP-08 execution details.
2. AutoDoc redesign design directives.

---

## 2) Authority Split (Locked)

1. This file is the authority for non-Body & Paint redesign work.
2. Body & Paint redesign authority is consolidated into:
   - `docs/Implementation_plans/mobileversion/categories/redesign/active/redesign_bodypaint_module.md`
3. If any Body & Paint redesign directive appears here, ignore it and use the consolidated file above.

---

## 3) Guardrails (Non-Body & Paint)

1. UI parity updates remain visual/interaction focused unless explicit approval is given for logic changes.
2. Preserve existing APIs, routes, and data contracts for redesigned screens.
3. Keep iconography tokenized via shared icon wrapper and avoid emoji icon usage in redesigned paths.
4. Use DB-backed values for all dynamic UI counters and badges.

---

## 4) Activity Tracker

Legend: `NS` = Not Started, `IP` = In Progress, `BL` = Blocked, `RV` = Review, `DN` = Done

| ID | Module | Reference Screen ID | Mobile Target Route/File | Status | Owner | Notes |
|---|---|---|---|---|---|---|
| FOUND-01 | Foundation | global tokens | `mobile/tailwind.config.js` | DN | Mobile | Colors, radius, fonts aligned to redesign token layer. |
| FOUND-02 | Foundation | global typography | `mobile/src/app/_layout.tsx` | DN | Mobile | Font stack load verified for current redesign baseline. |
| FOUND-03 | Foundation | global icon layer | `mobile/src/components/ui/Icon.tsx` | DN | Mobile | Shared icon wrapper available for redesign screens. |
| AUTH-01 | Auth | login | `mobile/src/app/(auth)/login.tsx` | DN | Mobile | Latest pass accepted for redesign parity. |
| AUTH-02 | Auth | signup | `mobile/src/app/(auth)/signup.tsx` | DN | Mobile | Latest pass accepted for redesign parity. |
| AUTH-03 | Auth | reset | `mobile/src/app/(auth)/password-reset.tsx` | DN | Mobile | Latest pass accepted for redesign parity. |
| SHELL-01 | Shell | home | `mobile/src/app/(tabs)/home.tsx` | DN | Mobile | Home parity accepted; counters are DB-backed. |
| SHELL-02 | Shell | newScreen | `mobile/src/app/(tabs)/new.tsx` | NS | Mobile | Pending redesign pass. |
| SHELL-03 | Shell | search | `mobile/src/app/(tabs)/search.tsx` | NS | Mobile | Pending redesign pass. |
| SHELL-04 | Shell | alerts | `mobile/src/app/(tabs)/alerts.tsx` | NS | Mobile | Pending redesign pass. |
| SHELL-05 | Shell | profile | `mobile/src/app/(tabs)/profile.tsx` | NS | Mobile | Pending redesign pass. |
| SHELL-06 | Shell | settings | `mobile/src/app/(tabs)/settings.tsx` | NS | Mobile | Pending redesign pass. |
| REP-01 | Reports | reports | `mobile/src/app/(tabs)/reports.tsx` | NS | Mobile | Pending redesign pass. |
| REP-02 | Reports | report_* | `mobile/src/app/reports/[id].tsx` | NS | Mobile | Route parity validation needed. |
| OPS-01 | Operations | import | `mobile/src/app/(tabs)/import.tsx` | NS | Mobile | Pending redesign pass. |
| OPS-02 | Operations | admin | `mobile/src/app/(tabs)/admin.tsx` | NS | Mobile | Pending redesign pass. |

---

## 5) Historical Context (Retained)

1. AUTH and Home redesign audits remain accepted in this tracker.
2. Prior Body & Paint notes were intentionally migrated out to avoid drift and conflicting directives.
3. Program-level master status is maintained in:
   - `docs/Implementation_plans/mobileversion/categories/program/active/MOBILE-010_MOBILE_PROGRAM_MASTER_TRACKER.md`

---

## 6) Resume Protocol (Non-Body & Paint)

When restarting non-Body & Paint redesign work:
1. Open this file and continue the highest-priority `NS`/`IP` row from Section 4.
2. Keep scope to non-Body & Paint screens only.
3. Synchronize program-level status updates in `MOBILE-010` within the same session.

