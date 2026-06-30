# Task Contract: Repository Audit

Classification: state = truth, scope = shared, intent = reference (catalog/task_library/generic).

This is a reusable repository task contract, not a prompt. It describes the repeatable structure of a repository-audit task so any execution of that task follows the same authorities, steps, and routing.

## Purpose

Assess repository documentation and structural health (placement violations, broken/stale links, vendor-specific instruction files, database-truth-hierarchy contradictions, generated-artifact drift, promotion gaps) and report findings without auto-fixing or duplicating the existing health-audit mechanism.

## Inputs

1. Audit scope (whole repository, or a specific surface/module/category).
2. Whether this is an on-demand check or a scheduled/recurring one.

## Authorities

1. `scripts/repo_health_audit.mjs` (run via `npm run docs:validate:health`) — the existing, advisory-only, report-only health auditor. This contract does not duplicate its checks; it directs execution to it.
2. `docs/shared/reference/SYNC_PROTOCOL.md` ("Repository Lifecycle Protocol", "AI Output Intake Router") — the routing mechanism for anything the audit finds that needs a repository update.
3. `docs/STRUCTURE_GUIDE.md` Section 24 (Mandatory Verification Evidence) — minimum required checks after any structural move/audit.
4. `docs/MASTER_INDEX.md` — for confirming index/navigation completeness as part of the audit.

## Execution

1. Run `npm run docs:validate:health` for the standing 7-check advisory audit (broken/stale governance links, root-level doc violations, vendor AI instruction files, DB-truth-hierarchy contradiction flags, generated-artifact drift, best-effort promotion-gap flags).
2. If the audit scope is narrower than the whole repository, interpret the relevant subset of that report rather than re-implementing equivalent checks by hand.
3. For each finding, classify it via the AI Output Intake Router (`SYNC_PROTOCOL.md`) and route it to its existing owner — do not leave findings only in the audit output if they are actionable.
4. Do not auto-fix findings as part of the audit itself; the auditor is report-only by design. Fixes are separate tasks (use the Bug Fix, Documentation, or Database Change task contract as appropriate).
5. Run the Repository Lifecycle Protocol Self-Heal Check (`SYNC_PROTOCOL.md`) before finishing.

## Expected Outputs

1. The health-audit report (`docs/shared/evidence/repo_health_audit_report.json` or equivalent output of the script).
2. A routed disposition for each actionable finding (existing-owner update, or explicitly deferred with reason).
3. Confirmation that no new parallel audit mechanism was created.

## Output Classification

Classify each output using the categories in `docs/shared/reference/SYNC_PROTOCOL.md` ("Classification" table). Typical categories for this contract: Evidence, Broken Link, Database/schema result, Temporary Investigation, No Repository Update Needed.

## Output Routing

Route every output using the table in `docs/shared/reference/SYNC_PROTOCOL.md` and its Index Update Rule. This contract does not restate those routes or the auditor's own check definitions.

## Validation

1. `npm run docs:validate:health` itself is the validation step for this contract.
2. `npm run docs:validate` (plan retention) if the audit's findings touch active plans.

## Completion Criteria

1. Health-audit command run and its output captured.
2. Every actionable finding has a routed disposition or an explicit deferral reason.
3. Repository Lifecycle Report (and AI Output Intake Report) filed, including the health-audit command/result field.
