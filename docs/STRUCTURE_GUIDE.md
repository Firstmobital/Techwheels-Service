# Documentation Structure Guide - Truth/Implementation State Machine Model

**Last Updated:** 2026-06-24  
**Authority:** Techwheels Development Team  
**Status:** Active - Governs all docs placement and state transitions

---

## 1) Core Concept: Truth vs Implementation State Machine

Documentation follows a two-state model:

### TRUTH STATE (Current Documented Reality)
- What exists now: completed implementations, validated specifications, verified architecture
- Three tiers: platform-specific (web, mobile) and shared (both platforms)
- Location: docs/web/, docs/mobile/, docs/shared/
- Authority: single source of truth for each platform/shared concept
- Update frequency: only when implementation is completed and committed

### IMPLEMENTATION STATE (Uncommitted Work and Planned Changes)
- What is being worked on: execution plans, feature designs, implementation roadmaps
- Organized by platform + category + lifecycle
- Location: docs/Implementation_plans/webversion/, docs/Implementation_plans/mobileversion/
- Purpose: track planned work until it becomes truth
- Lifecycle: active -> evidence -> inactive -> completed archive

### STATE TRANSITION (Critical Workflow)
Implementation plan created
-> docs/Implementation_plans/webversion/categories/feature/active/FEATURE_PLAN.md
-> development work
-> docs/Implementation_plans/webversion/categories/feature/evidence/FEATURE_TEST_REPORT.md
-> feature completed and merged
-> archive implementation at docs/Implementation_plans/completed/feature/
-> update truth docs at docs/web/modules/feature/reference/FEATURE_SPEC.md
-> remove implementation copy from active trackers

**Anti-duplication rule:** once implementation becomes truth, keep one authoritative doc in truth location and remove implementation duplicates.

---

## 2) Directory Hierarchy

### 2.0 Project Root (Repository Root) Policy

Allowed documentation file at repository root:
- README.md only

Disallowed at repository root:
- ad-hoc documentation and analysis files (`.md`, `.txt`, `.sql`, `.guide`, `.audit`, `.notes`, `.log`)

When such files are created during investigation/planning, move them immediately to staging:
- markdown/text -> `docs/_unstructured_staging/project_root_docs/`
- non-md doc-like -> `docs/_unstructured_staging/project_root_docs_non_md/`

Reason:
- keeps project root focused on runtime/build/config artifacts
- prevents documentation drift and root clutter
- enforces staging-first classification before truth placement

### 2.1 Root Level (Meta and Governance only)

Allowed at docs/ root:
- README.md
- MASTER_INDEX.md
- STRUCTURE_GUIDE.md
- DOCS_IMPACT_MATRIX.md
- DOCS_DEDUP_CONFLICT_MATRIX_*.md
- ai-context.md (repo operating contract)
- db-changes.md (manual change ledger)
- codex-logs.md (agent change log)

No module content documents should remain at docs/ root.
No non-markdown implementation artifacts should remain at docs/ root.

Non-markdown placement policy:
- SQL diagnostics/check scripts -> sql/ or sql-checks/
- JS/TS test helpers and tooling -> scripts/ (or platform test folders)
- Transitional leftovers -> docs/_unstructured_staging/non_md/

### 2.2 Shared Truth State

Path: docs/shared/

Subcategories:
- reference/ -> specifications, policies, decisions
- evidence/ -> audits, validations, verification reports
- runbooks/ -> operational procedures
- active/ -> live tracking/changelog
- reference/catalog/ -> reusable templates

### 2.3 Web Truth State

Path: docs/web/

- modules/<module>/
  - README.md
  - reference/
  - evidence/
  - runbooks/
  - active/ (only if required)
- cross-cutting/<domain>/
  - README.md
  - reference/
  - evidence/
  - runbooks/
  - active/ (only if required)

### 2.4 Mobile Truth State

Path: docs/mobile/

- modules/<module>/ (same structure as web when mobile differs)
- cross-cutting/<domain>/ (for mobile infrastructure, eg push-registration)

Principle: mobile-only differences are documented in mobile paths; shared-identical behavior references shared/web truth docs.

### 2.5 Implementation Plans

