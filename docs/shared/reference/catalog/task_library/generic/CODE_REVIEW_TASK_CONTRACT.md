# Task Contract: Code Review

Classification: state = truth, scope = shared, intent = reference (catalog/task_library/generic).

This is a reusable repository task contract, not a prompt. It describes the repeatable structure of a code-review task so any execution of that task follows the same authorities, steps, and routing.

## Purpose

Review a proposed or existing code change for correctness, adherence to repository authorities (code truth, database truth, documentation governance), and for any doc/parity impact that the change introduces but does not yet account for.

## Inputs

1. The code change to review (diff, PR, or file set).
2. Affected surface(s) (web/mobile/shared) and module(s).
3. Whether the change is already linked to an implementation plan.
4. Whether the change touches schema, RLS, or access control.

## Authorities

1. `.instructions.md` Section 9 (Code Truth) — the local repository is code truth; review against actual current code, not memory of it.
2. `.instructions.md` Section 8 (Database Truth Authority) and `docs/shared/reference/DATABASE_TRUTH.md` — for any schema/RLS/RPC-touching change.
3. `docs/shared/reference/SYNC_PROTOCOL.md` ("Update Triggers", "Cross-Platform Parity Protocol", "Enforcement Recommendation") — to check whether required doc/parity updates accompany the change.
4. `docs/DOCS_IMPACT_MATRIX.md` — to confirm the change's impacted-doc list is complete.
5. `.instructions.md` Section 4 (No Assumption Protocol) — do not approve a claim about behavior, schema, or docs without checking the authoritative source.

## Execution

1. Identify the surface(s) and module(s) touched.
2. Verify the change against code truth: does it do what it claims, and does it avoid unrelated behavior changes (`.instructions.md` Section 9 item 2)?
3. If the change touches schema/RLS/RPCs, verify claims against `docs/shared/reference/DATABASE_TRUTH.md`'s hierarchy rather than the PR description alone.
4. Check the change against `SYNC_PROTOCOL.md`'s Update Triggers list; flag any trigger condition met without a corresponding doc update.
5. If the change is parity-sensitive (`SYNC_PROTOCOL.md` "Cross-Platform Parity Protocol"), confirm parity status is explicit, not omitted.
6. Record review findings; if the review surfaces reusable repository knowledge (a fact, fix, or gap a future task would need), route it per the AI Output Intake Router instead of leaving it only in review comments.

## Expected Outputs

1. Review findings (approved, changes requested, or blocked) with explicit reasoning tied to an authority above.
2. A list of any missing doc/parity updates identified, if applicable.
3. Routed follow-up items for any reusable finding (see Output Routing).

## Output Classification

Classify each output using the categories in `docs/shared/reference/SYNC_PROTOCOL.md` ("Classification" table). Typical categories for this contract: Evidence, Broken Link, Database/schema result, Temporary Investigation, No Repository Update Needed.

## Output Routing

Route every output using the table in `docs/shared/reference/SYNC_PROTOCOL.md` and its Index Update Rule. This contract does not restate those routes.

## Validation

1. `npm run lint` / `npm run build` for the reviewed web change, if not already verified by its author.
2. Mobile typecheck (`npx --prefix mobile tsc --noEmit -p mobile/tsconfig.json`) for mobile changes.
3. `npm run docs:validate:health` (advisory) if the review concerns governance-adjacent docs.

## Completion Criteria

1. Review outcome stated explicitly (approved / changes requested / blocked) with authority-backed reasoning.
2. Every Update Trigger met by the change has a confirmed corresponding doc update, or an explicitly flagged gap.
3. Any reusable finding has been routed per the AI Output Intake Router, or explicitly classified `No Repository Update Needed`.
