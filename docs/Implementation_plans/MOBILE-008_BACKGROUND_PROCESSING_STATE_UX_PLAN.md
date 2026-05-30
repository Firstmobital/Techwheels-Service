# MOBILE-008: Background Processing State UX Plan

Last Updated: 2026-05-30  
Status: Pending  
Priority: High  
Owner: Mobile Team + Product + GitHub Copilot

---

## 1. Objective

Standardize user-visible processing states across the mobile app anywhere async/background work is happening, so users always know:

1. What is happening now.
2. Whether they should wait or take action.
3. When the task has completed or failed.

---

## 2. Problem Statement

Current mobile flows include multiple async operations (upload, sync, fetch, status update, export, email send, background queue processing). In several places, UI feedback is either missing, too subtle, or inconsistent.

This causes user confusion such as:

- Unclear whether app is still working.
- Repeated taps during in-flight requests.
- Mixed messaging between auto/background steps and manual actions.

---

## 3. Scope

### In Scope

- Job Card Create flow async chain visibility.
- Damage/Panel flows sync and refresh visibility.
- Import pipeline stage-wise progress visibility.
- Submit/Estimate long action clarity consistency.
- Dashboard background readiness recalculation indicator.
- Reports export action processing states.
- Session/logout async state feedback.
- Global offline sync visibility from queue stats.
- Shared reusable processing-state UI primitives.

### Out of Scope

- Backend business-logic changes.
- Database schema changes.
- Functional workflow redesign beyond UX state communication.

---

## 4. UX Standard (Contract)

For every async action, enforce this contract:

1. Start state: action label changes to explicit in-progress text.
2. In-progress state: spinner/progress indicator shown.
3. Interaction lock: prevent duplicate submission while action is in-flight.
4. Success state: explicit completion confirmation.
5. Failure state: clear error message + retry path.
6. Long chain tasks: show step/sub-step messages, not one generic loading label.

---

## 5. Phase Plan

## Phase 1: Critical Workflow Clarity

Target files:

- src/app/job-cards/create.tsx
- src/app/job-cards/[id]/jobcard.tsx
- src/app/(tabs)/import.tsx
- src/context/OfflineContext.tsx
- src/app/(tabs)/autodoc.tsx

Goals:

1. Add multi-step processing card in Create flow.
2. Add transition state for save -> status update -> navigation.
3. Add stage-wise import progress labels.
4. Surface pending/failed offline sync globally.
5. Add lightweight dashboard readiness-refresh indicator.

Acceptance:

- No silent async transitions in these screens.
- Users can identify current step in all critical chains.

## Phase 2: Secondary Workflow Consistency

Target files:

- src/app/job-cards/[id]/damage.tsx
- src/app/job-cards/[id]/panel-photos.tsx
- src/app/(tabs)/profile.tsx
- src/app/(tabs)/settings.tsx

Goals:

1. Strengthen panel sync state visibility.
2. Show list loading phases in panel photos.
3. Add logout processing state and failure feedback.

Acceptance:

- All secondary async actions use consistent wait-language and lock behavior.

## Phase 3: Reports Export Parity

Target files:

