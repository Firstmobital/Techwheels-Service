# Documentation Sync Protocol

Last Updated: 2026-06-29
Status: Mandatory

## Goal

Keep docs synchronized with real code and schema state after every change, and keep the repository self-healing after every completed task of any kind.

## Scope

This file has two layers:

1. **Code/schema sync rules** (`Rules` through `Weekly Maintenance` below): triggered specifically by a code or schema change. Unchanged in scope from the original version of this document.
2. **Repository Lifecycle Protocol** (next section): a universal post-task lifecycle that runs after *any* completed repository task — documentation, database, configuration, architecture, or code — not only code/schema changes. This is an operational protocol, not part of the AI-agent governance contract (`.instructions.md`); it defines what happens after a task ends, not how to behave during one. Its core rule: **repository knowledge is created from artifacts, not only from tasks.** An artifact is any meaningful unit produced or encountered during a task — AI output, human instruction, chat result, git diff, validation result, audit result, implementation result, database/schema result, script output, review comment, a failed command, or a successful command (Artifact Types below). The AI Output Intake Router subsection makes intake of every such artifact mandatory and unconditional, before the agent's final answer, so nothing useful is left only in chat — it is the same classify/resolve-authority/promote machinery described once, applied at artifact granularity instead of whole-task granularity. Running it is never optional; only its outcome (whether a repository file changes) is conditional.

## Repository Lifecycle Protocol (Self-Heal Check)

**Core rule: repository knowledge is created from artifacts, not only from tasks.** Self-healing intake of every artifact is always required; repository file updates stay conditional on what that intake finds.

### Self-Heal Check — mandatory after every artifact

The Self-Heal Check is the AI Output Intake Router below, run in full for every artifact produced or encountered during a task: AI output, human instruction, chat result, git diff, validation result, audit result, implementation result, database/schema result, script output, review comment, a failed command, or a successful command (Artifact Types below). It is mandatory and unconditional — it always runs, for every meaningful artifact, before the agent gives its final answer. There is no "nothing to check" shortcut that skips running it.

What is conditional is only the outcome of running it: whether any repository file actually changes as a result. Concluding "No Repository Update Needed" is a complete, valid result of having run the check — it is never a reason to have skipped running it.

### AI Output Intake Router

For every message, task, command, or output, before the agent gives its final answer, run all of the following:

1. Extract the artifact(s) it contains — there may be more than one (for example a single task can surface a validation result and an architecture decision).
2. Classify each artifact's type (Artifact Types below; Classification table below).
3. Identify the related module/topic for each artifact (Topic/Module Detection below).
4. Compare each artifact against existing repository truth for that module/topic — do not classify from memory or assumption (`.instructions.md` Section 4).
5. Decide which of the following applies to each artifact: an existing plan, a new plan, evidence, reference/truth, a runbook, an architecture decision, an index/navigation update, generated-artifact status, a database-truth workflow update, or No Repository Update Needed (Classification table and Index Update Rule below).
6. If an artifact contains reusable verified information, route it to the existing authority named for that category (Authority Resolution below) — do not invent a new doc type.
7. Update the index/navigation file in the same change whenever routing creates, moves, archives, or materially updates an authority document (Index Update Rule below).
8. Run the validation command(s) that apply to what changed.
9. If no repository file should change for an artifact, state why explicitly in the Intake Report rather than leaving the decision unstated.
10. Never leave a reusable, verified artifact only in chat: if step 5 found any category other than No Repository Update Needed for that artifact, its routing must be done before the output is considered finished.

Nothing useful may remain only in chat: every artifact is either routed to an existing repository authority below, or explicitly classified "No Repository Update Needed" with a stated reason in the Intake Report. This is not a second system; steps 1-10 above are the same classify/resolve-authority/promote machinery defined once in this file. Running them is what is mandatory, every time, for every artifact; the repository-update decision reached in step 5 is the only conditional part.

**Topic/Module Detection (required before classification):** before routing any artifact, identify:

1. Module/topic name.
2. Related web/mobile/shared surface.
3. Related files.
4. Related docs.
5. Related implementation plan, if any.
6. Related evidence, if any.
7. Related database objects, if any.