Path: docs/Implementation_plans/

- webversion/categories/<category>/active|evidence|inactive/
- mobileversion/categories/<category>/active|evidence|inactive/
- completed/<category>/
- INDEX.md and IMPLEMENTATION_TRACKER.md per platform

Note: existing legacy folder docs/impliment_plans/ should be treated as transitional and gradually normalized into docs/Implementation_plans/.

### 2.6 Transitional Staging (Controlled Migration)

Path: docs/_unstructured_staging/

Purpose:
- preserve unclassified legacy docs while preventing root-level sprawl
- support one-file-at-a-time relocation into truth/implementation targets

Buckets:
- root_md/ -> root markdown files awaiting classification
- legacy_dirs/ -> legacy folders moved from old docs hierarchy
- non_md/ -> non-markdown artifacts discovered during cleanup

---

## 3) Placement Decision Tree

1. Shared truth (applies to both web and mobile)?
- Yes -> docs/shared/<subcategory>/

2. Execution plan or roadmap?
- Yes -> docs/Implementation_plans/<platform>/categories/<feature>/<lifecycle>/

3. Platform-specific completed truth?
- Yes -> docs/<platform>/modules/<module>/<subcategory>/ or docs/<platform>/cross-cutting/<domain>/<subcategory>/

4. No match?
- Stop and classify before creating docs.

---

## 4) Naming Rules

1. Use descriptive, searchable names; avoid notes.md/temp.md/new.md.
2. Use PLAN suffix for implementation docs: *_PLAN.md.
3. Use date suffix for audits/snapshots where appropriate: _YYYY-MM-DD or _YYYYMMDD.
4. Content suffix guidance:
- *_REFERENCE.md
- *_PLAN.md
- *_AUDIT.md
- *_RUNBOOK.md
5. Prefer uppercase module tokens in filenames when needed (RBAC, AUTODOC, TELECALLING).

---

## 5) File Organization Rules

1. No content files at category root. Only README.md anchors at category roots.
2. Create subfolders only when content exists.
3. Every primary category must have README.md with:
- scope
- subfolder purpose
- navigation links
- lifecycle transition guidance

---

## 6) State Transition Procedure

When implementation completes:
1. Move plan out of active into completed archive.
2. Create/update truth docs in web/mobile/shared proper paths.
3. Remove duplicate implementation-state copies.
4. Update the repository docs changelog anchor (for example `docs/shared/active/CHANGE_LOG.md` when that path exists).

---

## 7) Anti-Duplication Enforcement

Single source of truth policy:
- A specification or runbook should exist in exactly one authoritative location.
- Implementation plans are temporary and must not compete with truth docs.

Reference update checklist:
1. Search old paths in docs/.
2. Update references.
3. Confirm no stale links remain.

---

## 8) Governance Checklist (Before Creating Any .md)

- Is it shared truth?
- Is it implementation state?
- Is it completed platform-specific truth?
- Tier selected (web/mobile/shared)?
- Subcategory selected (reference/evidence/runbooks/active/catalog)?
- Duplication check completed?
- Category README navigation updated?
- Is this being created at repository root? (If yes, stop and place in docs hierarchy or staging.)

For cross-platform audits and validation artifacts:
- place under docs/shared/evidence/

---

## 9) Tier Reference

- docs/web/ -> completed web truth
- docs/mobile/ -> completed mobile truth
- docs/shared/ -> completed shared truth
- docs/Implementation_plans/ -> uncommitted work

---

## 10) Immediate Migration Policy For This Repo

To safely start from current unstructured state:
1. Project root guard:
   - keep only `README.md` as root documentation file
   - move other root docs/doc-like files to:
     - `docs/_unstructured_staging/project_root_docs/`
     - `docs/_unstructured_staging/project_root_docs_non_md/`
2. Keep governance anchors at docs root: ai-context.md, db-changes.md, codex-logs.md, MASTER_INDEX.md, STRUCTURE_GUIDE.md (and README.md when created).
3. Move all other root-level markdown files to staging bucket:
   - docs/_unstructured_staging/root_md/
4. Move legacy unstructured folders to:
   - docs/_unstructured_staging/legacy_dirs/
