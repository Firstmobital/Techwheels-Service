# Repository Transaction Framework

Classification: state = truth, scope = shared, intent = reference (catalog/task_library).

This is a reusable repository lifecycle definition, not a task contract and not a prompt. The Task Library contracts in `generic/` (see `INDEX.md`) define **how to perform** a unit of work. This framework defines **how completed work moves through the repository** — from start to safely published — regardless of which contract performed the work. It is the layer the contracts plug into, not a replacement for them.

## Relationship to Existing Mechanisms (Not Duplicated Here)

This framework does not duplicate or replace:

1. **Task Contracts** (`generic/*.md`, indexed in `INDEX.md`) — define Stage 1-4 content (Authorities, Execution, Expected Outputs) for a given kind of work. This framework sequences them; it does not restate their steps.
2. **Repository Lifecycle Protocol / AI Output Intake Router** (`docs/shared/reference/SYNC_PROTOCOL.md`) — owns Classification, Output Routing, the Index Update Rule, and the Artifact Types vocabulary (including `Transaction Result`). Stage 3 (Repository Updates) and Stage 6 (Completion) below point to it instead of restating it.
3. **Repository Health Auditor** (`scripts/repo_health_audit.mjs`, `npm run docs:validate:health`) — owns advisory structural health checks. Stage 4 (Validation) points to it instead of redefining its checks.
4. **Safe Publish** (`scripts/git-safe-publish.sh`, **`npm run publish:safe`**) — owns the commit/pull-rebase/push workflow and its safety stops. Stage 5 (Publication) below names it as the single mechanism for that stage; it does not redefine or fork its steps. (`npm run git:safe-publish` remains a backward-compatible alias.) Safe Publish now has two repository-native intake checkpoints: outgoing local-change intake before commit confirmation, and incoming upstream-change intake after rebase before push.
5. **Repository Change Impact Analysis** (`scripts/repo_change_impact.mjs`, `npm run docs:impact`) — a read-only, git-diff-aware classifier. It does not define its own categories: it reuses `SYNC_PROTOCOL.md`'s Classification table/Artifact Types and `.instructions.md` Section 2 as its vocabulary. Stage 4 may run it manually as a pre-check on the pending working-tree diff. Stage 5 also runs its default local mode automatically before commit confirmation whenever `npm run publish:safe` sees local changes, so outgoing changes are classified before they can be committed. If that report raises review-sensitive findings (independent review, DB ledger/protocol expectations, generated artifact refresh/validation expectations, or unmapped files), Safe Publish requires explicit interactive confirmation before continuing; the report is still read-only and never auto-edits docs, self-heals, updates the ledger, or refreshes generated artifacts. Safe Publish also calls its `--range` mode automatically, but only at the existing Stage 5 exit-4 stop (new commits pulled from origin/main during rebase), to generate a read-only incoming-change intake report over just those commits — this preserves the existing stop-before-push behavior.
6. **Publish Readiness Verifier** (`scripts/publish_readiness_check.mjs`, **`npm run publish:ready`**) — a read-only proof command that consumes the impact report, health report, DB ledger, generated-artifact expectations, validation/practical-verification expectations, self-heal/routing signals, and review recommendations. It does not classify new files and does not self-heal; it reports `READY` or `NOT READY` with unresolved blockers and exact next actions. Safe Publish runs it as a blocking gate before the final push confirmation.

## The Six-Stage Lifecycle

Every repository transaction — of any type — moves through these six stages, in order. The stages are defined once, generically, here; no transaction type below redefines them.