Use `.instructions.md` Section 2 (Task Decision Framework) to resolve the surface/authority once the topic is known — do not guess; if a relation can't be confirmed, say so explicitly rather than inventing one (`.instructions.md` Section 4).

### Artifact Types

An artifact is any meaningful unit produced or encountered during a task: AI output, human instruction, chat result, git diff, validation result, audit result, implementation result, database/schema result, script output, review comment, a failed command, or a successful command. Repository knowledge is created from artifacts, not only from tasks — any of these sources can carry reusable, verified information that belongs in an existing repository file.

Minimum artifact types. Each routes through the Classification table below; this list adds vocabulary, it does not add new destinations:

1. Architecture Decision — routes as `Architecture`.
2. Workflow Decision — a process/procedure decision, not a code-architecture decision; routes as `Reference Truth` (policy) or `Runbook` (procedure) per `docs/STRUCTURE_GUIDE.md` placement rules.
3. Database Decision — routes as `Database/schema result`.
4. Documentation Decision — routes as `Documentation (general)`.
5. Implementation Plan — routes as `New Implementation Plan`.
6. Plan Progress — routes as `Implementation Progress`.
7. Evidence — routes as `Evidence`.
8. Reference Truth — routes as `Reference Truth`.
9. Runbook Knowledge — routes as `Runbook`.
10. Generated Artifact Result — routes as `Generated Artifact` (Generated Artifact Rule below; never hand-edited).
11. Validation Result — output of a validation command; routes as `Evidence`, or as `Generated Artifact` when it is itself a generated report (for example `docs/shared/evidence/repo_health_audit_report.json`).
12. Health Finding — one finding from the Repository Health Auditor (`scripts/repo_health_audit.mjs`); routes per its own nature using the matching category above (for example a broken-link finding routes as `Broken Link`; a promotion-gap finding routes per `Completed Feature`'s promotion contract).
13. Transaction Result — the completion record of a Repository Transaction Framework stage sequence (`docs/shared/reference/catalog/task_library/TRANSACTION_FRAMEWORK.md`); route its components per their own artifact type above, then file the Repository Lifecycle Report below — not an additional document type.
14. Broken/Stale Link — routes as `Broken Link`.
15. Temporary Investigation — routes as `Temporary Investigation`.
16. No Repository Update Needed — routes as `No Repository Update Needed`.

This list is reused, not duplicated, by the Task Library (`docs/shared/reference/catalog/task_library/INDEX.md`), the Repository Health Auditor (`scripts/repo_health_audit.mjs`), and the Repository Transaction Framework (`TRANSACTION_FRAMEWORK.md`) — each points back here instead of defining its own artifact vocabulary.

### Classification

Classify each discovery/output into one or more of the categories below and route each to its existing owner. Every category already has an owner in this repository — never invent a new doc type to hold one of these:

| Category | Route to |
|---|---|
| New Implementation Plan | Create under the correct `docs/Implementation_plans/<platform>/categories/<category>/active/` path (`docs/STRUCTURE_GUIDE.md` Sections 3.5/5/7); update that surface's `INDEX.md` and `IMPLEMENTATION_TRACKER.md` in the same change. Only use this category when no existing plan owns the work — otherwise route as Implementation Progress instead. |
| Implementation Progress | Update the existing active plan under `docs/Implementation_plans/.../active/`, following the Mandatory Plan Update Protocol (`docs/STRUCTURE_GUIDE.md` Section 30). Do not create a new plan for work an existing plan already owns. |
| Evidence | The relevant `evidence/` doc for that module/category/plan (`docs/STRUCTURE_GUIDE.md` Sections 2-3). Update it; never fork a parallel evidence file. |
| Completed Feature (verified work) | Promotion-before-removal contract (`docs/STRUCTURE_GUIDE.md` Section 28) — promote to the category reference/truth doc with `docs/shared/reference/catalog/IMPLEMENTATION_PROMOTION_SUMMARY_TEMPLATE.md`, then archive/compact the active plan per `STRUCTURE_GUIDE.md`. |
| Reference Truth | The owning `reference/` doc for that concept under `docs/shared`, `docs/web`, or `docs/mobile` (`docs/STRUCTURE_GUIDE.md` Sections 2-3, 14). |
| Runbook | The owning `runbooks/` doc (same placement rules). |
| Architecture | `docs/shared/README.md` architecture sections, or `MODULE_ROUTE_CONTRACT.md` / `ROUTE_STRATEGY_DECISION.md` (`.instructions.md` Section 2 item 5). |
| Documentation (general) | New File Decision Tree (`.instructions.md` Section 5) — search for an existing owner before creating anything. |
| Broken Link | Repair it if it's in a file the current task already touched. Do not start a repository-wide link sweep as a side effect of an unrelated task. |
| Configuration | `.env.example` / `package.json` / the config file in question (`.instructions.md` Section 2 item 6). |
| Database/schema result | `docs/shared/reference/DATABASE_TRUTH.md` / `DB_TRUTH_PROTOCOL.md` / `DB_CHANGE_PROTOCOL.md`, depending on the nature of the change. Never manually edit a generated DB truth file; refresh only via `scripts/backup-metadata.sh` (schema) or `scripts/backup-full-db.sh` (full dump) if a refresh is actually needed. |
| Generated Artifact | Never hand-edit. Identify the generator, run it, validate the output (Generated Artifact Rule below). |
| Temporary Investigation | No permanent doc unless the finding is reusable by a future task. |
| No Repository Update Needed | Nothing to route. Still a complete, valid outcome — state the reason explicitly in the Intake Report rather than leaving it unstated. |
| Other | Use the nearest matching category above; if truly none fit, flag it for human classification rather than creating a new doc type. |

### Index Update Rule

If routing creates, moves, archives, or materially updates an authority document, update the corresponding index/navigation file in the same change:

- New or moved implementation plan -> that surface's `INDEX.md` and `IMPLEMENTATION_TRACKER.md` (`docs/STRUCTURE_GUIDE.md` Sections 19-20), plus `docs/Implementation_plans/INDEX.md` if it is a new top-level entry.
- New or materially changed `docs/shared`/`docs/web`/`docs/mobile` reference, runbook, or category doc -> the relevant category-level `README.md`, and `docs/MASTER_INDEX.md` if it introduces a new category/section that index doesn't yet list.
- Do not create a new index file unless no authoritative index exists for that location — search first (`.instructions.md` Section 5).

### Authority Resolution

Search for the existing owner first (`.instructions.md` Sections 3-5). If an authoritative owner exists, update it. If none exists, use `docs/STRUCTURE_GUIDE.md` (state/scope/intent) to decide whether a new document is justified — most discoveries are not; they belong in a document that already exists.

### Promotion Rule

Promote only verified information. Never promote an assumption or an incomplete investigation. This restates the No Assumption Protocol (`.instructions.md` Section 4) and the promotion validity rule in `docs/STRUCTURE_GUIDE.md` Section 28 item 6 for the lifecycle context — it does not add a new rule.

### Generated Artifact Rule (All Generated Artifacts, Not Only Database)

Generated artifacts are never manually edited. If one is stale: identify its generator script, run the generator, then validate the output. Database truth files specifically are refreshed only via `scripts/backup-metadata.sh` (schema) or `scripts/backup-full-db.sh` (full dump + chunks — only when explicitly needed for a complete dump, row-level investigation, forensic evidence, or backup regeneration; see `docs/shared/reference/DATABASE_TRUTH.md`).

### Minimalism

Prefer, in order: update > merge > promote > reuse, before create > duplicate > fork. This restates `.instructions.md` Section 6 for the lifecycle context — it does not add a new rule.

### Practical Verification Gate (Test Before Claiming Completion)

Whenever this task creates or modifies a script, workflow prompt, task contract, transaction, or repository automation, the agent must test it against its intended behavior before claiming completion — passing review or reading the code is not sufficient on its own.

For scripts:

1. Run a syntax check where applicable (for example `bash -n script.sh`, `node --check script.mjs`).
2. Run a success-path test if it is safe to run.
3. Run a failure-path test if it is safe to run.
4. Verify no application code changed unless the change was intended.

For prompts/task contracts:

1. Perform a dry-run reasoning test against at least one realistic example.
2. Confirm expected authority routing.
3. Confirm the expected Artifact Intake result (Artifact Types and Classification table above).
4. Confirm the validation commands named in the contract.

For `scripts/git-safe-publish.sh` specifically, in addition to the above:

1. Do not push during the test unless explicitly instructed.
2. Verify it stops on validation failure.
3. Verify it stops when incoming commits are pulled during the rebase.
4. Verify it prints the required audit instruction (the `AUDIT_PROMPT` block).
5. Verify it does not scan `local_folder/backups/` or its `chunks/` mirror.

This gate belongs to Completion (Repository Transaction Framework Stage 6; a task contract's Completion Criteria) — it adds a test requirement to that existing stage, not a new lifecycle stage. A task involving any of the items above is not complete until this test evidence exists in the report, even when the change otherwise looks correct on inspection.

## Rules (Definition of Done)

A task is not complete until docs are updated in the same change set.

Mandatory files to review on each change:

1. `docs/shared/reference/CURRENT_STATE.md`
2. `docs/shared/active/CHANGE_LOG.md`
3. `docs/shared/README.md`
4. `docs/DOCS_IMPACT_MATRIX.md`
5. `docs/shared/reference/DB_CHANGE_LEDGER.md` (required for schema/RLS/function/view/index changes)
6. `docs/shared/reference/DB_CHANGE_PROTOCOL.md` (required reference for DB workflow)

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

## Repository Lifecycle Report (Definition of Done)

Every completed task — of any type, not only code/schema changes — finishes with a Repository Lifecycle Report:

1. Repository improvements made.
2. Evidence updated (or none).
3. Plans updated (or none).
4. Reference docs updated (or none).
5. Broken links fixed (or none).
6. Generated artifacts refreshed (or none).
7. New files created, with justification for each (or none).
8. `No Changes Required` — state this explicitly when the Self-Heal Check concluded No Repository Update Needed for every artifact produced or encountered by this task.
9. Practical verification performed — required whenever this task created or modified a script, workflow prompt, task contract, transaction, or repository automation (Practical Verification Gate above); state what was tested and the result, or `not applicable` with why.

## AI Output Intake Report (Definition of Done)

Every artifact (Artifact Types above) passes through the AI Output Intake Router above — that step is mandatory and unconditional — and produces this report as its record. Where a task surfaces exactly one artifact, this report and the Repository Lifecycle Report above may be combined into one; where a task surfaces several artifacts (for example a plan result and a separate validation result), list each artifact's items 1-9 below in the same report, or file one Intake Report per artifact, plus one Lifecycle Report for the task as a whole.

1. Artifacts detected (how many, and a one-line description of each).
2. Artifact types (one or more types from Artifact Types above, per artifact).
3. Related module/topic (from Topic/Module Detection).
4. Authority checked (file/path consulted per artifact, and whether an existing authority was found there — or `none found`).
5. File updated, or no-update reason (path per artifact, or `none` with the explicit reason — mandatory whenever no file was updated for that artifact).
6. Index/navigation updated, or not required (path, or `not required` with why).
7. Practical verification performed (what was tested and the result, per the Practical Verification Gate above — or `not applicable` with why).
8. Validation run (e.g. `npm run docs:validate`, `npm run docs:validate:health`, or a contract-specific validation command — command(s) and result, or `none run` with reason).
9. Whether reusable, verified knowledge remains only in chat (no; or yes, naming what remains and why).

## Enforcement Recommendation

For every PR/task, include a section named `Documentation Updates` containing:

- Updated files list.
- One-line reason for each file update.

If no docs were updated, include explicit justification: `No user-visible, business-logic, schema, or access-control impact`.

This PR-level section is the minimum required summary for code/schema PRs; the Repository Lifecycle Report above is the fuller post-task account required by the Self-Heal Check.
