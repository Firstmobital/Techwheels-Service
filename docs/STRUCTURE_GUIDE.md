# Documentation Structure Guide - Truth/Implementation State Machine Model

**Last Updated:** 2026-06-23  
**Authority:** Techwheels Development Team  
**Status:** Active - Governs all docs/ placement and state transitions

---

## 1) Core Concept: Truth vs Implementation State Machine

Techwheels documentation follows a **two-state model**:

### **TRUTH STATE** (Current Documented Reality)
- What exists now: completed implementations, validated specifications, verified architecture
- Three tiers: **Platform-specific** (web, mobile) + **Shared** (both platforms)
- Location: `docs/web/`, `docs/mobile/`, `docs/shared/`
- Authority: This is the single source of truth for each platform and shared concepts
- Update frequency: Only when implementation is actually completed and committed

### **IMPLEMENTATION STATE** (Uncommitted Work & Planned Changes)
- What is being worked on: execution plans, feature designs, implementation roadmaps
- Organized by **platform + category + lifecycle**
- Location: `docs/Implementation_plans/webversion/`, `docs/Implementation_plans/mobileversion/`
- Purpose: Track planned work until it becomes truth
- Lifecycle: active → evidence (testing completed) → completed (implementation done)

### **STATE TRANSITION (Critical Workflow)**
```
Implementation Plan Created
    ↓
docs/Implementation_plans/webversion/categories/feature/active/FEATURE_PLAN.md
    ↓
[Development Work Happens]
    ↓
Move to Evidence (tests written)
docs/Implementation_plans/webversion/categories/feature/evidence/FEATURE_TEST_REPORT.md
    ↓
[Feature Completed & Merged]
    ↓
1. Archive implementation: docs/Implementation_plans/completed/feature/
2. Update truth docs: docs/web/modules/feature/reference/FEATURE_SPEC.md
3. Delete from Implementation_plans/webversion/ (no longer needed)
4. NEW TRUTH ESTABLISHED ✓
```

**Anti-Duplication Rule:** Once implementation moves to truth, remove from Implementation_plans

---

## 2) Directory Hierarchy

### 2.1 Root Level (Meta & Governance)

```
docs/
├── README.md                          [Navigation hub - lists all sections]
├── MASTER_INDEX.md                    [Searchable index of all docs]
├── STRUCTURE_GUIDE.md                 [This file - placement rules]
├── DOCS_IMPACT_MATRIX.md              [Audit: which docs affect what]
└── DOCS_DEDUP_CONFLICT_MATRIX_*.md    [Audit: doc duplication analysis]
```

**Rule:** Only meta/governance files at root. No content documentation.

### 2.2 Shared Truth State (Both Platforms)

Applies to **web AND mobile equally**. Use when:
- Rule, policy, or protocol applies to both platforms
- Architectural decision affects both platforms
- Shared templates, procedures, or specifications

```
docs/shared/
├── README.md                          [Anchor: scopes to shared truth]
├── reference/                         [Authoritative specifications & decisions]
│   ├── CURRENT_STATE.md               [Truth about current state]
│   ├── DB_CHANGE_PROTOCOL.md          [How database changes are managed]
│   ├── SYNC_PROTOCOL.md               [Module sync/state contract]
│   ├── MODULE_ROUTE_CONTRACT.md       [Route & module architecture]
│   ├── ROUTE_STRATEGY_DECISION.md     [Architectural decisions]
│   ├── ONBOARDING_POLICY.md           [User onboarding specification]
│   ├── DB_CHANGE_LEDGER.md            [Specification: database changes]
│   └── catalog/
│       └── UPDATE_TEMPLATE.md         [Reusable template]
├── runbooks/                          [Operational procedures shared by both]
│   └── ONBOARDING_GATING_ENFORCEMENT.md [Procedure: enforce onboarding gates]
└── active/                            [Live tracking across both platforms]
    └── CHANGE_LOG.md                  [Shared changelog]
```

**Subcategories:**
- `reference/` → specifications, decisions, policies (immutable authority)
- `runbooks/` → procedures, operational guides
- `active/` → live tracking, changelogs
- `catalog/` → reusable templates and libraries

### 2.3 Web Platform Truth State

