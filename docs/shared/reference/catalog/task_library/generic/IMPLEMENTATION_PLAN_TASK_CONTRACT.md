# Task Contract: Implementation Plan (New)

Classification: state = implementation (the resulting artifact), scope = shared, intent = reference (catalog/task_library/generic).

This is a reusable repository task contract, not a prompt. It describes the repeatable structure of creating a new implementation plan so any execution of that task follows the same authorities, steps, and routing. It governs the task of creating a plan; the resulting plan document's own structure is `docs/shared/reference/catalog/IMPLEMENTATION_PLAN_TEMPLATE.md`.

## Purpose

Create a new implementation plan only when no existing active plan already owns the work, placed and named correctly on the first write, with the matching index/tracker updated in the same change.

## Inputs

1. The feature/workstream the plan will track.
2. Target platform(s) (`webversion`/`mobileversion`) and category.
3. Confirmation that no existing active plan already covers this work (search required).

## Authorities

1. `docs/STRUCTURE_GUIDE.md` Section 2.5 (Implementation Plans) — path structure (`webversion`/`mobileversion`/`categories/<category>/active|evidence|inactive`, `completed/<category>/`, per-platform `INDEX.md`/`IMPLEMENTATION_TRACKER.md`).
2. `docs/STRUCTURE_GUIDE.md` Section 4 (Naming Rules) — `*_PLAN.md` suffix, descriptive names, no generic `notes.md`/`plan.md`.
3. `docs/STRUCTURE_GUIDE.md` Section 6 (State Transition Procedure) and Section 28 (Implementation Plan Retention Policy) — lifecycle and required content limits for the new plan from the start.
4. `docs/shared/reference/catalog/IMPLEMENTATION_PLAN_TEMPLATE.md` — the document-shape template to fill in; this contract does not duplicate that template's sections.
5. `.instructions.md` Section 10 (Implementation Plan Automation) — required plan content (executive summary, objectives, phased tasks, activity tracker, risk assessment, success criteria) and tracker symbol convention.
6. `docs/shared/reference/SYNC_PROTOCOL.md` ("New Implementation Plan" row of the Classification table) — when to use this contract versus the Implementation Plan Update contract.

## Execution

1. Search `docs/Implementation_plans/<platform>/categories/<category>/active/` and that platform's `IMPLEMENTATION_TRACKER.md` to confirm no existing plan already owns this work. If one exists, stop and use the Implementation Plan Update task contract instead.
2. Decide platform and category per `STRUCTURE_GUIDE.md` Section 2.5; do not guess category.
3. Create the plan file under `categories/<category>/active/` using the naming rules in `STRUCTURE_GUIDE.md` Section 4, filled in from `docs/shared/reference/catalog/IMPLEMENTATION_PLAN_TEMPLATE.md` with complete, non-placeholder content.
4. Apply the retention standard from `STRUCTURE_GUIDE.md` Section 28 from the first write (current status tracker, phased structure, per-item status clarity, next actions only).
5. Update that platform's `INDEX.md` and `IMPLEMENTATION_TRACKER.md` in the same change; update `docs/Implementation_plans/INDEX.md` if this is a new top-level entry.
6. Run the Repository Lifecycle Protocol Self-Heal Check (`docs/shared/reference/SYNC_PROTOCOL.md`) before finishing.

## Expected Outputs

1. New plan file at the correct `active/` path.
2. Updated platform `INDEX.md` and `IMPLEMENTATION_TRACKER.md` (and root `Implementation_plans/INDEX.md` if applicable).

## Output Classification

The primary category for this contract is New Implementation Plan (`docs/shared/reference/SYNC_PROTOCOL.md` Classification table). Do not classify a brand-new plan as Implementation Progress — that category is for updates to plans that already exist.

## Output Routing

Route the new plan and its index/tracker updates exactly as specified in the "New Implementation Plan" row of `docs/shared/reference/SYNC_PROTOCOL.md`'s Classification table and its Index Update Rule. This contract does not restate those routes.

## Validation

1. `npm run docs:validate` (plan retention validator) after creation.
2. Confirm the plan does not duplicate an existing active plan (search performed in Execution step 1).

## Completion Criteria

1. Plan created at the correct path with complete, non-placeholder content per the template and `.instructions.md` Section 10.
2. Platform `INDEX.md`/`IMPLEMENTATION_TRACKER.md` (and root index, if applicable) updated in the same change.
3. Plan retention validation passes.
4. Repository Lifecycle Report (and AI Output Intake Report) filed.
