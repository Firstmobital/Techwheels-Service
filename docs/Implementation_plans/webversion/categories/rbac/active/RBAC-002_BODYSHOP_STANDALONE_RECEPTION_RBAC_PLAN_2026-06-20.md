# RBAC-002 Bodyshop Standalone Reception RBAC Plan

Version: 2026-06-20
Status: PENDING (Audit complete, execution deferred)
Owner: RBAC Team + Bodyshop Team + Platform Team
Scope: Web + Supabase RBAC contract for Bodyshop Floor and Bodyshop Repair standalone operation
Execution Mode: Plan-only (do not execute migrations yet)

---

## 1) Objective

Ensure Bodyshop Floor and Bodyshop Repair can operate as standalone modules without requiring Service Advisor module grants, while preserving strict least-privilege controls on shared reception data.

Business outcome:
1. Granting Bodyshop Floor rights should not require Service Advisor rights.
2. Granting Bodyshop Repair rights should not require Service Advisor rights.
3. Bodyshop Repair must be able to save KM Reading and Job Card Number in its own workflow without broad reception permissions.
4. Reception ownership and Service Advisor ownership rules must remain intact.

---

## 2) Audit Scope and Evidence (Verified Only)

This section lists audited sources only. No unverified assumptions are used.

### 2.1 Documentation/Governance Sources Audited

1. docs/Implementation_plans/STRUCTURE_AND_WORKFLOW.md
2. docs/Implementation_plans/webversion/INDEX.md
3. docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md
4. docs/Implementation_plans/webversion/categories/rbac/active/RBAC-001_MASTER_PLAN_ACTIVE.md

### 2.2 Frontend Sources Audited

1. src/App.tsx
2. src/pages/BodyshopFloorPage.tsx
3. src/pages/BodyshopRepairPage.tsx

### 2.3 SQL/Migration Sources Audited

1. supabase/exec_success_migrations/20260601030000_fix_reception_rls_policies.sql
2. supabase/exec_success_migrations/20260601173000_fix_sa_update_guard_to_employee_code.sql
3. supabase/exec_success_migrations/20260612182000_bodyshop_v2_rls_alignment.sql
4. supabase/exec_success_migrations/20260616183000_bodyshop_sa_stage_policy_hardening.sql
5. supabase/exec_success_migrations/20260619143000_sync_reception_jc_from_bodyshop_job_card.sql
6. supabase/exec_success_migrations/20260620134000_decouple_bodyshop_from_service_advisor_on_reception.sql (created, not executed)

### 2.4 Authoritative DB Mirror Audited

Source of truth audited:
1. local_folder/backups/chunks/full_database.sql.part_000
2. local_folder/backups/chunks/full_database.sql.part_004

Verified objects from mirror:
1. Function public.enforce_service_reception_sa_update() present.
2. Trigger trg_service_reception_sa_update_guard present on public.service_reception_entries.
3. Policies present on public.service_reception_entries:
   - service_reception_select_rbac
   - service_reception_select_sa
   - service_reception_update_rbac
   - service_reception_update_sa
4. Policies present on bodyshop tables include module coupling with service_advisor/reception in some modify paths:
   - bodyshop_repair_cards_select_rbac_v2
   - bodyshop_repair_cards_update_rbac_v2
   - bodyshop_repair_card_documents_update_rbac_v4

---

## 3) Current-State Findings

### 3.1 What is already correct

1. Route/module gating in app shell is already separated by module names.
2. Bodyshop Floor and Service Advisor routes are independently gated in frontend route map.

### 3.2 Where coupling is happening

1. Bodyshop Floor reads public.service_reception_entries (accident intake dependency).
2. Bodyshop Repair reads and updates public.service_reception_entries for KM and JC operations.
3. Reception table update guard function currently permits admin/reception and service_advisor paths, but not explicit bodyshop_repair update path in deployed mirror.
4. Resulting behavior can force users to have Service Advisor or Reception rights to complete bodyshop tasks.

### 3.3 KM Reading incident explanation (verified contract interpretation)

1. KM save from Bodyshop Repair updates service_reception_entries.
2. Deployed RLS + trigger guard primarily recognizes reception/service_advisor ownership paths.
3. If user has only bodyshop module and lacks allowed reception/service_advisor path, update can fail due to RLS/trigger checks.

---

## 4) Target Contract (Long-Term)

### 4.1 Module Independence

1. bodyshop_floor module works without service_advisor module grant.
2. bodyshop_repair module works without service_advisor module grant.

### 4.2 Shared-Table Least Privilege on service_reception_entries

1. Bodyshop modules may read only Accident workflow rows within scope.
2. Bodyshop Repair may update only Accident workflow rows within scope.
3. Bodyshop Repair may update only km_reading and jc_number on reception rows.
4. Reception and Service Advisor existing ownership semantics remain active and unchanged for their workflows.

### 4.3 Non-goals

1. No broad bodyshop write access to all reception columns.
2. No replacement of reception ownership model.
3. No route-level redesign.

---

## 5) Proposed Change Set (Plan for Later Execution)

Execution is deferred. This section defines the exact sequence when implementation starts.

### Phase A: Pre-Execution Validation (No DDL/DML)

1. Confirm active deployed policy/function text in Supabase SQL Editor matches authoritative mirror for:
   - service_reception_select_rbac
   - service_reception_select_sa
   - service_reception_update_rbac
   - service_reception_update_sa
   - enforce_service_reception_sa_update
2. Confirm Bodyshop pages currently update only intended reception fields (KM, JC).
3. Confirm bodyshop module matrix in public.modules and user_module_permissions is unchanged during validation window.

### Phase B: Apply Decoupling Migration (Deferred)