5. Move non-markdown docs leftovers to:
   - docs/_unstructured_staging/non_md/
6. Re-home one file at a time from staging to final truth/implementation path.
7. After each move:
   - update links
   - update relevant README navigation
   - record in changelog (when applicable)

This allows controlled migration without blocking day-to-day development.

Pre-commit recommended checks:
1. `find . -maxdepth 1 -type f \( -name '*.md' -o -name '*.txt' -o -name '*.sql' -o -name '*.guide' -o -name '*.audit' -o -name '*.notes' -o -name '*.log' \) | sed 's#^\./##' | sort`
2. `find docs -mindepth 1 -maxdepth 1 -type f | sort`

Expected:
- project root docs/doc-like: `README.md` only
- docs root: governance anchors only

---

## 11) Repository Override: Database Truth Audit Guardrail (Techwheels-Specific)

This section is a repository-specific override for Techwheels.
For other repositories, replace or remove this section and define equivalent local DB authority rules.

For any docs/planning task that references schema/database state:

1. Authority order is strict and never downgraded:
- local_folder/backups/full_database.sql (authoritative schema and full database dump; authority never downgrades)
- local_folder/backups/chunks/full_database.sql.part_* (access mirror of that same dump)
- supabase/migrations/latest_remote_schema.sql (fallback only if present)

2. If direct file access to full_database.sql is blocked by size limits, read/search local_folder/backups/chunks/full_database.sql.part_* as the access mirror of the same dump; do not switch authority to fallback.

3. Before documenting schema assumptions, verify object existence against authoritative dump/chunks.

4. Keep schema-sensitive docs aligned with the latest authoritative snapshot date.

---

## 12) Cross-Project Portability Profile (Reusable In Any Repository)

This guide is intentionally reusable across projects.
For a new repository, keep the state machine and update only the path profile below.

Default portable profile:
- `DOCS_ROOT = docs/`
- `TRUTH_ROOTS = { web/, mobile/, shared/ }`
- `IMPLEMENTATION_ROOT = Implementation_plans/`
- `STAGING_ROOT = _unstructured_staging/`
- `TRUTH_SUBCATEGORIES = { reference/, evidence/, runbooks/, active/ }`
- `IMPLEMENTATION_LIFECYCLE = { active/, evidence/, inactive/, completed/ }`

### 12.1) Mandatory Per-Repository Customization (Required Before Reuse)

When this guide is copied to another repository, the following values must be customized in that repo before execution begins.

Required customization set:
1. Surface map
- Replace `web/mobile/shared` with that repository's real product surfaces.
- Keep at least one truth surface and one implementation surface.

2. Repository authority contracts
- Define source-of-truth authorities (for schema, APIs, generated artifacts, and operational policies).
- Define strict fallback order for each authority source.

3. Folder profile and lifecycle
- Confirm `DOCS_ROOT`, truth roots, implementation root, and staging root.
- Confirm lifecycle folders (`active/evidence/inactive/completed`) or equivalent.

4. Status vocabulary
- Define one canonical status set and use it in guide, trackers, and templates.
- Do not allow per-file status variations.

5. Validation commands
- Provide local validation command names (for example `docs:validate` and `docs:validate:ci`).
- Ensure commands exist before referencing them in docs.

6. CI enforcement
- Add repository CI gate that fails on docs validation errors.
- Validation must run on pull requests to prevent drift.

7. Copilot operating contract
- Add repository instruction file with mandatory read order and no-guessing constraints.
- Include required deliverables for task completion (docs impact, DB impact, verification evidence).

8. Ownership model
- Assign owner/team per module or cross-cutting domain.
- Define review cadence and stale-doc remediation SLA.

Execution gate:
1. If any item above is undefined, this guide is in `porting` state only.
2. Do not treat the guide as active governance until all items are configured.

### 12.2) Portable Implementation Plans Authority Model (Drop-In)

Use this section as a reusable template in any repository.
Keep universal rules unchanged and customize only placeholders.

Template header:
- Last Updated: `<YYYY-MM-DD>`
- Status: `ACTIVE AUTHORITY`
- Owner: `<Product + Engineering + Copilot governance owner>`