- src/app/(tabs)/reports.tsx
- src/components/reports/*Mobile.tsx

Goals:

1. Add reusable export-in-progress button state.
2. Prevent duplicate export/share action taps.
3. Ensure export action always communicates stage (prepare/share/fail).

Acceptance:

- Report exports are visibly in progress and fully retry-safe.

## Phase 4: Shared Componentization and Cleanup

Target files:

- src/components/common (new shared primitives)
- Call sites in all files above

Goals:

1. Introduce reusable AsyncActionButton.
2. Introduce ProcessingBanner and BlockingProcessModal.
3. Replace one-off ad-hoc loading labels with standard primitives.

Acceptance:

- At least 80 percent of processing-state UX uses shared components.
- Copy and behavior are consistent app-wide.

---

## 6. Activity Tracker

Use the status values exactly: Not Started | In Progress | Blocked | Done

| ID | Area | Activity | File(s) | Priority | Status | Owner | Planned Sprint | Notes |
|---|---|---|---|---|---|---|---|---|
| M8-001 | Create Flow | Add multi-step processing card (upload, gps, fetch) | src/app/job-cards/create.tsx | Critical | Not Started | Mobile | Sprint 1 | Replace generic button-only feedback |
| M8-002 | Create Flow | Add transition state for status update before route push | src/app/job-cards/create.tsx | Critical | Not Started | Mobile | Sprint 1 | Remove silent post-alert transition |
| M8-003 | Job Card | Add save-phase + transition-phase labels | src/app/job-cards/[id]/jobcard.tsx | High | Not Started | Mobile | Sprint 1 | Save and workflow transition separated |
| M8-004 | Damage | Upgrade panel sync from subtle text to explicit processing banner | src/app/job-cards/[id]/damage.tsx | High | Not Started | Mobile | Sprint 2 | Keep stage actions blocked during sync |
| M8-005 | Panel Photos | Add loading sub-phases (list, signed urls, refresh) | src/app/job-cards/[id]/panel-photos.tsx | High | Not Started | Mobile | Sprint 2 | Improve perceived responsiveness |
| M8-006 | Import | Add stage-wise long-operation progress states | src/app/(tabs)/import.tsx | Critical | Not Started | Mobile | Sprint 1 | Parsing/validating/chunk upload/finalizing |
| M8-007 | Dashboard | Add readiness recompute indicator | src/app/(tabs)/autodoc.tsx | Medium | Not Started | Mobile | Sprint 1 | Show background recalculation to user |
| M8-008 | Reports Shell | Add export processing state in reports header export | src/app/(tabs)/reports.tsx | Medium | Not Started | Mobile | Sprint 3 | Disable repeated export taps |
| M8-009 | Reports Components | Standardize export loading behavior across report widgets | src/components/reports/*Mobile.tsx | Medium | Not Started | Mobile | Sprint 3 | Shared helper preferred |
| M8-010 | Session | Add visible logout processing state and error handling | src/app/(tabs)/profile.tsx, src/app/(tabs)/settings.tsx | Medium | Not Started | Mobile | Sprint 2 | No silent sign-out async call |
| M8-011 | Offline Sync | Expose pending/failed sync state in app chrome | src/context/OfflineContext.tsx + entry screens | Critical | Not Started | Mobile | Sprint 1 | Reuse existing context stats |
| M8-012 | Shared UX | Build reusable AsyncActionButton/ProcessingBanner/BlockingProcessModal | src/components/common/* | Critical | Not Started | Mobile | Sprint 4 | Apply across all phases |
| M8-013 | QA | Create processing-state test matrix per workflow | docs/Implementation_plans/MOBILE-008_BACKGROUND_PROCESSING_STATE_UX_PLAN.md | High | Not Started | QA + Mobile | Sprint 4 | Include slow network and retry cases |
| M8-014 | Release | Publish OTA after each completed phase with clear notes | mobile OTA pipeline | High | Not Started | Mobile | Every Sprint | One OTA per phase minimum |

---

## 7. Definition of Done

This plan is complete when all conditions are true:

1. All critical and high priority tracker items are marked Done.
2. No major async flow runs without visible processing state.
3. Duplicate taps are prevented for all long-running actions.
4. QA matrix for processing-state behavior passes.
5. OTA notes include UX-state changes for each phase.

---

## 8. Execution Log (To Fill During Implementation)

| Date | Phase | Activities Completed | OTA/Build Ref | Owner | Notes |
|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD |

---

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Too many custom loading patterns continue to accumulate | Inconsistent UX | Enforce shared components in Phase 4 |
| Long import/export tasks still feel stalled | User retries, duplicate actions | Add phase text + disable controls + optional progress counters |
| Offline sync visibility adds noise | UI clutter | Use compact chip/banner with tap-for-details |
| Scope creep into business-logic changes | Delayed rollout | Keep this plan UX-state only, no behavior changes |

---

## 10. Next Action When Execution Starts

1. Start with M8-001, M8-002, M8-006, M8-011 in Sprint 1.
2. Ship OTA with phase summary after Sprint 1 closure.
3. Update tracker status immediately after each merged task.
