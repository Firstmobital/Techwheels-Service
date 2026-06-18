# Centralized Implementation Tracker

Last Updated: 2026-06-18
Status: ACTIVE AUTHORITY
Purpose: Root-level dashboard for both mobileversion and webversion

Legend:
- NS = Not Started
- IP = In Progress
- BL = Blocked
- RV = Review
- DN = Done (ready to archive)

---

## Workstream Pointers

1. Mobile tracker:
- `docs/Implementation_plans/mobileversion/IMPLEMENTATION_TRACKER.md`

2. Web tracker:
- `docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md`

3. Completion archive:
- `docs/Implementation_plans/completed/INDEX.md`

---

## Master Status Table

| Workstream | Tracker File | Current Health | Last Sync |
|---|---|---|---|
| Mobile Version | docs/Implementation_plans/mobileversion/IMPLEMENTATION_TRACKER.md | ACTIVE | 2026-06-18 |
| Web Version | docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md | ACTIVE | 2026-06-18 |

---

## Governance Rules

1. Every new plan must be added to exactly one platform tracker.
2. Root tracker is a rollup only; detailed status stays in platform trackers.
3. A plan can move to completed only after implementation + testing + sign-off.
4. Archive path must preserve platform/category/state structure.
5. Any move must update links in the corresponding platform index.

---

## Current Transition State

1. New structure is live:
- `mobileversion`
- `webversion`
- mirrored `completed` roots

2. Legacy category roots are decommissioned after successful migration.
3. New files must not be added at root `docs/Implementation_plans/` except root authority docs.