Universal purpose:
1. No guesswork for plan placement.
2. No scope drift across workstreams.
3. Consistent lifecycle from active planning to completed archive.
4. Copilot-safe structure for long-term continuity.

Canonical structure template:
1. Live workstream roots:
- `docs/Implementation_plans/<surface_a>/`
- `docs/Implementation_plans/<surface_b>/`
2. Completed archive roots:
- `docs/Implementation_plans/completed/<surface_a>/`
- `docs/Implementation_plans/completed/<surface_b>/`
3. Category lifecycle folders:
- `categories/<category>/active/`
- `categories/<category>/evidence/`
- `categories/<category>/inactive/`

Decision tree template for new plan files:
1. Decide scope owner surface.
2. Decide category (from repository-approved category list).
3. Decide lifecycle folder (`active`, `evidence`, `inactive`).
4. Update control files in the same change:
- `<surface>/INDEX.md`
- `<surface>/IMPLEMENTATION_TRACKER.md`

Completion and archive gate:
1. Implementation done.
2. Validation/testing done.
3. Owner sign-off recorded in plan body.
4. Move to matching completed mirror path without flattening category path.
5. Update tracker/index links in the same change.

Naming model template:
1. Prefix pattern (customize per repo):
- `<SURFACE_A>-###_SHORT_TITLE.md`
- `<SURFACE_B>-###_SHORT_TITLE.md`
2. Optional suffixes:
- `_TRACKER.md`
- `_AUDIT.md`
- `_TEST_REPORT.md`
3. Disallow generic names such as `notes.md` and `plan.md`.

Mandatory control files template:
1. Root implementation authority:
- `docs/Implementation_plans/INDEX.md`
- `docs/Implementation_plans/IMPLEMENTATION_TRACKER.md`
- `docs/Implementation_plans/STRUCTURE_AND_WORKFLOW.md`
2. Per-surface controls:
- `docs/Implementation_plans/<surface>/INDEX.md`
- `docs/Implementation_plans/<surface>/IMPLEMENTATION_TRACKER.md`
3. Completed authority:
- `docs/Implementation_plans/completed/INDEX.md`

Copilot workflow contract template:
1. Place plan files only in approved implementation structure.
2. Update relevant index and tracker in the same session.
3. Never guess category; resolve by module ownership and route/module location.
4. Never leave new plans in implementation root.
5. Preserve path history with migration notes when moving files.

Legacy migration mode template:
1. Legacy folders may remain during staged migration.
2. New files must use approved surface structure only.
3. Existing files move in controlled batches with immediate link/tracker updates.

Universal vs override boundaries for this model:
1. Universal:
- lifecycle folders (`active/evidence/inactive`)
- decision tree sequence
- archive gate and same-change control-file updates
- no-guessing Copilot contract
2. Repository override:
- surface names
- approved category lists
- naming prefixes
- owner/sign-off policy
- mandatory control file variations

Repository-specific overrides:
- You may rename `web/` and `mobile/` to other product surfaces (for example `backend/`, `platform/`, `data/`) as long as state intent remains unchanged.
- You may keep additional governance anchors at `docs/` root, but module content must stay out of docs root.
- If a repo has only one runtime surface, keep `shared/` and one platform root; do not create empty tiers.

Invariant rules across all repos:
1. Truth docs are authoritative and stable.
2. Implementation docs are temporary and lifecycle-driven.
3. One specification/runbook has one authoritative home.
4. Staging is a transit area, not a final destination.

Universal vs repository-specific split:
- Universal core: sections 1-9 and 12-16.
- Repository overrides: sections 10-11.

---

## 13) Auto-Restructuring Workflow For Existing Files

Use this workflow to normalize legacy docs safely in any project.

### Step A: Inventory
1. Build a full file list from project root and `docs/`.
2. Tag each file by type: governance, truth, implementation, evidence, runbook, unknown.

### Step B: Classify State
1. Decide if each document describes current truth or planned/uncommitted work.
2. If uncertain, classify as implementation first and promote only after verification.

### Step C: Map Target Path
1. Select tier: shared or platform-specific.
2. Select subcategory: reference, evidence, runbooks, active.
3. For implementation docs, select lifecycle: active, evidence, inactive, completed.

