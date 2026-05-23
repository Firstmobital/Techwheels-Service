# Documentation Sync Protocol

Last Updated: 2026-05-23
Status: Mandatory

## Goal

Keep docs synchronized with real code and schema state after every change.

## Rules (Definition of Done)

A task is not complete until docs are updated in the same change set.

Mandatory files to review on each change:

1. `docs/Project_Handbook/CURRENT_STATE.md`
2. `docs/Project_Handbook/CHANGE_LOG.md`
3. `docs/Project_Handbook/README.md`
4. `docs/Project_Handbook/DOCS_IMPACT_MATRIX.md`
5. `docs/Project_Handbook/DB_CHANGE_LEDGER.md` (required for schema/RLS/function/view/index changes)
6. `docs/Project_Handbook/DB_CHANGE_PROTOCOL.md` (required reference for DB workflow)

## Update Triggers

Update docs when any of these happen:

- New feature/page/report added.
- Existing logic/conditions changed.
- Function input/output behavior changed.
- New env var or config dependency introduced.
- Schema/table/view/RLS policy changed.
- Role or permission behavior changed.
- Import formats/column mappings changed.
- Export format/flow changed.

## Required Update Workflow

1. Implement code/schema change.
2. Identify impacted areas using `DOCS_IMPACT_MATRIX.md`.
3. Update `CURRENT_STATE.md` snapshot fields.
4. Add one entry to `CHANGE_LOG.md`.
5. Update handbook sections in `README.md` if behavior/architecture changed.
6. For database changes, create/update ledger row in `DB_CHANGE_LEDGER.md` and follow `DB_CHANGE_PROTOCOL.md`.
7. Verify all changed paths are covered by docs updates before merge.

## Change Log Entry Template

Use this for each update:

- Date:
- Change summary:
- Impacted files:
- Business logic change:
- Function-level contract change:
- RBAC/RLS change:
- Data/schema change:
- Docs updated by:

## Weekly Maintenance

Once per week, review:

- Drift between `CURRENT_STATE.md` and codebase.
- Risk/gap section in handbook.
- Accuracy of impact matrix mappings.

## Enforcement Recommendation

For every PR/task, include a section named `Documentation Updates` containing:

- Updated files list.
- One-line reason for each file update.

If no docs were updated, include explicit justification: `No user-visible, business-logic, schema, or access-control impact`.
