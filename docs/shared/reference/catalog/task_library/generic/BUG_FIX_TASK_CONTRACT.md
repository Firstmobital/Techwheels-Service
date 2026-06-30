# Task Contract: Bug Fix

Classification: state = truth, scope = shared, intent = reference (catalog/task_library/generic).

This is a reusable repository task contract, not a prompt. It describes the repeatable structure of a bug-fix task so any execution of that task follows the same authorities, steps, and routing.

## Purpose

Diagnose and correct a defect in application code, configuration, or schema-adjacent logic, with the root cause confirmed against code/schema truth (not assumed), and with regression evidence captured.

## Inputs

1. Bug report or observed symptom, including reproduction steps if known.
2. Affected surface (web/mobile/shared) and module.
3. Whether the bug is already tracked in an active implementation plan.
4. Any related schema/RLS/RPC objects, if the bug is data-related.

## Authorities

1. `.instructions.md` Section 4 (No Assumption Protocol) — inspect the actual code/schema involved before proposing a fix; never guess root cause.
2. `.instructions.md` Section 2 (Task Decision Framework) — classify (Code/Database/Mixed) to select the correct authority chain.
3. `.instructions.md` Section 9 (Code Truth) — do not change unrelated application behavior as a side effect of the fix.
4. `docs/shared/reference/DATABASE_TRUTH.md` — if the defect involves schema, RPCs, or policies, verify against the dump files, never against assumption.
5. `docs/shared/reference/SYNC_PROTOCOL.md` ("Update Triggers", "Required Update Workflow") — for any doc/changelog impact of the fix.

## Execution

1. Classify the defect using `.instructions.md` Section 2.
2. Reproduce or confirm the defect against actual code/schema/data truth, not from memory or summary.
3. Identify root cause; if it cannot be confirmed against an authoritative source, state that explicitly rather than guessing (`.instructions.md` Section 4).
4. Implement the minimal correct fix in the affected surface.
5. Capture before/after evidence (failing case, then passing case) for the regression.
6. Apply the `SYNC_PROTOCOL.md` Required Update Workflow if the fix changes documented behavior, schema, or access control.
7. If the bug is already tracked in an active plan, update that plan (Implementation Plan Update task contract) instead of leaving the fix undocumented there.
8. Run the Repository Lifecycle Protocol Self-Heal Check (`SYNC_PROTOCOL.md`) before finishing.

## Expected Outputs

1. Corrected code/config/schema-adjacent change.
2. Regression evidence (before/after).
3. Plan update, if the bug was plan-tracked.
4. Doc updates per the impact matrix, if behavior/access-control changed.

## Output Classification

Classify each output using the categories in `docs/shared/reference/SYNC_PROTOCOL.md` ("Classification" table). Typical categories for this contract: Implementation Progress, Evidence, Database/schema result (if the fix was schema-related), Completed Feature (once verified).

## Output Routing

Route every output using the table in `docs/shared/reference/SYNC_PROTOCOL.md` and its Index Update Rule. This contract does not restate those routes.

## Validation

1. Reproduce-then-fix verification specific to the defect (manual check, SQL check, or automated test, whichever is appropriate).
2. `npm run lint` / `npm run build` for web changes; mobile typecheck for mobile changes.
3. `npm run docs:validate` if a plan was touched.
4. For schema-related fixes, verify against `docs/shared/reference/DATABASE_TRUTH.md` hierarchy after the change, not before.

## Completion Criteria

1. Root cause confirmed against an authoritative source (code, schema dump, or doc) and stated explicitly.
2. Fix implemented and regression evidence captured.
3. Any plan/doc updates required by `SYNC_PROTOCOL.md` are complete.
4. Repository Lifecycle Report (and AI Output Intake Report, per output) filed.