### Step D: Move Incrementally
1. Move one document (or one tightly related batch) at a time.
2. Update internal links and module README navigation immediately after each move.
3. Avoid bulk moves without link validation.

### Step E: Deduplicate
1. If equivalent content exists in multiple places, keep the most authoritative copy.
2. Delete or archive duplicates in implementation/completed paths.

### Step F: Validate
1. Verify no content docs remain at disallowed root levels.
2. Verify no dead links from old paths.
3. Verify every module/category has a README navigation anchor.

Suggested command checks (adapt paths per repo):
1. `find . -maxdepth 1 -type f \( -name '*.md' -o -name '*.txt' -o -name '*.sql' -o -name '*.guide' -o -name '*.audit' -o -name '*.notes' -o -name '*.log' \) | sed 's#^\./##' | sort`
2. `find docs -type f | sort`
3. `rg -n "old/path/to/moved/doc.md|legacy-folder-name" docs`

---

## 14) New File Placement Protocol (For Correct Placement At Creation Time)

Before creating any new document, apply this protocol:

1. Intent check:
- Is this describing implemented reality? place in truth.
- Is this planning or in-progress work? place in implementation.

2. Scope check:
- Shared across surfaces? place in `shared/`.
- Specific to one surface/module? place in matching module/cross-cutting path.

3. Subcategory check:
- Specs/policies/decisions -> `reference/`
- Validation/audit output -> `evidence/`
- Operational procedures/deploy/setup -> `runbooks/`
- Live trackers/changelogs -> `active/`

4. Naming check:
- Use intent suffixes (`*_REFERENCE.md`, `*_PLAN.md`, `*_AUDIT.md`, `*_RUNBOOK.md`).
- Avoid generic names (`notes.md`, `temp.md`, `new.md`).

5. Duplication check:
- Search for equivalent docs first.
- If content overlaps, update existing source of truth instead of creating a parallel file.

6. Navigation check:
- Add/update parent README links in the same change.

---

## 15) Guide Maintenance Contract

To keep this guide usable in this repo and reusable elsewhere:
1. Update this guide whenever a new docs tier/category/lifecycle is introduced.
2. Keep a clear separation between universal rules and repo-specific overrides.
3. Preserve reusable workflow sections (12-14) as the canonical migration/placement playbook.
4. During docs cleanup initiatives, treat this guide as the source of placement decisions.

---

## 16) Rule Capture Protocol (General-First, Reusable)

When new rules are discovered during implementation, document them here immediately using generalized language.

Rule capture requirements:
1. Write the rule as a reusable policy, not as a one-off incident note.
2. Avoid project-event references in core rules (no PR IDs, no ticket IDs, no one-time evidence links).
3. Use placeholders for paths and modules where possible (for example `<platform>`, `<module>`, `<subcategory>`).
4. If a rule is repo-specific, place it in an override section and label it clearly.
5. Add a short rationale so the rule remains understandable later.

Rule entry template:
1. `Rule:` one-line policy statement
2. `Scope:` universal or repo-specific
3. `Applies to:` existing files, new files, or both
4. `Placement impact:` which folders/states are affected
5. `Rationale:` why this rule exists

Example (generalized):
- Rule: Operational setup docs must be stored in `runbooks/`, while architecture/specification content must be stored in `reference/`.
- Scope: Universal
- Applies to: Both existing-file migration and new-file creation
- Placement impact: Truth-state module folders
- Rationale: Prevents mixed intent and improves discoverability

---

## 17) Mandatory Classification Gate (Do Not Move Without It)

Every move or split operation must pass this gate first.

Required classification record per file:
1. `state`: truth or implementation
2. `scope`: shared, web, mobile (or repository-defined surfaces)
3. `intent`: reference, runbook, evidence, active, completed

Gate rules:
1. If any required field is unknown, stop. Do not move.
2. Filename is not authority. Content state is authority.
3. Words like `IMPLEMENTATION`, `FINAL`, `COMPLETE` in file names are hints only.
4. When uncertain, keep in implementation and mark `needs-classification`.

---

## 18) Mixed-Content Split Policy

