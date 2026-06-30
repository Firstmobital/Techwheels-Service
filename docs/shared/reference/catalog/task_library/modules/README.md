# Task Library: Module-Specific Contracts

Scope: holds module-specific specializations of the generic task contracts in `../generic/`, for cases where a module's workflow genuinely differs from the generic contract (extra authority, extra validation step, a different output route).

Subfolder purpose: one subfolder per module/cross-cutting domain that needs a specialization, named to match its existing docs path (e.g. `warranty/`, `rbac/`). Do not create a subfolder here speculatively — only when a generic contract has been found insufficient for that module in practice.

Navigation: see `../INDEX.md` for which contract (generic or module-specific) to use for a given task.

Lifecycle transition guidance: a module-specific contract here must cross-reference, not duplicate, the generic contract it specializes — state only the delta (additional input, additional authority, additional validation, or different routing) and link back to the generic contract for everything else.

Current state: empty. No module has yet required a specialization beyond the 8 generic contracts. This anchor file exists per `docs/STRUCTURE_GUIDE.md` Section 5 item 3 (every primary category needs a README) and Section 20 (no empty category folders without an explicit anchor-file policy).
