# Task Library Index

Classification: state = truth, scope = shared, intent = reference (catalog/task_library).

This index explains which reusable task contract to use, when, what inputs it needs, and what it produces. It does not restate any contract's body — read the contract itself (linked below) for Purpose/Inputs/Authorities/Execution/Expected Outputs/Output Classification/Output Routing/Validation/Completion Criteria.

A task contract is a vendor-neutral repository asset describing a repeatable workflow's structure. It is not a prompt and not tool-specific instructions — it describes what the repository expects from the task, regardless of who or what performs it.

## How This Library Integrates With Existing Governance

This library does not duplicate or replace:

1. The Repository Lifecycle Protocol / AI Output Intake Router (`docs/shared/reference/SYNC_PROTOCOL.md`) — every contract's Output Classification and Output Routing sections point there instead of restating its Classification table or its Artifact Types vocabulary.
2. The Repository Health Auditor (`scripts/repo_health_audit.mjs`, `npm run docs:validate:health`) — the Repository Audit contract directs execution to it rather than re-defining its checks.
3. `.instructions.md` — every contract's Authorities section points to the relevant numbered section there instead of restating it.

## Repository Transaction Framework

A contract describes how to perform one kind of work. It does not describe how that completed work moves through the repository until it is safely published. That sequencing — Start, Execution, Repository Updates, Validation, Publication, Completion — is defined once in [`TRANSACTION_FRAMEWORK.md`](TRANSACTION_FRAMEWORK.md), which also maps common transaction types (Feature, Bug Fix, Refactor, Database Change, Migration, Documentation, Release, Hotfix) onto the contracts below. **`npm run publish:safe`** (`scripts/git-safe-publish.sh`) is that framework's Publication stage for every transaction type, not an isolated script.

## Generic Contracts (`generic/`)

| Contract | Use when | Key inputs | Expected outputs |
|---|---|---|---|
| [Feature Implementation](generic/FEATURE_IMPLEMENTATION_TASK_CONTRACT.md) | Building a new feature or capability in application code. | Feature description, target surface/module, existing-plan check. | Code change, synced docs, plan reference if applicable. |
| [Bug Fix](generic/BUG_FIX_TASK_CONTRACT.md) | Diagnosing and correcting a defect. | Bug report/symptom, affected surface/module, plan-tracked status. | Fix, regression evidence, plan/doc updates if applicable. |
| [Code Review](generic/CODE_REVIEW_TASK_CONTRACT.md) | Reviewing a proposed or existing code change. | The change to review, affected surface/module, schema/access-control touch. | Review outcome, flagged doc/parity gaps, routed findings. |
| [Architecture Review](generic/ARCHITECTURE_REVIEW_TASK_CONTRACT.md) | Evaluating a module boundary, route/data-flow design, or cross-cutting decision. | Architectural question/area, affected surface/module, existing decision check. | Review outcome, architecture decision update if warranted, staleness flags. |
| [Database Change](generic/DATABASE_CHANGE_TASK_CONTRACT.md) | Proposing/applying/verifying a schema, RLS, function/RPC, view, or index change. | Proposed change, reason, current verified schema state. | Applied+verified migration, ledger row, truth-file refresh if needed. |
| [Repository Audit](generic/REPOSITORY_AUDIT_TASK_CONTRACT.md) | Checking repository documentation/structural health. | Audit scope, on-demand vs recurring. | Health-audit report, routed dispositions for findings. |
| [Implementation Plan](generic/IMPLEMENTATION_PLAN_TASK_CONTRACT.md) | Creating a new implementation plan, and no existing plan owns the work. | Workstream description, platform/category, no-existing-plan confirmation. | New plan file, updated platform index/tracker. |
| [Implementation Plan Update](generic/IMPLEMENTATION_PLAN_UPDATE_TASK_CONTRACT.md) | Updating an existing active plan after a fix/verification/rollout/rollback. | Target plan path, what changed, Done+Verified status of any item. | Updated plan, promotion summary if applicable, updated tracker/index. |

## Module-Specific Contracts (`modules/`)

Currently empty — see `modules/README.md`. Use a module-specific contract instead of the generic one only if one has been created for that module; otherwise use the generic contract above.

## Generated Artifacts (`generated/`)

Currently empty — see `generated/README.md`. Reserved for future automation output; never hand-authored.

## Choosing Between Implementation Plan and Implementation Plan Update

Search the relevant platform's `active/` folder and `IMPLEMENTATION_TRACKER.md` first. If a plan already owns the work, use Implementation Plan Update. Only use Implementation Plan (new) when that search confirms no existing plan covers it — this mirrors the "New Implementation Plan" vs "Implementation Progress" distinction in `docs/shared/reference/SYNC_PROTOCOL.md`'s Classification table.

## Related Authorities (Not Duplicated Here)

1. `docs/STRUCTURE_GUIDE.md` — documentation placement authority; Section 2.2.1 defines this library's location.
2. `docs/shared/reference/SYNC_PROTOCOL.md` — Repository Lifecycle Protocol, AI Output Intake Router, Classification table, Index Update Rule.
3. `.instructions.md` — AI-agent operating contract (Task Decision Framework, No Assumption Protocol, New File Decision Tree, Repository Minimalism Rule).
4. `docs/shared/reference/catalog/` — flat reusable document-shape templates (`IMPLEMENTATION_PLAN_TEMPLATE.md`, `UPDATE_TEMPLATE.md`, `IMPLEMENTATION_PROMOTION_SUMMARY_TEMPLATE.md`), used by the plan-related contracts above for document shape, not workflow structure.
