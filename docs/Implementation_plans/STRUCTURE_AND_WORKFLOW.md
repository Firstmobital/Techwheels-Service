# Implementation Plans Structure and Workflow (Authoritative)

Last Updated: 2026-06-18
Status: ACTIVE AUTHORITY
Owner: Techwheels Product + Engineering + GitHub Copilot

---

## 1) Purpose

This document defines the mandatory placement workflow for every new or migrated plan in `docs/Implementation_plans`.

Primary goals:
1. No guesswork for file placement.
2. No scope drift between mobile and web workstreams.
3. Consistent lifecycle from active planning to completed archive.
4. Copilot-safe structure for long-term business continuity.

---

## 2) Canonical Folder Structure

Only two live workstream roots are allowed:
1. `docs/Implementation_plans/mobileversion/`
2. `docs/Implementation_plans/webversion/`

Completed plans must be archived under:
1. `docs/Implementation_plans/completed/mobileversion/`
2. `docs/Implementation_plans/completed/webversion/`

Each workstream uses category folders with status subfolders:
- `categories/<category>/active/`
- `categories/<category>/evidence/`
- `categories/<category>/inactive/`

Same structure is mirrored under `completed/`.

---

## 3) Decision Tree for Any New .md Plan

Follow this in order:

1. Decide platform scope.
- If plan is mobile app specific, use `mobileversion`.
- If plan is web app or backend-for-web specific, use `webversion`.
- If truly cross-platform, create one source-of-truth under the primary owner platform and link from the other platform index.

2. Decide category.
- Mobile categories: `auth`, `autodoc`, `core-shell`, `import`, `operations`, `reports`, `redesign`.
- Web categories: `autodoc`, `bodyshop`, `complaints`, `drive`, `import`, `operations`, `rbac`, `reception`, `redesign`, `supabase`, `warranty`.
- If no category fits, create a new category folder in both live and completed mirrors before adding files.

3. Decide lifecycle state folder.
- New execution plan or active tracker: `active/`
- Audits, QA output, screenshots, verification notes: `evidence/`
- Paused or superseded (not completed): `inactive/`

4. Create or update platform index and tracker.
- Add the file to the platform `INDEX.md`.
- Add status row to platform `IMPLEMENTATION_TRACKER.md`.

---

## 4) Completion and Archive Rule

A plan can move to `completed/` only when all are true:
1. Implementation done.
2. Validation/testing done.
3. Owner sign-off recorded in the plan body.

Move operation rules:
1. Move from `mobileversion/categories/...` to matching path in `completed/mobileversion/categories/...`.
2. Move from `webversion/categories/...` to matching path in `completed/webversion/categories/...`.
3. Do not flatten category path during archive.
4. Update both platform tracker and completed index links in the same change.

---

## 5) Naming Convention

Use uppercase ID prefix and searchable title:
- Mobile: `MOBILE-###_SHORT_TITLE.md`
- Web: `WEB-###_SHORT_TITLE.md` or existing domain prefix when established (for example `RBAC-###`, `SUPABASE-###`)

Optional suffixes:
- `_TRACKER.md`
- `_AUDIT.md`
- `_TEST_REPORT.md`

Avoid generic names like `notes.md` or `plan.md`.

---

## 6) Mandatory Control Files

Required files and ownership:
1. Root authority files:
- `docs/Implementation_plans/INDEX.md`
- `docs/Implementation_plans/IMPLEMENTATION_TRACKER.md`
- `docs/Implementation_plans/STRUCTURE_AND_WORKFLOW.md`

2. Mobile authority files:
- `docs/Implementation_plans/mobileversion/INDEX.md`
- `docs/Implementation_plans/mobileversion/IMPLEMENTATION_TRACKER.md`

3. Web authority files:
- `docs/Implementation_plans/webversion/INDEX.md`
- `docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md`

4. Archive authority file:
- `docs/Implementation_plans/completed/INDEX.md`

---

## 7) Copilot Workflow Contract

When creating or moving a plan file, Copilot must:
1. Place file using this structure only.
2. Update relevant platform index and tracker in same session.
3. Never guess category; if ambiguous, classify by module ownership and route location.
4. Never leave new plans in root `docs/Implementation_plans/`.
5. Preserve historical links by adding migration notes when paths change.

---

## 8) Migration Policy for Existing Legacy Folders

Legacy category roots (for example `mobile/`, `rbac/`, `supabase/`) can remain during staged migration.

Migration mode:
1. New files must go only into `mobileversion/` or `webversion/` structure.
2. Existing files may be moved in controlled batches.
3. Each batch must update links and trackers immediately.

This avoids broken references while transitioning to the new long-term model.
