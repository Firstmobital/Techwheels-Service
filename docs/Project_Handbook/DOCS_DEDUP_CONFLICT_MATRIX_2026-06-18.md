# Docs De-dup Conflict Matrix (Non-Implementation Plans)

Date: 2026-06-18  
Scope: `docs/**/*.md` excluding `docs/Implementation_plans/**`

## Method

- Parsed all markdown files in scope.
- Computed token-set overlap (Jaccard similarity).
- Flagged conflicts at either:
  - similarity >= 0.20
  - shared heading count >= 2
- Applied targeted edits to highest-risk duplication clusters.

## Conflict Matrix

| Cluster ID | Overlap Signal | Files in Conflict | Primary Authority | Action | Status |
|---|---:|---|---|---|---|
| C1 | 0.413 | `docs/uploads/active/INDEX_NEXT_DAY_UPLOADS.md` vs `docs/uploads/active/README_NEXT_DAY_UPLOADS.md` | `docs/uploads/active/INDEX_NEXT_DAY_UPLOADS.md` (navigation authority) | Rewrote both files with strict boundary split: index vs summary | Resolved |
| C2 | 0.331 / 0.311 / 0.273 | `docs/uploads/active/IMPLEMENTATION_ROADMAP.md` vs (`README_NEXT_DAY_UPLOADS.md`, `INDEX_NEXT_DAY_UPLOADS.md`, `runbooks/NEXT_DAY_UPLOAD_GUIDE.md`) | `docs/uploads/active/IMPLEMENTATION_ROADMAP.md` (sequencing authority) | Rewrote roadmap to phase sequencing only (no duplicate code/tutorial blocks) | Resolved |
| C3 | 0.316 / 0.272 | `docs/uploads/runbooks/NEXT_DAY_UPLOAD_GUIDE.md` vs upload `active/*` docs | `docs/uploads/runbooks/NEXT_DAY_UPLOAD_GUIDE.md` (operator procedure authority) | Rewrote runbook to operation + validation + escalation only | Resolved |
| C4 | 0.426 / 0.423 / 0.347 / 0.328 / 0.308 / 0.295 / 0.291 / 0.239 / 0.237 | Category README boilerplate overlap across `docs/autodoc/README.md`, `docs/rbac/README.md`, `docs/security/README.md`, `docs/supabase/README.md`, `docs/warranty/README.md` | Each category README is authority only for category scope and boundaries | Rewrote each file to concise, category-specific anchors; removed repeated boilerplate blocks | Resolved |
| C5 | 0.205 / 0.200 / 0.176 / 0.171 / 0.168 | `docs/uploads/README.md` overlap with category README templates | `docs/uploads/README.md` (category entry) + `docs/uploads/active/INDEX_NEXT_DAY_UPLOADS.md` (internal map) | Rewrote uploads category README to point to canonical entry points and authority boundaries | Resolved |
| C6 | 0.308 / 0.241 / 0.233 / 0.229 / 0.220 / 0.207 | RBAC evidence and runbook files share repeated section headers (`Overview`, `Prerequisites`, `Success criteria`) | File-level domain docs remain separate by evidence type | Left content intact; overlap is structural heading reuse rather than duplicated semantic payload | Accepted |
| C7 | 0.260 / 0.259 / 0.235 | `docs/Project_Handbook/ONBOARDING_GATING_ENFORCEMENT.md` vs RBAC evidence docs | Domain-specific evidence files in `docs/rbac/evidence/` | Left intact; conceptual adjacency is expected but documents serve different workflows | Accepted |
| C8 | 0.229 | `docs/Project_Instructions/reference/DOCS_PLACEMENT_GUIDE.md` vs `docs/STRUCTURE_GUIDE.md` | `docs/STRUCTURE_GUIDE.md` (placement authority) and `docs/Project_Instructions/reference/DOCS_PLACEMENT_GUIDE.md` (contributor guide) | Left intact by design; one is strict governance, one is user-facing guide | Accepted |

## Repeated Heading Hotspots (Global)

Observed repeated headings across >=3 files during scan:

- `## structure` (9)
- `## overview` (6)
- `## adding new docs to this category` (6)
- `## related documentation` (5)
- `## related links` (5)
- `## timeline` (3)
- `### verification checklist` (3)
- `## validation checklist` (3)
- `## questions?` (3)
- `### prerequisites` (3)
- `## success criteria` (3)

Mitigation applied in this pass:

- Collapsed generic category README templates into concise scope anchors.
- Removed repeated long-form implementation/tutorial blocks from upload active docs.
- Enforced single-source ownership in uploads cluster (index vs summary vs roadmap vs runbook).

## Post-pass Ownership Rules

- Navigation ownership: `docs/uploads/active/INDEX_NEXT_DAY_UPLOADS.md`
- Executive summary ownership: `docs/uploads/active/README_NEXT_DAY_UPLOADS.md`
- Implementation sequencing ownership: `docs/uploads/active/IMPLEMENTATION_ROADMAP.md`
- Operational procedure ownership: `docs/uploads/runbooks/NEXT_DAY_UPLOAD_GUIDE.md`
- Snippet ownership: `docs/uploads/runbooks/COPY_PASTE_CODE.md`
- Deep rationale ownership: `docs/uploads/evidence/UPLOAD_LOGIC_REFACTOR.md`

## Notes

- No files under `docs/Implementation_plans/` were changed.
- This matrix reflects overlap audit and dedup actions in current workspace state.

## Second Strict Pass (Heading Vocab Enforcement)

Applied: 2026-06-18 (same session)

Goal:

- Enforce unique H2+ heading vocabulary across all category README files under `docs/*/README.md`.

Result metrics:

- Category README files scanned: 10
- README pairs with shared H2+ headings: 0
- Global non-Implementation_plans conflict pairs (same scoring rule): reduced from 30 to 25

Files normalized in this strict pass:

- `docs/autodoc/README.md`
- `docs/complaints/README.md`
- `docs/rbac/README.md`
- `docs/security/README.md`
- `docs/supabase/README.md`
- `docs/uploads/README.md`
- `docs/wa_templates/README.md`
- `docs/warranty/README.md`
- `docs/Project_Instructions/README.md`

Residual overlap drivers after strict pass:

- Technical evidence/runbook documents with intentionally similar procedural headings.
- Governance documents (`STRUCTURE_GUIDE` vs placement guide) that are related but serve different audiences.