If a single document contains mixed intent, split it before final placement.

Split triggers:
1. Architecture/specification and setup/deployment are in one file.
2. Audit evidence and operational runbook are in one file.
3. Planning roadmap and completed truth are in one file.

Mandatory split mapping:
1. Architecture/spec -> `reference/`
2. Setup/deploy/operations -> `runbooks/`
3. Validation outputs -> `evidence/`
4. In-progress planning -> `Implementation_plans/.../active/`

Post-split rule:
1. Remove original mixed file after links are updated.

---

## 19) Move Transaction Checklist (Atomic)

A move is valid only when all steps are completed in one change set.

1. Pre-check source exists and target folder exists/created.
2. Classify file using Section 17.
3. Move or split file.
4. Update parent README navigation in same change.
5. Update references to old path in same change.
6. Verify file exists at target path.
7. Verify old path is removed/deprecated.
8. Record status in tracker (targeted/moved/split/blocked/deprecated).

If any step fails:
1. Mark operation as `blocked`.
2. Do not mark as completed.

---

## 20) No-Empty-Category Policy

Default rule:
1. Do not keep empty category folders under implementation paths.
2. Create category folders only when first real content file is added.
3. Delete category folders when they become empty after moves.

Optional repository override:
1. Keep empty categories only when an explicit anchor file policy exists.

---

## 21) Tracker Truthfulness Policy

Restructuring plans and trackers must reflect current reality, not historical intention.

Required status vocabulary:
1. `targeted`
2. `moved`
3. `split`
4. `blocked`
5. `deprecated`

Rules:
1. Update tracker entries immediately after each move/split.
2. Remove stale destination paths once actual placement changes.
3. Track intended future destinations explicitly as `targeted`, not `moved`.

---

## 22) Do-Not-Auto-Move Conditions

Automatic/bulk move must stop and require manual review when any condition matches:
1. File ownership or module ownership is ambiguous.
2. Scope is ambiguous (shared vs platform-specific).
3. File includes security, legal, compliance, or data-retention policy content.
4. File has unresolved inbound references from many locations.
5. File mixes implementation planning and completed truth.

Manual review outcome must include explicit classification record from Section 17.

---

## 23) Universal vs Override Boundaries

To remain reusable across repositories:
1. Keep universal rules in core sections.
2. Keep repository-specific constraints in clearly labeled override sections.
3. Never place project-only constraints in universal sections.
4. When porting to another repo, update override sections first, not core rules.

---

## 24) Mandatory Verification Evidence

After each move batch, capture verification evidence.

Minimum required checks:
1. Target files exist.
2. Old source paths are removed or intentionally deprecated.
3. Reference scan for old paths returns expected results.
4. Parent README navigation includes moved docs.
5. Empty categories are removed per Section 20.

Recommended command set (adapt paths per repo):
1. `find docs -type f | sort`
2. `rg -n "old/path|old_filename" docs`
3. `find docs/Implementation_plans -type d -empty | sort`

Repository enforcement command:
1. `npm run docs:validate`
2. CI gate should run `npm run docs:validate:ci`

---

## 25) Rollback and Reclassification Rule

If a move is found wrong after verification:
1. Revert that specific move.
2. Reclassify with Section 17.
3. Reapply move using Section 19.
4. Update tracker status and rationale.

This prevents drift and preserves trust in documentation state.

---

## 26) Cross-Project Reuse Checklist

Before using this guide in a new repository:
1. Define docs root and platform/surface names.
2. Define implementation lifecycle folders.
3. Define repository override sections (security, DB, release constraints).
4. Confirm status vocabulary and tracker location.
5. Confirm no-empty-category behavior for that repo.

After adoption:
1. Enforce Section 17 and Section 19 for every move.
2. Enforce Section 21 for tracker accuracy.
3. Record new generalized rules via Section 16.

---

## 27) Cross-Project Starter Pack (One-Shot Drop-In)

For fast adoption in another repository, use the starter pack document:
- `docs/shared/reference/catalog/CROSS_PROJECT_DOCS_STARTER_PACK.md`

