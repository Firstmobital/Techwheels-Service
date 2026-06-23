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

## Cross-Platform Parity Protocol (Web <-> Mobile)

For any web change that touches business logic, parity review with mobile is
mandatory before merge.

### Parity-Sensitive Changes

- Query/aggregation logic changes in reports and analytics
- New or changed calculations/formulas
- Filter/date/range behavior changes
- New report IDs/components/routes, or removed/deprecated ones
- Empty/loading/error UX that changes user interpretation of data
- CSV/export schema changes

### Required Workflow (In Addition to Docs Sync)

1. Detect parity impact during implementation.
2. If impact exists, update mobile implementation in the same PR whenever possible.
3. If same-PR update is not possible, create a follow-up task with owner + due date.
4. Add `Web-Mobile Parity` section in PR notes with status and affected files.
5. Run mobile validation (`npx --prefix mobile tsc --noEmit -p mobile/tsconfig.json`) for impacted changes.
6. Do not mark task complete until parity status is explicit.

### Merge Guard

Business-logic changes without explicit parity declaration are considered incomplete
and should not be merged.

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
