# SUPABASE-002: DB Code Comparison Remediation Plan (9 June vs Current)

**Plan ID:** SUPABASE-002
**Created:** 2026-06-11
**Priority:** CRITICAL
**Owner:** Techwheels Admin + Dev Team + GitHub Copilot

---

## Executive Summary

This plan closes the governance and runtime risks identified in the comparison report between 9 June state and current state, with focus on migration correctness, RBAC policy hardening, grant minimization, and business-field semantics normalization.

The highest-risk issue is migration truth drift: current deployed bodyshop schema uses a practical 2-table model, while committed migration SQL represents a different 7-table model and outdated module/permission contract. This creates replay failure risk, onboarding inconsistency risk, and operational audit failure risk.

**Risk Level:** CRITICAL
**Estimated Duration:** 3-5 working days
**Rollback Strategy:**
- Keep all remediation as forward-only versioned migrations under supabase/migrations.
- Add rollback pair SQL files for each destructive or access-impacting migration.
- Deploy in gated sequence: staging validation -> production guarded rollout -> post-check evidence capture.

---

## Objectives

1. Re-establish migration repository as exact source of deployed DB truth for bodyshop schema and permissions contract.
2. Enforce least-privilege RBAC on bodyshop tables and remove broad authenticated and anon access.
3. Normalize location and portal semantics to prevent reporting confusion and audit drift while maintaining backward compatibility.
4. Preserve analytics continuity for parts stock behavior by replacing destructive logic with policy-governed lifecycle handling.
5. Produce verifiable SQL checks and evidence artifacts for every fix.

---

## Context and Background

Comparison report: docs/supabase/DB_CODE_COMPARISON_9JUNE_VS_CURRENT_2026-06-11.md.

Key findings requiring corrective implementation:

1. Migration-to-reality mismatch for bodyshop schema (7-table migration vs 2-table deployed model).
2. Migration SQL uses incompatible modules and user_module_permissions contracts.
3. bodyshop_assignments RLS policies are overly permissive for authenticated users.
4. bodyshop_repair_cards non-admin policy completeness is unclear versus route-level RBAC behavior.
5. Broad GRANT ALL to anon exists on bodyshop tables and sequences/functions.
6. Zero-quantity parts stock migration behavior can remove historical audit signals.
7. Branch versus location semantics are overloaded, causing business reporting inconsistency.

---

## Implementation Tasks

### Phase 1: Governance Freeze and Truth Alignment
- [ ] **Task 1.1:** Freeze bodyshop schema contract using authoritative dump evidence and produce signed contract snapshot in supabase evidence docs.
- [ ] **Task 1.2:** Mark current incompatible migration as superseded and add corrective migration chain without rewriting history.
- [ ] **Task 1.3:** Create a remediation decision note for modules and user_module_permissions contract mismatch.
- [ ] **Task 1.4:** Add SQL check pack that validates object signatures, columns, indexes, triggers, and policy presence for bodyshop objects.

### Phase 2: Migration Contract Correction
- [ ] **Task 2.1:** Create migration to align module insert logic to actual modules table contract (name, label and current canonical fields).
- [ ] **Task 2.2:** Create migration to align user_module_permissions writes to current schema (module_id with view/modify/delete fields).
- [ ] **Task 2.3:** Backfill or transform existing rows safely where old contract assumptions were used.
- [ ] **Task 2.4:** Add idempotent guards (IF EXISTS/IF NOT EXISTS and upsert semantics) to prevent replay breakage.

### Phase 3: RBAC and Grant Hardening
- [ ] **Task 3.1:** Replace permissive bodyshop_assignments read policy with scoped predicate by user role, dealer, and location visibility.
- [ ] **Task 3.2:** Replace permissive bodyshop_assignments insert and update policies with scoped WITH CHECK and USING predicates.
- [ ] **Task 3.3:** Define explicit non-admin bodyshop_repair_cards policies for expected app operations (read/create/update as required).
- [ ] **Task 3.4:** Remove unnecessary anon grants from bodyshop tables, sequences, and helper functions.
- [ ] **Task 3.5:** Add policy-semantic SQL checks proving deny-by-default posture and expected allow paths.

### Phase 4: Data Lifecycle and Semantics Repair
- [ ] **Task 4.1:** Replace hard-delete zero-qty behavior with configurable retention strategy (soft retention or archival-safe pattern).
- [ ] **Task 4.2:** Add compatibility-safe schema path for location and portal as separate source-of-truth fields where missing.
- [ ] **Task 4.3:** Implement derived display label strategy for branch representation and preserve legacy branch only for transition.
- [ ] **Task 4.4:** Update report/query contract references so location filters use location and portal filters use portal.
- [ ] **Task 4.5:** Add migration checks validating no semantic regression in Floor Incharge, SA Tracker, and reports filter behavior.

### Phase 5: Validation, Rollout, and Drift Closure
- [ ] **Task 5.1:** Execute SQL checks for migration replay on clean environment and upgraded environment.
- [ ] **Task 5.2:** Re-run comparison process and confirm drift closure for corrected objects and policies.
- [ ] **Task 5.3:** Capture before and after evidence bundle under supabase evidence directory.
- [ ] **Task 5.4:** Update implementation index entries and move plan to completed after sign-off.

---

## Activity Tracker

> Update in real-time during execution.

