# MOBILE-007: Platform Home (Super-App) Implementation Tracker

Created: 2026-05-29  
Owner: Techwheels Product + Mobile Dev Team + GitHub Copilot  
Priority: HIGH  
Status: IN PROGRESS
Program Reporting: Reports upward to `docs/Implementation_plans/mobileversion/categories/program/active/MOBILE-010_MOBILE_PROGRAM_MASTER_TRACKER.md` (master authority)

---

## Purpose (Session Recovery Safe)

This file is the single source of truth for the mobile Platform Home rollout.
If a chat/session fails, start a new chat, attach this file, and continue from the first unchecked item in the Activity Tracker.

Drift prevention rules:
1. Never mark a task complete without file-level verification.
2. Never reorder completed tasks.
3. Never edit old log rows except to correct factual mistakes.
4. Always append new log entries at the bottom.
5. If scope changes, add a new Decision Log entry first.

---

## Scope

In scope:
1. Post-login landing to Platform Home.
2. Super-app style navigation shell (Home, Search, New, Alerts, Profile).
3. Home launcher with existing live modules plus planned modules.
4. Keep all current module screens reachable (Import, Reports, AutoDoc, Admin, Settings).
5. Add activity tracker and continuation protocol for future sessions.

Out of scope (for this plan phase):
1. New backend schema changes.
2. New module business logic for planned modules (Body Shop, Mechanical, etc.).
3. Replacing current feature-screen implementations.

---

## Authoritative Constraints

1. Mobile app must open Login first when unauthenticated.
2. After successful login, app must route to Platform Home.
3. Existing modules must remain reachable.
4. Planned modules must appear as roadmap tiles without dead-end navigation confusion.
5. No destructive database commands are part of this plan.

---

## Current State Snapshot (as of 2026-05-29)

Completed in this session:
1. Added new Platform Home screen and launcher architecture.
2. Added platform tab model (Home/Search/New/Alerts/Profile).
3. Hid feature routes from tab bar while keeping them routable.
4. Updated auth/index/login redirects to land on Home.
5. Added utility tabs for search, quick actions, alerts, and profile.
6. Kept existing module screens intact and reachable.
7. Type checks/diagnostics for changed files passed (no errors on touched files).

Implemented files:
1. mobile/src/app/(tabs)/_layout.tsx
2. mobile/src/app/(tabs)/home.tsx
3. mobile/src/app/(tabs)/search.tsx
4. mobile/src/app/(tabs)/new.tsx
5. mobile/src/app/(tabs)/alerts.tsx
6. mobile/src/app/(tabs)/profile.tsx
7. mobile/src/app/index.tsx
8. mobile/src/app/(auth)/_layout.tsx
9. mobile/src/app/(auth)/login.tsx

---

## Phase Plan

### Phase 1: Navigation Foundation (Done)
- [x] P1.1 Route authenticated users to Platform Home.
- [x] P1.2 Introduce platform tabs (Home/Search/New/Alerts/Profile).
- [x] P1.3 Keep feature screens reachable but hidden from primary tab shell.

### Phase 2: Platform Home Launcher (Done)
- [x] P2.1 Add branded header, greeting, search entry, and summary strip.
- [x] P2.2 Add launcher grid with live and planned modules.
- [x] P2.3 Add cross-module recent activity feed.

### Phase 3: Utility Platform Tabs (Done)
- [x] P3.1 Search tab for fast access to all current modules.
- [x] P3.2 New tab for creation and fast-start actions.
- [x] P3.3 Alerts tab for cross-module feed.
- [x] P3.4 Profile tab for account hub and logout.

### Phase 4: Hardening and Productization (Pending)
- [ ] P4.1 Replace placeholder counts with live data from existing APIs.
- [ ] P4.2 Role-based visibility for launcher tiles and profile actions.
- [ ] P4.3 Deep-link shortcuts into high-frequency module actions.
- [ ] P4.4 Add end-to-end QA checklist for login -> home -> module paths.
- [ ] P4.5 Update docs/index trackers for formal plan registration (optional but recommended).

---

## Activity Tracker (Append-Only)

Legend:
- DONE = Completed and verified
- WIP = In progress
- TODO = Not started
- BLOCKED = Waiting external input

