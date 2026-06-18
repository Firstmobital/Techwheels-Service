# Documentation Placement Guide

**Authority:** `docs/STRUCTURE_GUIDE.md`  
**Last Updated:** 2026-06-18

This guide ensures every markdown file in `docs/` is placed in the correct primary category and subcategory folder.

## Quick Start: The 3-Level Hierarchy

Every markdown file follows this structure:

```
docs/
├── <primary_category>/          [11 total]
│   ├── README.md                [category scope anchor]
│   └── <subcategory>/           [active/, reference/, evidence/, runbooks/, catalog/]
│       └── <filename>.md        [your document]
```

**Example paths:**
- `docs/complaints/reference/COMPLAINT_SLA_POLICY.md`
- `docs/supabase/evidence/DB_AUDIT_2026-06-18.md`
- `docs/security/runbooks/INCIDENT_RESPONSE_PROCEDURE.md`

## 11 Primary Categories

### 1. **Implementation_plans** (Platform-Specific)
**Purpose:** Feature execution roadmaps and implementation trackers

**Platform Differentiation:**
- Mobile features → `mobileversion/categories/<topic>/<lifecycle>/`
- Web features → `webversion/categories/<topic>/<lifecycle>/`
- Completed work → `completed/<topic>/`

**Examples:**
- `docs/Implementation_plans/mobileversion/categories/auth/active/MOBILE_AUTH_PLAN.md`
- `docs/Implementation_plans/webversion/categories/complaints/active/COMPLAINTS_IMPLEMENTATION.md`
- `docs/Implementation_plans/completed/rbac/RBAC_ROLLOUT_SUMMARY.md`

---

### 2. **Project_Handbook** (Shared)
**Purpose:** Durable architecture, policy handbooks, governance decisions

**Typical subfolders:**
- `reference/` — Policy documents, architecture decisions, governance rules
- `active/` — Current handbooks, evolving guidance
- `runbooks/` — Operational procedures

**Examples:**
- `docs/Project_Handbook/reference/DB_CHANGE_PROTOCOL.md`
- `docs/Project_Handbook/active/ONBOARDING_POLICY.md`
- `docs/Project_Handbook/runbooks/SYNC_PROTOCOL.md`

---

### 3. **Project_Instructions** (Shared)
**Purpose:** Contributor guides, agent contracts, playbook instructions

**Typical subfolders:**
- `active/` — Current contributor workflows, evolving guides
- `reference/` — Stable instruction contracts, governance docs

**Examples:**
- `docs/Project_Instructions/active/MOBILE_CONTRIBUTOR_SETUP.md`
- `docs/Project_Instructions/reference/DOCS_PLACEMENT_GUIDE.md` ← You are here

---

### 4. **autodoc** (Shared)
**Purpose:** AutoDoc feature specification, operations, execution

**Typical subfolders:**
- `active/` — Current AutoDoc initiatives
- `evidence/` — Execution reports, test results
- `reference/` — AutoDoc specs, configuration guides

**Examples:**
- `docs/autodoc/evidence/AUTODOC_EXECUTION_STATUS_2026-05.md`
- `docs/autodoc/reference/AUTODOC_RATE_LOOKUP_SPEC.md`

---

### 5. **complaints** (Shared)
**Purpose:** Complaints system authority, reference, specifications

**Typical subfolders:**
- `reference/` — Schema authority, system specs, policies
- `evidence/` — Test reports, audit results

**Examples:**
- `docs/complaints/reference/COMPLAINTS_SCHEMA_AUTHORITY.md`
- `docs/complaints/reference/COMPLAINT_WORKFLOW_SPEC.md`

---

### 6. **rbac** (Shared)
**Purpose:** Role-Based Access Control runbooks, policies, evidence

**Typical subfolders:**
- `runbooks/` — RBAC implementation procedures
- `reference/` — RBAC authority, policies, decision records
- `evidence/` — Audit reports, validation results

**Examples:**
- `docs/rbac/runbooks/ADMIN_BYPASS_RLS_GOVERNANCE.md`
- `docs/rbac/reference/RBAC_MASTER_PLAN.md`

---

### 7. **security** (Shared)
**Purpose:** Security policies, incident response, best practices

**Typical subfolders:**
- `reference/` — Security policies, compliance frameworks
- `runbooks/` — Incident response, security procedures

**Examples:**
- `docs/security/reference/DATA_ENCRYPTION_POLICY.md`
- `docs/security/runbooks/INCIDENT_RESPONSE_PROCEDURE.md`

---

### 8. **supabase** (Shared)
**Purpose:** Supabase/database operations, schema, evidence

**Typical subfolders:**
- `evidence/` — DB audits, migration reports, validation results
- `reference/` — Database schema authority, connection specs
- `runbooks/` — Backup/restore procedures, maintenance guides

**Examples:**
- `docs/supabase/evidence/DB_AUDIT_2026-06-18.md`
- `docs/supabase/reference/DATABASE_SCHEMA.md`

---

### 9. **uploads** (Shared)
**Purpose:** Upload feature specification, operations, troubleshooting

**Typical subfolders:**
- `reference/` — Upload specs, configuration guides
- `evidence/` — Test reports, performance metrics
- `runbooks/` — Troubleshooting guides, maintenance procedures

**Examples:**
- `docs/uploads/reference/UPLOAD_FEATURE_SPEC.md`
- `docs/uploads/evidence/UPLOAD_PERFORMANCE_TEST_2026-06.md`

---

### 10. **wa_templates** (Shared)
**Purpose:** WhatsApp message templates, catalog, examples

**Typical subfolders:**
- `catalog/` — Template examples, reusable templates
- `reference/` — Template guidelines, naming conventions