```
docs/web/
├── README.md                          [Anchor: scopes to web documentation]
├── modules/                           [Web-specific implementations]
│   ├── autodoc/
│   │   ├── README.md
│   │   ├── reference/                 [Spec: API contract, data model]
│   │   ├── evidence/                  [Tests: validation reports]
│   │   └── runbooks/                  [Procedures: how to use/debug]
│   ├── complaints/
│   ├── telecalling/
│   ├── warranty/
│   └── [other modules as needed]
└── cross-cutting/                     [Web infrastructure & shared systems]
    ├── rbac/
    │   ├── README.md
    │   ├── reference/                 [Web RLS policies]
    │   ├── evidence/                  [Validation: security tests]
    │   └── runbooks/                  [Procedures: debugging RLS]
    ├── supabase/
    │   ├── reference/                 [DB schemas, migrations]
    │   ├── evidence/                  [Audit: DB validation]
    │   └── runbooks/                  [Procedures: DB operations]
    ├── security/
    ├── uploads/
    ├── wa_templates/
    └── [other cross-cutting as needed]
```

**Pattern:** `docs/web/<domain>/README.md` + subfolders for subcategories

**Domain Types:**
- **modules/** → Standalone features (autodoc, complaints, telecalling, warranty)
- **cross-cutting/** → Infrastructure & shared systems (rbac, supabase, security, uploads, wa_templates)

**Subcategories (created only when content exists):**
- `reference/` → specifications, API contracts, data models, architecture
- `evidence/` → validation reports, test results, audits, compliance checks
- `runbooks/` → operational procedures, troubleshooting guides, how-tos
- `active/` → live policies, current configurations

### 2.4 Mobile Platform Truth State

```
docs/mobile/
├── README.md                          [Anchor: scopes to mobile documentation]
├── modules/                           [Mobile-specific implementations]
│   ├── [Same structure as web/modules/]
│   ├── [Populated only when mobile implementation differs from web]
│   └── [Can reference web/modules/ when identical]
└── cross-cutting/                     [Mobile infrastructure]
    ├── push-registration/
    │   ├── README.md
    │   ├── reference/                 [Push token flow spec]
    │   ├── evidence/                  [Testing: push delivery validation]
    │   └── runbooks/                  [Procedures: debug push issues]
    └── [other mobile-specific infrastructure]
```

**Principle:** Document mobile-only content. Reuse web docs when identical.

### 2.5 Implementation Plans (Uncommitted Work)

```
docs/Implementation_plans/
├── README.md                          [Anchor: scopes to execution plans]
├── webversion/
│   ├── categories/
│   │   ├── autodoc/active|evidence|inactive/        [Web feature work]
│   │   ├── complaints/active|evidence|inactive/
│   │   ├── telecalling/active|evidence|inactive/
│   │   ├── rbac/active|evidence|inactive/
│   │   ├── supabase/active|evidence|inactive/
│   │   ├── [other categories as needed]
│   │   └── [lifecycle: active → evidence → inactive → archived to completed/]
│   ├── INDEX.md                       [Web implementation tracker]
│   └── IMPLEMENTATION_TRACKER.md      [Active plans with status]
├── mobileversion/
│   ├── categories/
│   │   ├── auth/active|evidence|inactive/            [Mobile feature work]
│   │   ├── autodoc/active|evidence|inactive/
│   │   ├── [other categories as needed]
│   │   └── [lifecycle: active → evidence → inactive → archived to completed/]
│   ├── INDEX.md                       [Mobile implementation tracker]
│   └── IMPLEMENTATION_TRACKER.md      [Active plans with status]
└── completed/
    ├── autodoc/                       [Archived: implementation complete]
    ├── complaints/
    ├── rbac/
    └── [other completed implementations]
```

**Lifecycle:**
- `active/` → Being worked on, under discussion
- `evidence/` → Implementation done, tests written, ready for review
- `inactive/` → Paused, on-hold, or archived-pending-completion
- `completed/` → Fully merged, truth has been updated

---

## 3) Placement Decision Tree

**Execute this decision tree in order when creating ANY new markdown file:**

```
START

1. Is this SHARED TRUTH?
   (Policy, protocol, decision, or specification applying to BOTH web and mobile?)
   YES → docs/shared/<subcategory>/
          Choose subcategory:
          - Specification/Policy → reference/
          - Procedure → runbooks/
          - Live Tracking → active/
          - Reusable Template → reference/catalog/
   NO → continue

2. Is this an EXECUTION PLAN?
   (Feature design, implementation roadmap, timeline, tracking?)
   YES → docs/Implementation_plans/<platform>/categories/<feature>/<lifecycle>/
          Where:
          - platform = webversion OR mobileversion
          - feature = autocompleting category (autodoc, rbac, etc.)
          - lifecycle = active OR evidence OR inactive
   NO → continue

3. Is this PLATFORM-SPECIFIC TRUTH?
   (Specification, validation, or procedure for web OR mobile implementation?)
   YES → docs/<platform>/modules/<module>/<subcategory>/
          OR
          docs/<platform>/cross-cutting/<domain>/<subcategory>/
          Where:
          - platform = web OR mobile
          - module = autodoc, complaints, telecalling, warranty, etc.
          - domain = rbac, supabase, security, uploads, wa_templates, etc.
          - subcategory = reference, evidence, runbooks, active, catalog
   NO → continue

4. NO MATCH
   STOP. File type not recognized. Escalate to team.
```

---

## 4) Naming Rules

1. **Descriptive, searchable names** (avoid generic: notes.md, temp.md, new.md)
2. **Plan IDs for implementation docs** (PLAN-NAME format: TELECALLING-FEATURE-001)
3. **Date suffixes for audit/snapshot docs** (_YYYY-MM-DD or _YYYYMMDD)
4. **Filenames should indicate content type**:
   - `*_REFERENCE.md` → specification/authority
   - `*_PLAN.md` → execution plan
   - `*_AUDIT.md` → validation/testing
   - `*_RUNBOOK.md` → procedure/how-to
5. **Use UPPERCASE for module names** in filenames (TELECALLING, AUTODOC, RBAC)

---

## 5) File Organization Rules

### 5.1 No Files Directly in Primary Categories

❌ **WRONG:**
```
docs/autodoc/SPEC.md                 [file at category root]
docs/rbac/TESTING_REPORT.md          [file at category root]
```

✅ **CORRECT:**
```
docs/web/modules/autodoc/reference/AUTODOC_SPEC.md
docs/web/cross-cutting/rbac/evidence/RBAC_TESTING_REPORT.md
```

**Exception:** README.md at category root is required (anchor file only)

### 5.2 Subcategories Created Only When Content Exists

❌ **WRONG:**
```
docs/web/modules/feature/reference/  [empty]
docs/web/modules/feature/evidence/   [empty]
```

✓ **CORRECT:**
```
docs/web/modules/feature/reference/  [contains FEATURE_SPEC.md]
[no evidence/ until tests are created]
```

### 5.3 Category README.md Requirements

Every primary category folder must have README.md stating:
- **Scope:** What type of documentation lives here
- **Subcategories:** What each subfolder contains
- **Navigation:** Links to key documents
- **Lifecycle:** How files move within this category

Example:
```markdown
# RBACDocs

**Scope:** Web platform role-based access control.

## Subfolders

- `reference/` → RLS policies, RBAC architecture specifications
- `evidence/` → Security validation tests, RBAC role matrix tests
- `runbooks/` → RBAC debugging procedures, role assignment guide

## Navigation

- [RLS Policy Reference](reference/RBAC_RLS_POLICIES.md)
- [Role Matrix Validation](evidence/RBAC_ROLE_MATRIX_TESTING.md)
- [RLS Debugging Runbook](runbooks/RBAC_OPERATIONS_RUNBOOK.md)

## Lifecycle

Implementation plans: `docs/Implementation_plans/webversion/categories/rbac/`
Completed work is moved here to establish new truth.
```

---

## 6) State Transition Procedure

### When Implementation is Completed:

**Step 1: Archive Implementation Plan**
```bash
# Move from active to completed
mv docs/Implementation_plans/webversion/categories/feature/active/PLAN.md \
   docs/Implementation_plans/completed/feature/PLAN_COMPLETION_REPORT.md
```

**Step 2: Update/Create Truth Documentation**
```bash
# Create or update specification in truth location
docs/web/modules/feature/reference/FEATURE_SPEC.md  [new or updated]
docs/web/modules/feature/evidence/FEATURE_TESTS.md  [new or updated]
```

**Step 3: Verify No Duplication**
```bash
# Ensure plan is removed from active
rm docs/Implementation_plans/webversion/categories/feature/active/PLAN.md

# Ensure no copy remains in web/
grep -r "feature" docs/web/modules/feature/ | wc -l  [should have docs]
grep -r "feature" docs/Implementation_plans/webversion/categories/ | wc -l  [should be 0]
```

**Step 4: Update Shared Changelog**
```bash
# Record state transition
docs/shared/active/CHANGE_LOG.md  [add entry]
```

---

## 7) Anti-Duplication Enforcement

### Single Source of Truth Rule

**Every specification/procedure must exist in exactly ONE place:**

```
WRONG (Duplication):
- docs/web/modules/telecalling/reference/SPEC.md
- docs/Implementation_plans/webversion/categories/telecalling/active/SPEC.md
  [Same file exists in two places - which is truth?]

CORRECT (Single Location):
- During development:
  docs/Implementation_plans/webversion/categories/telecalling/active/PLAN.md

- After completion:
  docs/web/modules/telecalling/reference/SPEC.md
  [Implementation plan DELETED, truth established]
```

### Reference Management

When a document is moved/deleted, update all links:
```bash
# Find all references
rg -n "old/path/file.md" docs/

# Update references
# (use multi_replace_string_in_file for efficiency)

# Verify old path is gone
rg "old/path/" docs/  [should return 0 results]
```

---

## 8) Governance for Future Work

### Pre-Creation Checklist (For Every New .md)

Before creating ANY markdown file, answer these questions:

```
□ Is this shared truth (applies to both web & mobile)?
  → YES: Create in docs/shared/<subcategory>/
  → NO: Continue

□ Is this an implementation plan or execution roadmap?
  → YES: Create in docs/Implementation_plans/<platform>/categories/<feature>/<lifecycle>/
  → NO: Continue

□ Is this documentation of a COMPLETED implementation?
  → YES: Create in docs/<platform>/modules|cross-cutting/<domain>/<subcategory>/
  → NO: This is uncommitted work → Should be in Implementation_plans

□ Primary tier determined? (web, mobile, shared)
□ Subcategory determined? (reference, evidence, runbooks, active)
□ Will this file be moved when work is complete?
□ Are there existing related documents? (Check for duplication)
□ Is README.md updated with navigation?
```

### Version Control Workflow

```
1. Determine correct placement using decision tree
2. Create file in correct location (never root of category)
3. Add/update README.md navigation
4. Verify no duplicates elsewhere
5. Commit with message: "docs: Add <title> to <path>"
6. When implementation complete: Move to truth, archive implementation
```

---

## 9) Appendix: Tier Reference

| Tier | Type | Contains | Scope |
|---|---|---|---|
| web/ | Truth State | Completed web implementations & infrastructure | Web only |
| mobile/ | Truth State | Completed mobile implementations & infrastructure | Mobile only |
| shared/ | Truth State | Policies, protocols, decisions, shared specs | Both platforms |
| Implementation_plans/ | Execution Plans | Feature designs, roadmaps, tracking | Both platforms |

### Allowed Module Names (web/modules/ & mobile/modules/)
- autodoc
- complaints
- telecalling
- warranty
- (and others as created)

### Allowed Cross-Cutting Names (web/cross-cutting/ & mobile/cross-cutting/)
- rbac
- supabase
- security
- uploads
- wa_templates
- push-registration (mobile only)
- (and others as created)

### Implementation_plans Categories
Mirror web/mobile module and cross-cutting names

---

## 10) Quick Reference

### "Where does X go?"

| Document Type | Location |
|---|---|
| Module specification (web, completed) | `docs/web/modules/<name>/reference/<name>_SPEC.md` |
| Module specification (mobile, completed) | `docs/mobile/modules/<name>/reference/<name>_SPEC.md` |
| RBAC policy (web, completed) | `docs/web/cross-cutting/rbac/reference/RBAC_POLICY.md` |
| Feature implementation plan | `docs/Implementation_plans/webversion/categories/<name>/active/PLAN.md` |
| Feature test report (during implementation) | `docs/Implementation_plans/webversion/categories/<name>/evidence/TEST_REPORT.md` |
| Shared protocol (both platforms) | `docs/shared/reference/PROTOCOL.md` |
| Operational runbook (web) | `docs/web/modules/<name>/runbooks/RUNBOOK.md` |
| Mobile-specific push procedure | `docs/mobile/cross-cutting/push-registration/runbooks/RUNBOOK.md` |

---

**Last Updated:** 2026-06-23  
**Review Frequency:** When new module categories added, or every 6 months  
**Owner:** Techwheels Development Team
