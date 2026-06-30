# Task Contract: Architecture Review

Classification: state = truth, scope = shared, intent = reference (catalog/task_library/generic).

This is a reusable repository task contract, not a prompt. It describes the repeatable structure of an architecture-review task so any execution of that task follows the same authorities, steps, and routing.

## Purpose

Evaluate a proposed or existing module boundary, route/data-flow design, or cross-cutting architectural decision against the repository's documented architecture truth, and route any new decision or correction to its proper authority.

## Inputs

1. The architectural question, proposal, or area under review (module boundary, route strategy, data-flow design).
2. Affected surface(s) (web/mobile/shared) and module(s)/cross-cutting domain(s).
3. Whether an existing architecture decision already covers this area.

## Authorities

1. `.instructions.md` Section 2 item 5 (Architecture) — `docs/shared/README.md` architecture sections -> `docs/shared/reference/MODULE_ROUTE_CONTRACT.md` / `ROUTE_STRATEGY_DECISION.md` -> code.
2. `.instructions.md` Section 3 (Repository Authority Resolution) — for resolving conflicts between a proposal and existing documented architecture.
3. `.instructions.md` Section 4 (No Assumption Protocol) — verify current module/route structure in code, not from memory.
4. `docs/STRUCTURE_GUIDE.md` Sections 2-3 — for where a new or revised architecture decision document belongs (truth vs implementation, shared vs platform).

## Execution

1. Identify the architectural area and search for an existing decision doc covering it (`docs/shared/README.md`, `MODULE_ROUTE_CONTRACT.md`, `ROUTE_STRATEGY_DECISION.md`).
2. Verify the current implementation against the documented architecture, not against assumption.
3. If the proposal changes or extends documented architecture, evaluate it against existing module boundaries and route strategy.
4. If the review surfaces a decision worth preserving (new boundary, changed route strategy, resolved ambiguity), treat it as a Reference Truth or Architecture output (see Output Classification) rather than leaving it only in review notes.
5. If the review finds the existing architecture doc is stale relative to code truth, flag it as a doc-update need rather than silently working around the discrepancy.

## Expected Outputs

1. Review findings: whether the proposal/area is consistent with documented architecture, and why.
2. An architecture decision update, if the review produced one worth preserving.
3. A flag for any stale architecture doc found, with the specific discrepancy.

## Output Classification

Classify each output using the categories in `docs/shared/reference/SYNC_PROTOCOL.md` ("Classification" table). Typical categories for this contract: Architecture, Reference Truth, Temporary Investigation, No Repository Update Needed.

## Output Routing

Route every output using the table in `docs/shared/reference/SYNC_PROTOCOL.md` and its Index Update Rule (Architecture rows route to `docs/shared/README.md` architecture sections or `MODULE_ROUTE_CONTRACT.md`/`ROUTE_STRATEGY_DECISION.md`). This contract does not restate those routes.

## Validation

1. Cross-check the decision against current code structure (module/route layout) before finalizing.
2. `npm run docs:validate:health` (advisory) if the review touches governance-adjacent docs.

## Completion Criteria

1. Review outcome stated explicitly, tied to the architecture authorities above.
2. Any new or corrected architecture decision is written to its authoritative doc, not left only in review notes.
3. Any stale architecture doc found is flagged with the specific discrepancy, even if not fixed in this task.