**Examples:**
- `docs/wa_templates/catalog/JOB_CARD_COMPLETED_TEMPLATE.md`
- `docs/wa_templates/reference/TEMPLATE_NAMING_CONVENTION.md`

---

### 11. **warranty** (Shared)
**Purpose:** Warranty system documentation, evidence, audits

**Typical subfolders:**
- `evidence/` — Warranty audit reports, test results
- `reference/` — Warranty policy, schema authority

**Examples:**
- `docs/warranty/evidence/WARRANTY_AUDIT_2026-06.md`
- `docs/warranty/reference/WARRANTY_POLICY.md`

---

## Standard Subcategories

Choose the most appropriate subcategory for your file type:

| Subcategory | Use For | Examples |
|-------------|---------|----------|
| **`active/`** | Current live docs, ongoing initiatives, evolving guidance | Current trackers, active plans, contributor guides in development |
| **`reference/`** | Authority specs, policies, governance decisions, architecture docs | Specs, policies, schema authority, decision records, stable guides |
| **`evidence/`** | Test results, audit reports, validation outcomes | Audit reports, performance tests, execution summaries, test results |
| **`runbooks/`** | Step-by-step procedures, how-to guides, operational workflows | Incident response, backup procedures, troubleshooting guides |
| **`catalog/`** | Templates, reusable patterns, template collections | Template examples, code templates, design patterns |

---

## How to Decide: The Decision Tree

**Step 1: What is the purpose of your document?**

- **Planning/Roadmap for a feature?**
  → Go to **Implementation_plans** (choose mobile or web)

- **System authority/spec/policy (applies to both platforms)?**
  → Go to appropriate category based on system (supabase, rbac, complaints, etc.)

- **Contributor/contributor instructions?**
  → Go to **Project_Instructions**

- **Durable governance/architecture handbook?**
  → Go to **Project_Handbook**

**Step 2: What is the document type?**

- **Planning/roadmap?** → `Implementation_plans` (mobileversion/webversion/completed)
- **Policy/authority/spec?** → `reference/` subcategory
- **Operational procedure/how-to?** → `runbooks/` subcategory
- **Test result/audit/validation?** → `evidence/` subcategory
- **Template/example/reusable?** → `catalog/` subcategory
- **Current/evolving?** → `active/` subcategory

---

## Real-World Examples

### Example 1: New RBAC procedure document
**Question:** What system? → RBAC  
**Question:** What type? → Procedure/how-to  
**Answer:** `docs/rbac/runbooks/NEW_PROCEDURE.md`

### Example 2: New mobile feature plan
**Question:** What system? → Feature planning  
**Question:** Mobile or web? → Mobile  
**Answer:** `docs/Implementation_plans/mobileversion/categories/<topic>/active/PLAN.md`

### Example 3: Database audit report
**Question:** What system? → Supabase/database  
**Question:** What type? → Test/audit result  
**Answer:** `docs/supabase/evidence/AUDIT_2026-06-18.md`

### Example 4: Contributor onboarding guide
**Question:** What system? → Instructions  
**Question:** What type? → Current guide  
**Answer:** `docs/Project_Instructions/active/ONBOARDING_GUIDE.md`

### Example 5: Security incident response playbook
**Question:** What system? → Security  
**Question:** What type? → Operational procedure  
**Answer:** `docs/security/runbooks/INCIDENT_RESPONSE.md`

### Example 6: WhatsApp template example
**Question:** What system? → wa_templates  
**Question:** What type? → Template example  
**Answer:** `docs/wa_templates/catalog/JOB_COMPLETED_TEMPLATE.md`

---

## Special Cases

### Implementation_plans: Platform-First Structure
Implementation_plans is **the only category** with platform differentiation:

```
docs/Implementation_plans/
├── mobileversion/categories/<topic>/<lifecycle>/     [Mobile-specific plans]
├── webversion/categories/<topic>/<lifecycle>/        [Web-specific plans]
├── completed/<topic>/                                [Completed work (both platforms)]
├── IMPLEMENTATION_TRACKER.md                         [Category-level tracker - allowed at root]
├── INDEX.md                                          [Category-level index - allowed at root]
├── TEMPLATE.md                                       [Governance template]
└── STRUCTURE_AND_WORKFLOW.md                         [Governance doc]
```

**All other categories** use a flat, non-platform-specific structure.

### Category-Level Files (Rare)
Only category-level README files are allowed at the category root:

```
docs/<category>/README.md  ← Category scope and structure (allowed)
docs/<category>/TRACKER.md ← NOT allowed (must go in subcategory)
```

### Root-Level Authority Files (3 Only)
Only these files are allowed at `docs/` root:

- `docs/README.md` — Top-level docs overview
- `docs/MASTER_INDEX.md` — Navigation hub
- `docs/STRUCTURE_GUIDE.md` — This governance contract

---

## Validation Checklist

Before creating or moving a markdown file, verify:

- [ ] **Primary category identified** (one of 11)
- [ ] **Subcategory chosen** (active/, reference/, evidence/, runbooks/, catalog/)
- [ ] **File path follows pattern:** `docs/<primary>/<subcategory>/<filename>.md`
- [ ] **No category-root content files** (only README.md allowed at category root)
- [ ] **No new root-level files** (only 3 authority files allowed)
- [ ] **Links use canonical paths** (no old/stale references)

---

## Questions?

Refer to:
- **Full authority:** `docs/STRUCTURE_GUIDE.md`
- **Navigation hub:** `docs/MASTER_INDEX.md`
- **Docs overview:** `docs/README.md`

---

**Last Verified:** 2026-06-18  
**Applies To:** All markdown files in `docs/`
