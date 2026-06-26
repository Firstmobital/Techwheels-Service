# Implementation Plans Index

Last Updated: 2026-06-18
Status: ACTIVE AUTHORITY

---

## Start Here

1. Structure authority:
- `docs/STRUCTURE_GUIDE.md`

Compatibility pointer (legacy links only):
- `docs/Implementation_plans/STRUCTURE_AND_WORKFLOW.md`

2. Root tracker:
- `docs/Implementation_plans/IMPLEMENTATION_TRACKER.md`

3. Platform indexes:
- `docs/Implementation_plans/mobileversion/INDEX.md`
- `docs/Implementation_plans/webversion/INDEX.md`

4. Completed index:
- `docs/Implementation_plans/completed/INDEX.md`

---

## Canonical Live Workstreams

Only two live roots are allowed for all new plans:
1. `docs/Implementation_plans/mobileversion/`
2. `docs/Implementation_plans/webversion/`

Both must use:
- `categories/<category>/active/`
- `categories/<category>/evidence/`
- `categories/<category>/inactive/`

---

## Canonical Completed Workstreams

Completed plans must be archived under:
1. `docs/Implementation_plans/completed/mobileversion/`
2. `docs/Implementation_plans/completed/webversion/`

Archive must mirror the same category and state path.

---

## Placement Rules (Quick)

1. First classify platform: mobileversion or webversion.
2. Then classify category.
3. Then classify state: active, evidence, or inactive.
4. Update platform index and platform tracker in the same change.
5. Never create new plans at root `docs/Implementation_plans/`.

---

## Transition Note

Legacy category roots have been fully migrated into platform-first structure.

Governance rule from now on:
1. New and updated files go only to `mobileversion/` or `webversion/` structure.
2. Do not recreate legacy category roots at `docs/Implementation_plans/`.
