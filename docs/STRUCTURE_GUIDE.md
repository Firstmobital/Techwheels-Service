# Documentation Structure Guide

**Purpose:** Keep all docs organized by category and function so nothing gets lost and links always work.

**Last Updated:** 2026-06-08  
**Owner:** Techwheels Development Team

---

## Folder Structure (Both `docs/` and `docs/Implementation_plans/`)

```
docs/
├── STRUCTURE_GUIDE.md              (This file)
├── Project_Handbook/               (Design decisions, policies, contracts)
│   ├── MODULE_ROUTE_CONTRACT.md
│   ├── ROUTE_STRATEGY_DECISION.md
│   ├── ONBOARDING_POLICY.md
│   └── ... (no subfolders here)
│
├── Implementation_plans/           (Plans tied to specific projects/features)
│   ├── INDEX.md
│   ├── IMPLEMENTATION_TRACKER.md
│   ├── TEMPLATE.md
│   │
│   ├── autodoc/
│   │   ├── README.md
│   │   ├── evidence/                (Audit reports, test results)
│   │   ├── runbooks/                (Operation procedures, guides)
│   │   └── active/                  (Active plans, masters)
│   │
│   ├── supabase/
│   │   ├── README.md
│   │   ├── active/                  (SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md)
│   │   ├── evidence/                (Audit reports, analysis, verification)
│   │   └── runbooks/                (Operational checklists)
│   │
│   ├── mobile/
│   │   ├── README.md
│   │   ├── active/                  (MOBILE-001, 005, 006, 007, 008, 009)
│   │   ├── evidence/                (Checklists, architecture docs, feature maps)
│   │   └── runbooks/
│   │
│   ├── rbac/
│   │   ├── README.md
│   │   ├── active/                  (RBAC_IMPLEMENTATION_MASTER_2026-06-01.md)
│   │   ├── evidence/                (Test plans, audit docs)
│   │   └── runbooks/
│   │
│   ├── warranty/
│   │   ├── README.md
│   │   ├── active/                  (WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md)
│   │   └── evidence/
│   │
│   ├── completed/                   (Finished plans, archived)
│   │   ├── autodoc/
│   │   ├── supabase/
│   │   ├── rbac/
│   │   └── ... (mirrored category structure)
│   │
│   └── ... (other categories: bodyshop/, drive/, import/, operations/, reception/, redesign/)
│
├── uploads/                         (Next-day upload feature docs, root-level operation)
│   ├── README.md
│   ├── active/                      (INDEX_NEXT_DAY_UPLOADS.md, README_NEXT_DAY_UPLOADS.md, IMPLEMENTATION_ROADMAP.md)
│   ├── runbooks/                    (NEXT_DAY_UPLOAD_GUIDE.md, COPY_PASTE_CODE.md)
│   └── evidence/                    (VISUAL_GUIDE.md, UPLOAD_LOGIC_REFACTOR.md, VAS_DEDUPLICATION_FIX.md, UPLOAD_TEMPLATE_CODE.md)
│
├── rbac/                            (RBAC operation docs, root-level reference)
│   ├── README.md
│   ├── runbooks/                    (RBAC_OPERATIONS_RUNBOOK.md)
│   └── evidence/                    (RBAC_ROLE_MATRIX_TESTING.md, RBAC_SECURITY_TESTING.md, RBAC_TABLE_ACCESS_VALIDATION_TESTS.md, RBAC-001_IMPLEMENTATION_COMPLETE.md)
│
├── autodoc/                         (AutoDoc operation docs, root-level reference)
│   ├── README.md
│   ├── evidence/                    (RC_LOOKUP_FORMAT_TEST_REPORT.md)
│   └── runbooks/                    (WEB_AUTODOC_GPS_TESTING_GUIDE.md)
│
├── warranty/                        (Warranty operation docs, root-level reference)
│   ├── README.md
│   └── evidence/                    (CRITICAL_ALERTS_AUDIT_20260603.md, EARNINGS_ZERO_VALIDATION.md)
│
├── supabase/                        (Supabase operation docs, root-level reference)
│   ├── README.md
│   └── evidence/                    (MIGRATION_VERIFICATION_20260523.md)
│
├── security/                        (Security reference docs)
│   ├── README.md
│   └── reference/                   (SECURITY_REFACTOR_REFERENCE.md)
│
└── completed/                       (Completed operation docs, legacy archive)
    ├── ... (mirrored structure to docs/ categories)
    └── (Use sparingly; prefer keeping active docs in root)
```

---

## How to Classify a New Document

### Decision Tree

```
1. Is this document tied to a specific implementation plan (e.g., MOBILE-001, SUPABASE-001)?
   YES → Place in docs/Implementation_plans/<CATEGORY>/ ↓
   NO  → Is this a standalone operation/reference doc? → Place in docs/<CATEGORY>/ ↓

2. What type of document is it?
   ├─ Active Plan or Master Tracker       → <CATEGORY>/active/
   ├─ Evidence, Audit, Test Report        → <CATEGORY>/evidence/
   ├─ Runbook, Procedure, How-To Guide    → <CATEGORY>/runbooks/
   ├─ Reference, Design Decision, Policy  → <CATEGORY>/reference/ (or Project_Handbook/)
   └─ Completed/Archived Plan             → <CATEGORY>/completed/ or completed/<CATEGORY>/

3. Is the category folder already defined?
   NO → Create it with subfolders (active/, evidence/, runbooks/, README.md)
   YES → Place doc in appropriate subfolder
```