Starter pack scope:
1. Required file set to create in a new repo.
2. Minimal validator checklist for no-drift baseline.
3. Copy/paste snippets for scripts and CI gate.
4. Porting checklist that must be completed before this guide is considered active.

Adoption rule:
1. Copy starter pack and guide together.
2. Complete Section 12.1 customization first.
3. Enable validator + CI before broad team usage.

---

## 28) Implementation Plan Retention Policy (All Plans, Mandatory)

This policy applies to every implementation plan across all categories and platforms.

Rule:
1. Implementation plans are working-state documents and must remain compact.
2. Do not allow unbounded growth of historical narrative in active plans.
3. Keep only decision-relevant evidence in active plan files.

Mandatory retention limits for active plan files:
1. Metrics section: keep latest two automated audit rows only.
2. Changelog section: keep latest two automated update rows only.
3. Snapshot/evidence section: keep latest two capture snapshots only.
4. Historical execution narrative may be trimmed only when those items are `Done` and explicitly `Verified`.
5. Retention trimming must never remove pending, in-progress, blocked, not-started, or unverified implementation items.

Where historical detail must live:
1. Raw run evidence: `docs/Implementation_plans/<platform>/categories/<category>/evidence/` and tool output folders.
2. Completion history: `docs/Implementation_plans/completed/` mirror structure.
3. Durable specification truth: `docs/web/`, `docs/mobile/`, `docs/shared/` per state-machine rules.
4. Category reference summary: reference document related to that category must contain a concise implementation+verification outcome before active-plan removal.

Active-plan minimum content standard:
1. Current status tracker.
2. Explicit implementation structure: phases, subphases, tasks, and ordered execution steps.
3. Per-item status clarity: pending, in-progress, blocked, done, and verification state.
4. Latest two evidences with comparison.
5. Next actions only.

Non-deletion guardrail (mandatory):
1. Do not delete plan items that are not `Done`.
2. Do not delete plan items that are `Done` but not `Verified`.
3. Do not remove completed-and-verified items from active plan until promotion to category reference summary is completed and linked.
4. If compaction is needed, move only completed-and-verified historical detail to evidence/archive while keeping traceable references in the active plan.

Promotion-before-removal contract (mandatory):
1. Identify completed-and-verified item in active plan.
2. Write concise summary into category reference doc using template `docs/shared/reference/catalog/IMPLEMENTATION_PROMOTION_SUMMARY_TEMPLATE.md`.
3. Link that reference summary from active plan/evidence context.
4. Only then remove/compact detailed execution narrative from active plan.
5. If category reference doc does not exist, create it first in the category-aligned reference path and then promote.
6. Promotion record is invalid if template-required fields (task IDs, verification evidence, verified timestamp, impact) are missing.

Anti-patterns (disallowed in active plan files):
1. Multi-hundred-line completed execution diaries.
2. Repeated copy-forward of historical checks after completion.
3. Duplicate evidence already present in evidence folders.

---

## 29) Plan Automation Architecture Recommendation (Project-Wide)

Current state:
1. Single-plan updater scripts are useful but do not scale when multiple plans are auto-created and updated.

Recommended target model:
1. Replace one-off updaters with a generic plan updater engine.
2. Keep thin adapters for domain-specific enrichment when needed.

Recommended structure:
1. Generic engine:
- `scripts/plan_autoupdate.mjs`
2. Shared lifecycle policy module:
- `scripts/lib/plan_retention_policy.mjs`
3. Optional domain adapters:
- `scripts/adapters/supabase_plan_adapter.mjs`
- `scripts/adapters/<domain>_plan_adapter.mjs`

Recommended per-plan contract (in plan frontmatter or companion config):
1. `plan_id`
2. `platform`
3. `category`
4. `retention`: metrics/changelog/snapshots limits
5. `sections`: canonical headers used by the updater
6. `adapter`: optional domain enrichment key

Updater behavior requirements:
1. Idempotent updates.
2. Retention enforcement on every write.
3. Append latest evidence, then prune to policy limits.
4. Never rewrite truth-state docs from implementation updater.
5. Fail-safe behavior when required sections are missing (report and skip, do not corrupt file).