Candidate migration already prepared:
1. supabase/exec_success_migrations/20260620134000_decouple_bodyshop_from_service_advisor_on_reception.sql

Planned behavior from this migration:
1. Add service_reception_select_bodyshop_v1.
2. Add service_reception_update_bodyshop_repair_v1.
3. Replace enforce_service_reception_sa_update() with explicit bodyshop_repair-safe branch:
   - Accident-only
   - scope-checked
   - field-restricted to km_reading and jc_number

### Phase C: Post-Execution Verification

1. Policy existence and predicates verified in SQL Editor.
2. Trigger function body verified exactly against approved text.
3. UAT role matrix executed (see Section 8).

### Phase D: Stabilization and Documentation Sync

1. Update RBAC-001 execution update with final outcome and timestamp.
2. Add evidence note under webversion/categories/rbac/evidence if required by release gate.
3. If contract is stable across at least one release cycle, mark RBAC-002 status as DONE and archive by workflow rule.

---

## 6) SQL Validation Checklist (Run Later)

All checks below are read-only verification queries.

1. Validate reception policies currently deployed.
2. Validate bodyshop policies currently deployed.
3. Validate trigger/function source for enforce_service_reception_sa_update.
4. Validate no unintended broad grants on service_reception_entries.
5. Validate policy names introduced by RBAC-002 migration after execution.

---

## 7) Frontend/Backend Integration Checklist

### 7.1 Frontend Paths to Validate

1. Bodyshop Floor load path reading accident reception rows.
2. Bodyshop Repair selected reception fetch.
3. Bodyshop Repair blur-save KM flow.
4. Bodyshop Repair manual save receiving draft flow (KM/JC + patch path).

### 7.2 Backend Rules to Validate

1. service_reception_entries policies enforce module and scope correctly.
2. enforce_service_reception_sa_update allows only intended column updates per module path.
3. Existing sync trigger from bodyshop_repair_cards to reception jc_number remains compatible.

---

## 8) UAT Role Matrix (Mandatory)

Use real test users with clean module grants.

1. User A: bodyshop_floor (view+modify), no service_advisor, no reception
   - Expected: can open and operate Bodyshop Floor workflow in scope.
   - Expected: no requirement to grant service_advisor.

2. User B: bodyshop_repair (view+modify), no service_advisor, no reception
   - Expected: can open Bodyshop Repair rows in scope.
   - Expected: can save KM Reading.
   - Expected: can save Job Card Number.
   - Expected: cannot modify unrelated reception columns.

3. User C: service_advisor (view+modify), no bodyshop modules
   - Expected: existing SA behavior unchanged.

4. User D: reception (view+modify), no bodyshop modules
   - Expected: existing reception behavior unchanged.

5. User E: admin
   - Expected: admin bypass remains functional.

---

## 9) Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Trigger guard becomes too permissive | Medium | High | Keep explicit column whitelist and Accident-only predicate |
| Trigger guard becomes too strict and blocks valid bodyshop saves | Medium | High | Execute staged UAT with KM/JC scenarios before release |
| Policy overlap causes unexpected access unions | Medium | Medium | Validate full effective policy set with pg_policies review before go-live |
| Drift between plan SQL and deployed SQL | Medium | High | Require pre/post SQL text capture as release artifact |

---

## 10) Rollback Strategy

If post-deploy behavior regresses:

1. Re-apply prior known-good reception policy and function definitions from authoritative mirror snapshot.
2. Disable RBAC-002 policy additions by dropping new bodyshop-specific reception policies.
3. Re-run UAT matrix on critical roles before re-open.

Note: rollback execution artifacts must be prepared in a dedicated rollback SQL script at execution time.

---

## 11) Activity Tracker

Legend:
1. DONE
2. IN PROGRESS
3. PENDING
4. BLOCKED

| ID | Task | Status | Owner | Notes |
|---|---|---|---|---|
| RBAC2-001 | Complete cross-layer audit (frontend + SQL + authoritative mirror) | DONE | Copilot + RBAC | Completed 2026-06-20 |
| RBAC2-002 | Draft plan-only migration contract and guardrails | DONE | Copilot + RBAC | Migration file prepared, not executed |
| RBAC2-003 | Execute preflight SQL validation in target environment | PENDING | Platform | Deferred by instruction |
| RBAC2-004 | Execute migration and capture SQL evidence | PENDING | Platform | Deferred by instruction |
| RBAC2-005 | Execute UAT role matrix | PENDING | QA + RBAC + Bodyshop | Required before closure |
| RBAC2-006 | Publish completion update in RBAC-001 and tracker closure | PENDING | RBAC | Post-UAT |

---

## 12) Explicit Assumptions Register

No behavioral assumptions are accepted for execution.

Items that must be re-verified at execution time:
1. Deployed function/policy text has not drifted from audited mirror.
2. Bodyshop frontend flows still write only KM/JC to reception rows.
3. Module names in public.modules remain unchanged (bodyshop_floor/bodyshop_repair/service_advisor/reception/bodyshop_tracker).

If any item fails, execution is blocked and plan must be updated before migration run.

---

## 13) Related Files

1. src/App.tsx
2. src/pages/BodyshopFloorPage.tsx
3. src/pages/BodyshopRepairPage.tsx
4. supabase/exec_success_migrations/20260601030000_fix_reception_rls_policies.sql
5. supabase/exec_success_migrations/20260601173000_fix_sa_update_guard_to_employee_code.sql
6. supabase/exec_success_migrations/20260620134000_decouple_bodyshop_from_service_advisor_on_reception.sql
7. local_folder/backups/chunks/full_database.sql.part_000
8. local_folder/backups/chunks/full_database.sql.part_004

---

Last Updated: 2026-06-20
Plan Status: PENDING