1. **Start** — Classify the work (`.instructions.md` Section 2) and select the matching Task Contract from `INDEX.md`, if one exists. Confirm no existing plan, branch, or in-progress contract execution already owns this work (`.instructions.md` Section 5, No Assumption Protocol).
2. **Execution** — Perform the selected contract's `Execution` steps and consult its `Authorities`. Where no contract exists for the transaction type (see mapping below), use the direct authority named there instead.
3. **Repository Updates** — Apply the contract's `Expected Outputs`, `Output Classification`, and `Output Routing` sections, which route through `SYNC_PROTOCOL.md`'s Classification table and Index Update Rule. This stage is identical machinery for every transaction type; it is never restated per type.
4. **Validation** — Optionally, run `npm run docs:impact` (`scripts/repo_change_impact.mjs`) first to preview which categories of changed files are present and which validation/review they call for. Then run the contract's `Validation` commands. `npm run docs:validate` is always a blocking gate; `npm run docs:validate:health` is always advisory only (`docs/STRUCTURE_GUIDE.md` Section 24). A transaction may not proceed to Publication while a blocking validation is failing.
5. **Publication** — Run **`npm run publish:safe`** (`scripts/git-safe-publish.sh`). This is the single Publication mechanism for every transaction type, with no per-type variation: it re-runs Stage 4's validation as its own safety net, runs outgoing local-change impact intake before commit confirmation when local changes exist, then commits, rebases onto origin/main, runs `npm run publish:ready` as the executable readiness proof, and pushes only under its existing safety rules (never auto-pushing past new upstream commits, a failed blocking validation, a failed local impact analysis, failed publish-readiness verification, or a rebase conflict). If new upstream commits are pulled during rebase, it runs incoming `--range` impact intake and exits 4 before push. No transaction type defines its own publish steps.
6. **Completion** — Satisfy the contract's `Completion Criteria`, run the Practical Verification Gate (`SYNC_PROTOCOL.md`) when this transaction created or modified a script, prompt, contract, transaction, or automation, then file the Repository Lifecycle Report (and AI Output Intake Report, per artifact) per `SYNC_PROTOCOL.md`. A transaction is not complete until Stage 5 has either succeeded (exit 0) or been explicitly deferred with a stated reason (for example, batched for publication together with other pending transactions).

## Transaction Types -> Stages 1-4 Source

Stages 5 and 6 are always the mechanisms named above, for every row below — they are not repeated per type. Only Stages 1-4 vary, and they vary only by which existing authority is selected, never by new content defined here.

| Transaction Type | Stages 1-4 Source | Note |
|---|---|---|
| Feature | [Feature Implementation contract](generic/FEATURE_IMPLEMENTATION_TASK_CONTRACT.md) | — |
| Bug Fix | [Bug Fix contract](generic/BUG_FIX_TASK_CONTRACT.md) | — |
| Refactor | [Bug Fix contract](generic/BUG_FIX_TASK_CONTRACT.md) | No dedicated contract. A structural change with no intended behavior change follows the same shape as a bug fix (confirm current implementation, make the minimal change, capture before/after evidence) without a defect/regression claim; `.instructions.md` Section 9 item 2 (no unrelated behavior change) is the controlling rule. |
| Database Change | [Database Change contract](generic/DATABASE_CHANGE_TASK_CONTRACT.md) | — |
| Migration | [Database Change contract](generic/DATABASE_CHANGE_TASK_CONTRACT.md) | A migration is a Database Change; that contract's Execution step 4 already names `supabase/migrations/` directly. Not a separate workflow in this repository. |
| Documentation | `.instructions.md` Sections 5 (New File Decision Tree) and 7 (Documentation Placement Governance); `docs/STRUCTURE_GUIDE.md` for placement | No dedicated contract. These sections already define Start (search for an existing owner) and Execution (placement) for documentation work; Stage 3 still routes through `SYNC_PROTOCOL.md`'s "Documentation (general)" category. |
| Release | None — Stages 1-4 are already complete | A Release transaction exists to carry one or more already-completed transactions to publication together. It begins at Stage 5. |
| Hotfix | [Bug Fix contract](generic/BUG_FIX_TASK_CONTRACT.md), expedited | Same contract and the same Stage 5 mechanism as any other type. "Expedited" means a compressed timeline, not a skipped stage — Validation and Publication both still run before anything reaches `origin/main`. |

## Vendor Neutrality

This framework, like the contracts it sequences, contains no vendor- or tool-specific wording. It describes what the repository expects from a transaction, regardless of who or what executes it.
