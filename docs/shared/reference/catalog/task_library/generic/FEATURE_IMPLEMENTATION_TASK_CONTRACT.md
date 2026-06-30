# Task Contract: Feature Implementation

Classification: state = truth, scope = shared, intent = reference (catalog/task_library/generic).

This is a reusable repository task contract, not a prompt. It describes the repeatable structure of a feature-implementation task in this repository so any execution of that task follows the same authorities, steps, and routing.

## Purpose

Implement a new application feature (or a net-new capability inside an existing module) in `src/` or `mobile/src/`, with documentation and evidence kept in sync in the same change, so the feature does not become undocumented or unrouted work.

## Inputs

1. Feature description: what is being built and which surface (web/mobile/shared) it affects.
2. Target module/cross-cutting domain name.
3. Whether an implementation plan already exists for this feature (search required — see Execution step 2).
4. Any schema/RLS/RPC dependency the feature requires.

## Authorities

1. `.instructions.md` Section 2 (Task Decision Framework, item 1 Code / item 9 Mixed) — classify the request first.
2. `.instructions.md` Section 4 (No Assumption Protocol) and Section 5 (New File Decision Tree) — search before creating.
3. `docs/shared/reference/SYNC_PROTOCOL.md` ("Update Triggers" and "Required Update Workflow") — when and how docs must move with the code.
4. `docs/DOCS_IMPACT_MATRIX.md` — which docs a given code-change area must update.
5. `docs/STRUCTURE_GUIDE.md` Section 2.5 (Implementation Plans), Section 4 (Naming Rules), Section 6 (State Transition Procedure) — only if the feature is large enough to need a tracked plan (see the Implementation Plan task contract).
6. `docs/shared/reference/DATABASE_TRUTH.md` — if the feature touches schema/RPCs/policies.

## Execution

1. Classify the request using `.instructions.md` Section 2.
2. Search for an existing owner (plan, module doc, or prior implementation) before writing code or docs (`.instructions.md` Sections 4-5).
3. Implement the code change in the correct surface (`src/` web, `mobile/src/` mobile).
4. Apply the `SYNC_PROTOCOL.md` Required Update Workflow: impact matrix check, `CURRENT_STATE.md` snapshot fields, one `CHANGE_LOG.md` entry, handbook/`README.md` sections if architecture/behavior changed, DB ledger row if schema changed.
5. If the feature is multi-step or spans more than one session, create or update an implementation plan instead of tracking progress only in chat — use the Implementation Plan or Implementation Plan Update task contract for that step.
6. If the feature touches both web and mobile business logic, follow the Cross-Platform Parity Protocol in `SYNC_PROTOCOL.md`.
7. Run the Repository Lifecycle Protocol Self-Heal Check (`SYNC_PROTOCOL.md`) before finishing.

## Expected Outputs

1. Working code change in the correct surface.
2. Docs updated per the impact matrix (handbook/reference/change log as applicable).
3. A plan reference (new or updated) if the feature was plan-tracked.
4. A Repository Lifecycle Report and, per output, an AI Output Intake Report.

## Output Classification

Classify each output produced by this task using the categories in `docs/shared/reference/SYNC_PROTOCOL.md` ("Classification" table under the AI Output Intake Router). Typical categories for this contract: Implementation Progress, New Implementation Plan, Completed Feature, Reference Truth, Evidence. Do not invent a category outside that table.

## Output Routing

Route every output using the table in `docs/shared/reference/SYNC_PROTOCOL.md` ("Classification" -> "Route to" column) and the Index Update Rule in the same file. This contract does not restate those routes; it only points to them.

## Validation

1. `npm run docs:validate` (plan retention, if a plan was touched).
2. `npm run lint` and `npm run build` for web changes.
3. `npx --prefix mobile tsc --noEmit -p mobile/tsconfig.json` for mobile changes.
4. `npm run docs:validate:health` (advisory) if the change touched governance-adjacent docs.

## Completion Criteria

1. Code committed and working.
2. Every step of the `SYNC_PROTOCOL.md` Required Update Workflow that applies has been completed.
3. Repository Lifecycle Report (and AI Output Intake Report, per output) filed per `SYNC_PROTOCOL.md`.
4. Applicable validation commands above pass, or failures are explicitly reported with cause.