### Document Type Definitions

| Type | Purpose | Examples |
|------|---------|----------|
| **Active** | Current plan or master tracker being worked on | MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md, SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md |
| **Evidence** | Audit reports, test results, analysis, verification | RBAC_ROLE_MATRIX_TESTING.md, MIGRATION_VERIFICATION_20260523.md, CRITICAL_ALERTS_AUDIT_20260603.md |
| **Runbooks** | Operational procedures, how-to guides, checklists | RBAC_OPERATIONS_RUNBOOK.md, NEXT_DAY_UPLOAD_GUIDE.md, WEB_AUTODOC_GPS_TESTING_GUIDE.md |
| **Reference** | Design decisions, policy documents, contracts | ROUTE_STRATEGY_DECISION.md, ONBOARDING_POLICY.md, MODULE_ROUTE_CONTRACT.md |

---

## Naming Conventions

1. **Use descriptive names**, not generic placeholders:
   - ✅ `RBAC_OPERATIONS_RUNBOOK.md`
   - ❌ `README.md` (unless it's a category index)

2. **Include plan IDs when relevant:**
   - ✅ `MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md`
   - ✅ `SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md`

3. **Use dates for time-sensitive docs:**
   - ✅ `CRITICAL_ALERTS_AUDIT_20260603.md`
   - ✅ `MIGRATION_VERIFICATION_20260523.md`

4. **Use underscores, not hyphens, for word separation in filenames**

---

## Link Management

### When Creating Links to Other Docs

1. **Use relative paths** (not absolute) from the doc's location:
   ```
   docs/rbac/evidence/RBAC_ROLE_MATRIX_TESTING.md 
     → to RBAC_OPERATIONS_RUNBOOK.md: `../runbooks/RBAC_OPERATIONS_RUNBOOK.md`
     → to ROUTE_STRATEGY_DECISION.md: `../../Project_Handbook/ROUTE_STRATEGY_DECISION.md`
   ```

2. **Include anchors and query params as-is:**
   ```markdown
   [Chapter 2](./IMPLEMENTATION_ROADMAP.md#phase-2-routing--navigation-setup)
   ```

3. **After moving a doc, update ALL references** to it across the codebase and docs.

---

## Category Reference

### Implementation Plans Categories

| Category | Purpose | Master Plan |
|----------|---------|-------------|
| `autodoc` | AutoDoc mobile/web feature implementation | (In planning) |
| `bodyshop` | Bodyshop module end-to-end workflow | BODYSHOP-001 |
| `drive` | Google Drive upload offload | DRIVE-001 |
| `import` | CSV import and next-day upload features | (In planning) |
| `mobile` | Techwheels Mobile App (Expo) | MOBILE-001, 005-009 |
| `rbac` | Role-based access control hardening | RBAC_IMPLEMENTATION_MASTER_2026-06-01 |
| `reception` | Reception module implementation | RECEPTION-001 |
| `redesign` | Web redesign parity tracker | Webredesign_IMPLEMENTATION_PLAN_MASTER_TRACKER |
| `supabase` | Supabase production hardening | SUPABASE-001 |
| `warranty` | Warranty import and reporting | WARRANTY-001 |

### Root Docs Categories

| Category | Purpose |
|----------|---------|
| `autodoc` | AutoDoc operation guides and test reports |
| `rbac` | RBAC operation procedures and test plans |
| `uploads` | Next-day upload feature guides and code samples |
| `warranty` | Warranty audits and validation reports |
| `supabase` | Supabase migration verification and evidence |
| `security` | Security design and reference materials |

---

## Template Checklist for New Docs

```markdown
# [Document Title]

**Date Created:** YYYY-MM-DD  
**Category:** [autodoc / mobile / rbac / supabase / warranty / etc.]  
**Type:** [Active Plan / Evidence / Runbook / Reference]  
**Status:** [In Progress / Complete / Review / Blocked]  
**Owner:** [Name or Team]

---

## Overview
[1-2 sentence description of document purpose]

---

## Key Sections
[Main content]

---

## Related Documentation
- [Link to related doc](../path/to/doc.md)
- [Link to plan](../../Implementation_plans/category/active/PLAN.md)

---

**Last Updated:** YYYY-MM-DD by [Author]  
**Next Review:** YYYY-MM-DD
```

---

## FAQ

**Q: Should I put a completed plan in `Implementation_plans/completed/` right away?**  
A: No. Keep active plans in `<category>/active/` until the plan itself is fully done. Only move to `completed/` when the entire project/phase is finished.

**Q: Can I create a doc outside these categories?**  
A: Only if it's truly standalone (e.g., a global migration guide). Check with the team first. Prefer categorizing.

**Q: What if a doc doesn't fit neatly?**  
A: Choose the closest category and explain the decision in the doc header. Update this guide if a new category pattern emerges.

**Q: Who updates the links when I move a doc?**  
A: Whoever moves the doc must search for and update all references. Use `grep` or your editor's search-and-replace.

---

**Maintained by:** Techwheels Development Team  
**Version:** 1.0  
**Adopted:** 2026-06-08