### Legend
- DONE
- IN PROGRESS
- PENDING
- BLOCKED

### Phase 1

PENDING | 1.1 | Freeze bodyshop schema contract from authoritative dump | Team | - | - | Include table DDL, indexes, triggers, RLS policies
PENDING | 1.2 | Supersede incompatible migration chain safely | Team | - | - | Do not rewrite historical migration file
PENDING | 1.3 | Contract mismatch decision note for modules and permissions | Team | - | - | Include data backfill impact matrix
PENDING | 1.4 | Add bodyshop object signature SQL check pack | Team | - | - | Attach run output in evidence

### Phase 2

PENDING | 2.1 | Correct modules insert contract in migration SQL | Team | - | - | Align with current schema columns
PENDING | 2.2 | Correct user_module_permissions contract in migration SQL | Team | - | - | Use module_id and can_view/can_modify/can_delete
PENDING | 2.3 | Safe backfill/transform for existing permission rows | Team | - | - | Keep idempotent behavior
PENDING | 2.4 | Replay-safe guards and deterministic upserts | Team | - | - | Required for clean deploy and reruns

### Phase 3

PENDING | 3.1 | Scope bodyshop_assignments read policy | Team | - | - | Remove USING true model
PENDING | 3.2 | Scope bodyshop_assignments insert/update policies | Team | - | - | Remove WITH CHECK true model
PENDING | 3.3 | Define non-admin bodyshop_repair_cards policy set | Team | - | - | Map to app role expectations
PENDING | 3.4 | Remove unnecessary anon grants | Team | - | - | Tables, sequences, and helper functions
PENDING | 3.5 | Add deny-by-default policy semantic checks | Team | - | - | Include positive and negative test cases

### Phase 4

PENDING | 4.1 | Replace destructive zero-qty handling strategy | Team | - | - | Preserve analytics and audit continuity
PENDING | 4.2 | Separate location and portal schema semantics | Team | - | - | Backward-compatible transition
PENDING | 4.3 | Derived display label for branch representation | Team | - | - | Keep UI compatibility during migration
PENDING | 4.4 | Align query/filter contracts to new semantics | Team | - | - | Floor Incharge, SA Tracker, reports
PENDING | 4.5 | Add semantic validation checks for filters | Team | - | - | Include sample row assertions

### Phase 5

PENDING | 5.1 | Validate migration replay on clean and upgraded DB | Team | - | - | Zero error replay required
PENDING | 5.2 | Re-run DB-code comparison and confirm closure | Team | - | - | Compare corrected signatures
PENDING | 5.3 | Store evidence bundle and decision records | Team | - | - | Save under supabase/evidence
PENDING | 5.4 | Final sign-off and archive transition | Team | - | - | Move to completed category on closure

---

## Dependencies and Prerequisites

- [ ] Authoritative schema source confirmed from local backup and chunks mirror.
- [ ] Team agreement on canonical semantics:
  - location = physical site
  - portal = EV or PV stream
  - branch_label = derived display only
- [ ] Access to staging and production validation environments.
- [ ] SQL check execution path available and reproducible.
- [ ] Stakeholder sign-off group identified: Product, Ops, and DB owner.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Corrective migration introduces permission lockouts | Medium | High | Stage-first rollout, policy semantic checks, rollback pair SQL |
| Data backfill for module permissions maps incorrectly | Medium | High | Pre-migration mapping report + deterministic joins + dry-run checks |
| Semantics transition causes report confusion during rollout | High | High | Dual-read compatibility window + explicit UI labels + training note |
| Zero-qty lifecycle change affects existing KPIs | Medium | Medium | Side-by-side metric validation for defined period |
| Drift reappears due to unmanaged manual DB changes | Medium | High | Enforce migration-only governance + post-deploy comparison gate |

---

## Success Criteria

- DONE when bodyshop migration definitions match deployed schema signatures exactly.
- DONE when bodyshop assignments and repair cards RLS policies are least-privilege and validated with semantic checks.
- DONE when anon grant surface for bodyshop objects is reduced to required minimum only.
- DONE when module and permission migration replay succeeds on clean environment.
- DONE when location and portal semantics are separated and report/filter behavior is consistent.
- DONE when re-run comparison report shows no unresolved critical and high drift findings for this scope.

---

## Communication and Sign-Off

**Stakeholders:**
- [ ] Product Owner: _______________ (Signature) (Date)
- [ ] Database Owner: _______________ (Signature) (Date)
- [ ] Ops Owner: _______________ (Signature) (Date)
- [ ] Engineering Lead: _______________ (Signature) (Date)

---

## Notes and Lessons Learned

### 2026-06-11 - Plan Kickoff

- Drift and governance concerns are confirmed by dump-to-dump and code-to-code comparison.
- Priority is contract correction first, then RBAC/grants hardening, then semantics normalization.
- No direct ad-hoc DB mutation should bypass migration chain for this remediation scope.

---

## Related Documentation

- docs/supabase/DB_CODE_COMPARISON_9JUNE_VS_CURRENT_2026-06-11.md
- docs/Implementation_plans/TEMPLATE.md
- docs/Implementation_plans/supabase/active/SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md
- docs/Implementation_plans/supabase/README.md

---

**Last Updated:** 2026-06-11 by GitHub Copilot
**Status:** PENDING
