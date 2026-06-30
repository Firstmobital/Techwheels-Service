# Task Contract: Implementation Plan Update

Classification: state = implementation (the resulting artifact), scope = shared, intent = reference (catalog/task_library/generic).

This is a reusable repository task contract, not a prompt. It describes the repeatable structure of updating an existing implementation plan so any execution of that task follows the same authorities, steps, and routing. It governs the task of updating a plan; the update's own document shape is `docs/shared/reference/catalog/UPDATE_TEMPLATE.md`, and promotion entries use `docs/shared/reference/catalog/IMPLEMENTATION_PROMOTION_SUMMARY_TEMPLATE.md`.

## Purpose

Update an existing active implementation plan after a fix, verification, rollout, or rollback — covering status, evidence, changelog, and next actions in one pass — without creating a duplicate plan or losing unfinished work during compaction.

## Inputs

1. The target active plan path.
2. What changed (fix, verification result, rollout/rollback outcome) since the last update.
3. Whether any item is now both `Done` and `Verified` (triggers promotion-before-removal).

## Authorities

1. `docs/STRUCTURE_GUIDE.md` Section 30 (Mandatory Plan Update Protocol) — the required pre-read gate, update-scope gate, cross-file consistency gate, and verification gate for any plan update.
2. `docs/STRUCTURE_GUIDE.md` Section 28 (Implementation Plan Retention Policy) — retention limits and the promotion-before-removal contract.
3. `docs/shared/reference/catalog/UPDATE_TEMPLATE.md` — document shape for the change-set summary, if a standalone update note is produced.
4. `docs/shared/reference/catalog/IMPLEMENTATION_PROMOTION_SUMMARY_TEMPLATE.md` — required format for every promotion summary.
5. `docs/shared/reference/SYNC_PROTOCOL.md` ("Implementation Progress" and "Completed Feature" rows of the Classification table) — routing for plan updates versus verified-and-promoted completions.

## Execution

1. Read the target active plan fully enough to identify current phase/status/evidence sections, plus directly linked sibling docs, platform tracker/index, and any validation outputs used as decision evidence (`STRUCTURE_GUIDE.md` Section 30, pre-read gate).
2. Update status/phase rows, evidence summary, changelog/metrics entries, and next actions impacted by the change (Section 30, update-scope gate) — do not update one line only.
3. Enforce retention limits after the update (latest two automated rows/snapshots only); preserve every pending/in-progress/blocked/unverified row.
4. For any item becoming `Done` and `Verified`, write a promotion summary using `IMPLEMENTATION_PROMOTION_SUMMARY_TEMPLATE.md` into the category reference doc before compacting that item's narrative out of the active plan (Section 28's promotion-before-removal contract).
5. Update the platform tracker and index in the same change if plan status or path changed (Section 30, cross-file consistency gate).
6. Run `npm run docs:validate:plans`; if it cannot be run, document that limitation in the update note (Section 30, verification gate).
7. Run the Repository Lifecycle Protocol Self-Heal Check (`docs/shared/reference/SYNC_PROTOCOL.md`) before finishing.

## Expected Outputs

1. Updated active plan file (status, evidence, changelog, next actions).
2. Promotion summary in the category reference doc, for any newly Done-and-Verified item.
3. Updated platform tracker/index, if status or path changed.

## Output Classification

Classify each output using the categories in `docs/shared/reference/SYNC_PROTOCOL.md` ("Classification" table). Typical categories: Implementation Progress (status/evidence update), Completed Feature (promoted item), Evidence.

## Output Routing

Route every output using the table in `docs/shared/reference/SYNC_PROTOCOL.md` and its Index Update Rule. This contract does not restate those routes or the promotion-before-removal mechanics already defined in `STRUCTURE_GUIDE.md` Section 28/30.

## Validation

1. `npm run docs:validate` (`docs:validate:plans`) after the update.
2. Confirm no contradiction between the updated active plan and its linked evidence docs (Section 30, cross-file consistency gate).

## Completion Criteria

1. Pre-read gate, update-scope gate, cross-file consistency gate, and verification gate (`STRUCTURE_GUIDE.md` Section 30) are all satisfied.
2. Any newly Done-and-Verified item has a linked promotion summary before its narrative is compacted.
3. Plan retention validation passes, or its result/limitation is explicitly recorded.
4. Repository Lifecycle Report (and AI Output Intake Report) filed.