| Seq | Date (IST) | Status | Task ID | Summary | Files | Verification | Next Action |
|---|---|---|---|---|---|---|---|
| 1 | 2026-05-29 | DONE | P1.1 | Redirect authenticated users to Platform Home | mobile/src/app/index.tsx, mobile/src/app/(auth)/_layout.tsx, mobile/src/app/(auth)/login.tsx | Redirect paths updated to /(tabs)/home | Start tab shell redesign |
| 2 | 2026-05-29 | DONE | P1.2 | Implement platform tab shell with center New CTA | mobile/src/app/(tabs)/_layout.tsx | Diagnostics clean on touched file | Add home launcher screen |
| 3 | 2026-05-29 | DONE | P1.3 | Hide feature routes from main tab bar but keep routable | mobile/src/app/(tabs)/_layout.tsx | Hidden routes use href: null | Build home module grid |
| 4 | 2026-05-29 | DONE | P2.1 | Create platform-style home header, search, and stats strip | mobile/src/app/(tabs)/home.tsx | Diagnostics clean | Add module launcher tiles |
| 5 | 2026-05-29 | DONE | P2.2 | Add live/soon module launcher tiles including existing modules | mobile/src/app/(tabs)/home.tsx | Existing modules linked and reachable | Add recent activity section |
| 6 | 2026-05-29 | DONE | P2.3 | Add recent activity feed on home | mobile/src/app/(tabs)/home.tsx | Feed renders with cross-module entries | Add utility tabs |
| 7 | 2026-05-29 | DONE | P3.1 | Add Search tab for module discovery | mobile/src/app/(tabs)/search.tsx | Diagnostics clean | Add New action tab |
| 8 | 2026-05-29 | DONE | P3.2 | Add New tab with quick actions | mobile/src/app/(tabs)/new.tsx | Diagnostics clean | Add Alerts tab |
| 9 | 2026-05-29 | DONE | P3.3 | Add Alerts feed tab | mobile/src/app/(tabs)/alerts.tsx | Diagnostics clean | Add Profile tab |
| 10 | 2026-05-29 | DONE | P3.4 | Add Profile hub with settings/admin entry and logout | mobile/src/app/(tabs)/profile.tsx | Diagnostics clean | Move to hardening phase |
| 11 | 2026-05-29 | TODO | P4.1 | Wire live dashboard counts and activity | TBD | Pending | Identify existing APIs for metrics |
| 12 | 2026-05-29 | TODO | P4.2 | Apply role-based tile visibility | TBD | Pending | Map role matrix to modules |
| 13 | 2026-05-29 | TODO | P4.3 | Add deep-link shortcuts to key flows | TBD | Pending | Prioritize top 5 shortcuts |
| 14 | 2026-05-29 | TODO | P4.4 | Add QA checklist for platform navigation | docs/Implementation_plans/* | Pending | Draft checklist and test cases |

---

## Decision Log

| Date (IST) | Decision | Reason |
|---|---|---|
| 2026-05-29 | Home is a platform launcher, not a feature page | Supports super-app scaling and avoids dead ends |
| 2026-05-29 | Keep existing modules as hidden routes in tabs | Preserve existing functionality while upgrading UX |
| 2026-05-29 | Redirect all authenticated entry points to /(tabs)/home | Enforce consistent post-login landing |

---

## Resume Protocol (Use in New Chat)

1. Attach this file first.
2. Ask Copilot to read this file and continue from the first TODO row in Activity Tracker.
3. Instruct Copilot to append new rows only (no rewrite of previous rows).
4. After each work burst, update:
   - Phase checklist
   - Activity Tracker row
   - Decision Log (if scope/logic changes)

Recommended restart prompt:

"Continue MOBILE-007 using this tracker file as the only authority. Start from the first TODO in Activity Tracker, do not drift scope, append-only updates, and verify each completed item with file-level checks."

---

## Completion Criteria

This plan is complete when all are true:
1. All Phase 4 tasks are marked done.
2. Login -> Home -> module navigation is verified end-to-end.
3. Role-based visibility behavior is verified.
4. Tracker is updated with final verification evidence.

---

Last Updated: 2026-05-29 by GitHub Copilot