Scope boundary clarification (important):
1. Evidence collectors are domain-specific by design (for example Supabase, RBAC, warranty, mobile telemetry) and may remain separate scripts.
2. Plan-writing, retention, and snapshot-pruning behavior should be centralized in the generic updater layer.
3. A domain script may update one plan only when that domain owns one active master plan.
4. If a domain owns multiple active plans, use the same generic updater with per-plan config and run once per target plan.

Operational workflow recommendation:
1. Create plan from template with retention defaults.
2. Run feature/domain evidence collection.
3. Update corresponding plan through generic updater.
4. Promote completed work to truth docs and archive implementation state.

Validation gate recommendation (pre-commit and CI):
1. Add a docs validator rule that fails if active plans exceed retention policy in automated sections.
2. Add a docs validator rule that flags completed playbook blocks in active plans.
3. Keep a machine-readable report for drift fixes.

Migration recommendation for existing plans:
1. Introduce policy in this guide first (done).
2. Normalize active plans to retention policy with one-time cleanup.
3. Move historical details to evidence/completed paths.
4. Migrate single-plan scripts to generic engine incrementally.

Decision statement:
1. `supabase_plan_autoupdate.mjs` should be treated as transitional.
2. New automation investment should go to generic multi-plan updater architecture.

---

## 30) Mandatory Plan Update Protocol (All Plans, Human and AI)

Trigger:
1. Any instruction such as "update this plan accordingly" after a fix, verification, rollout, or rollback.

Required pre-read gate (must happen before editing the target plan):
1. Read the target active plan fully enough to identify current phase/status/evidence sections.
2. Read all directly linked references in that plan that affect status truth:
- sibling implementation docs in same category (`active/`, `evidence/`, `inactive/`)
- platform tracker and platform index
- relevant truth/evidence/runbook docs referenced by path
3. Read referenced validation outputs used as decision evidence (SQL checks, test reports, audit artifacts).
4. If any referenced source is missing or stale, mark the update as partial and record the gap explicitly.

Required update scope gate (do not update one line only):
1. Update status/phase rows impacted by the fix.
2. Update evidence summary with latest comparison/result.
3. Update change log/metrics entries when applicable.
4. Update next actions to reflect the new state.
5. Enforce retention policy limits after update (latest two automated rows/snapshots only).
6. Preserve incomplete work visibility: pending/in-progress/blocked/unverified rows must remain in the active plan.
7. Preserve plan structure: phase -> subphase -> task -> prioritized ordered steps.
8. For any item becoming `Done` and `Verified`, perform promotion-before-removal to category reference doc in same update transaction.
9. Use `docs/shared/reference/catalog/IMPLEMENTATION_PROMOTION_SUMMARY_TEMPLATE.md` for every promotion summary so format stays identical across categories.

Cross-file consistency gate (same change set):
1. Update platform tracker entry when plan status changes.
2. Update platform/category index links if plan path/state changes.
3. Ensure no contradiction between active plan and linked evidence docs.
4. Ensure promoted reference summary path is present and linked when completed items are compacted from active plan.

Verification gate (required):
1. Run docs plan retention validation (`npm run docs:validate:plans`).
2. If domain has additional verification command, run it and record outcome in change log/evidence.
3. If verification cannot be run, document that limitation in the plan update note.

Completion standard:
1. A plan update request is considered complete only when linked-reference sweep, scoped updates, consistency sync, and validation gates are all satisfied.

---

## 31) Timezone Standard (Project-Wide)

Default timezone for documentation:
1. All human-readable timestamps in project docs must be written in IST.
2. Use explicit suffix `IST` in timestamp text.

Formatting standard:
1. Preferred format: `YYYY-MM-DD HH:mm:ss IST`.
2. Date-only fields may use `YYYY-MM-DD` when time is not needed.

Automation rule:
1. Any script that writes timestamps into docs must emit IST-formatted values.
2. If source evidence is UTC, convert to IST before writing to plan/change-log/snapshot text.

Optional traceability rule:
1. Raw artifact filenames may remain machine-native (for example UTC-based run directories).
2. Human-facing narrative in docs must still present IST time.

---

**Review Frequency:** every 6 months or when new categories are introduced  
**Owner:** Techwheels Development Team