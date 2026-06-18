# Documentation Structure Guide

Last Updated: 2026-06-18
Owner: Techwheels Development Team
Status: Active Authority for docs/ placement

---

## 1) Purpose

This guide standardizes all markdown placement under `docs/` using a strict hierarchy:

1. Primary category
2. Subcategory
3. Optional sub-subcategory

Outcome:
1. Every `.md` has one correct home.
2. New docs are deterministic to place.
3. Future re-org work stays minimal.

---

## 2) Canonical Hierarchy

### 2.1 Primary categories (level 1)

Allowed primary categories under `docs/`:

1. `Implementation_plans`
2. `Project_Handbook`
3. `Project_Instructions`
4. `autodoc`
5. `complaints`
6. `rbac`
7. `security`
8. `supabase`
9. `uploads`
10. `wa_templates`
11. `warranty`

Rule:
- Root `docs/` should contain only authority/index files and primary category folders.
- Non-index markdown files should not remain directly in `docs/` root.

### 2.2 Standard subcategories (level 2)

Use these subfolders where applicable:

1. `active/` - live docs, trackers, current plans
2. `evidence/` - audits, tests, verifications
3. `runbooks/` - procedures and operational steps
4. `reference/` - specs/authority material
5. `catalog/` - reusable templates/library docs

### 2.3 Optional sub-subcategories (level 3)

Examples:

1. `evidence/runbooks/`
2. `categories/<module>/active|evidence|inactive`

Use only when needed for scale. Do not nest without purpose.

---

## 3) Implementation Plans Contract (special primary category)

`docs/Implementation_plans/` uses platform-first governance:

1. `mobileversion/`
2. `webversion/`
3. `completed/`

Each platform contains category folders with lifecycle:

- `categories/<category>/active/`
- `categories/<category>/evidence/`
- `categories/<category>/inactive/`

Authority file:
- `docs/Implementation_plans/STRUCTURE_AND_WORKFLOW.md`

---

## 4) Placement Decision Tree (for any new .md)

1. Is this an execution plan/tracker tied to delivery?
- Yes -> `docs/Implementation_plans/...`
- No -> continue

2. Is this durable project governance/architecture policy?
- Yes -> `docs/Project_Handbook/`
- No -> continue

3. Is this an instruction/process contract for contributors/agents?
- Yes -> `docs/Project_Instructions/`
- No -> continue

4. Is this module/domain operational content?
- Place in matching primary category (for example `docs/supabase/`, `docs/rbac/`, `docs/warranty/`, etc.)

5. Pick subcategory by document type:
- live -> `active/`
- validation -> `evidence/`
- procedure -> `runbooks/`
- authority/spec -> `reference/`
- template library -> `catalog/`

---

## 5) Naming Rules

1. Use descriptive, searchable names.
2. Keep plan IDs for implementation docs (`MOBILE-`, `RBAC-`, `SUPABASE-`, etc.).
3. Use date suffix for audit snapshots when needed (`_YYYY-MM-DD` or `_YYYYMMDD`).
4. Avoid generic names (`notes.md`, `new.md`, `temp.md`).

---

## 6) Link Management Rules

1. Use relative links.
2. After moving files, update all references in same change.
3. Validate moved-path references with ripgrep before closing:

```bash
rg -n "old/path/file.md|old/path/" docs
```

---

## 7) Current Baseline (2026-06-18)

Applied reorganization updates:

1. Root complaint docs moved to:
- `docs/complaints/reference/COMPLAINTS_SCHEMA_AUTHORITY.md`
- `docs/complaints/reference/COMPLAINTS_TEST_EXECUTION_GUIDE.md`

2. Supabase comparison doc moved to:
- `docs/supabase/evidence/DB_CODE_COMPARISON_9JUNE_VS_CURRENT_2026-06-11.md`

3. WhatsApp template entry moved to:
- `docs/wa_templates/catalog/sa_floor_completed_wa.md`

4. New primary category initialized:
- `docs/Project_Instructions/`

---

## 8) Governance Rule for Future Work

For every markdown create/move operation, do all three in same session:

1. Place file in canonical path.
2. Update nearest category `README.md` or index.
3. Fix stale links and verify with search.

