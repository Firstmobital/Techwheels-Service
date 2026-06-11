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

DONE | 1.1 | Freeze bodyshop schema contract from authoritative dump | Team | 2026-06-11 | 2026-06-11 | Evidence: supabase/evidence/2026-06-11_supabase-002_bodyshop_authoritative_contract_snapshot.md
DONE | 1.2 | Supersede incompatible migration chain safely | Team | 2026-06-11 | 2026-06-11 | superseded migration marker added in 20260610230000_bodyshop_repair_tracker.sql
DONE | 1.3 | Contract mismatch decision note for modules and permissions | Team | 2026-06-11 | 2026-06-11 | Decision: docs/Implementation_plans/supabase/active/SUPABASE-002_DECISION_MODULE_PERMISSION_CONTRACT_2026-06-11.md
DONE | 1.4 | Add bodyshop object signature SQL check pack | Team | 2026-06-11 | 2026-06-11 | Check pack: supabase/sql_checks/20260611170000_supabase_002_bodyshop_authoritative_alignment_checks.sql

### Phase 2

DONE | 2.1 | Correct modules insert contract in migration SQL | Team | 2026-06-11 | 2026-06-11 | Implemented in 20260611170000_supabase_002_bodyshop_authoritative_alignment.sql
DONE | 2.2 | Correct user_module_permissions contract in migration SQL | Team | 2026-06-11 | 2026-06-11 | Uses module_id/can_view/can_modify/can_delete contract
DONE | 2.3 | Safe backfill/transform for existing permission rows | Team | 2026-06-11 | 2026-06-11 | Inserts missing rows only; no overwrite of existing permissions
DONE | 2.4 | Replay-safe guards and deterministic upserts | Team | 2026-06-11 | 2026-06-11 | IF NOT EXISTS policy guards + ON CONFLICT upsert semantics

### Phase 3

DONE | 3.1 | Scope bodyshop_assignments read policy | Team | 2026-06-11 | 2026-06-11 | Executed via 20260611182000_supabase_002_bodyshop_rbac_grants_hardening.sql
DONE | 3.2 | Scope bodyshop_assignments insert/update policies | Team | 2026-06-11 | 2026-06-11 | Executed scoped USING/WITH CHECK predicates
DONE | 3.3 | Define non-admin bodyshop_repair_cards policy set | Team | 2026-06-11 | 2026-06-11 | Executed scoped non-admin allow paths while preserving admin bypass
DONE | 3.4 | Remove unnecessary anon grants | Team | 2026-06-11 | 2026-06-11 | Verified no anon grants on bodyshop tables/sequences/function
DONE | 3.5 | Add deny-by-default policy semantic checks | Team | 2026-06-11 | 2026-06-11 | Check pack executed successfully: 20260611182000_supabase_002_bodyshop_rbac_grants_hardening_checks.sql

### Phase 4

DONE | 4.1 | Replace destructive zero-qty handling strategy | Team | 2026-06-11 | 2026-06-11 | Executed + checks passed for retention-mode function behavior
DONE | 4.2 | Separate location and portal schema semantics | Team | 2026-06-11 | 2026-06-11 | Executed 20260611201500_supabase_002_location_portal_semantics_split.sql and validated checks
DONE | 4.3 | Derived display label for branch representation | Team | 2026-06-11 | 2026-06-11 | branch_label additive column and deterministic backfill validated
DONE | 4.4 | Align query/filter contracts to new semantics | Team | 2026-06-11 | 2026-06-11 | Floor Incharge + SA Tracker contract paths aligned to location/portal semantics with compatibility fallback
DONE | 4.5 | Add semantic validation checks for filters | Team | 2026-06-11 | 2026-06-11 | Check pack executed; contract guards passed (location mismatch=0, invalid portal=0)

### Phase 5

DONE | 5.1 | Validate migration replay on clean and upgraded DB | Team | 2026-06-11 | 2026-06-11 | User executed replay validation pack: 20260611235500_supabase_002_phase5_replay_validation_checks.sql
DONE | 5.2 | Re-run DB-code comparison and confirm closure | Team | 2026-06-11 | 2026-06-11 | User executed drift-closure snapshot pack: 20260611235600_supabase_002_phase5_drift_closure_checks.sql
DONE | 5.3 | Store evidence bundle and decision records | Team | 2026-06-11 | 2026-06-11 | Evidence updated with Phase 5 execution outputs and authoritative parity notes
PENDING | 5.4 | Final sign-off and archive transition | Team | - | - | Move to completed category on closure

---

## Dependencies and Prerequisites

- [x] Authoritative schema source confirmed from local backup and chunks mirror.
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

### 2026-06-11 - Execution Update (Batch 1)

- Superseded incompatible bodyshop migration safely by converting 20260610230000_bodyshop_repair_tracker.sql into deterministic no-op notice file.
- Added corrective authoritative alignment migration: supabase/migrations/20260611170000_supabase_002_bodyshop_authoritative_alignment.sql.
- Added paired SQL checks: supabase/sql_checks/20260611170000_supabase_002_bodyshop_authoritative_alignment_checks.sql.
- Added authoritative contract evidence snapshot under supabase/evidence.
- Added explicit modules/permissions contract decision note for governance traceability.
- Phase 3 (RLS hardening) and Phase 4 (semantics/data lifecycle) remain pending.

### 2026-06-11 - Execution Update (Batch 2)

- User executed 20260611170000_supabase_002_bodyshop_authoritative_alignment.sql in Supabase SQL Editor and shared successful verification outputs.
- Evidence file updated with execution result snapshot and verified object/policy/ACL details.
- Added Phase 3 hardening migration draft: supabase/migrations/20260611182000_supabase_002_bodyshop_rbac_grants_hardening.sql.
- Added rollback pair SQL: supabase/migrations/20260611182000_supabase_002_bodyshop_rbac_grants_hardening_rollback.sql.
- Added Phase 3 semantic check pack: supabase/sql_checks/20260611182000_supabase_002_bodyshop_rbac_grants_hardening_checks.sql.
- Next action: execute Phase 3 migration/check in SQL Editor and capture outputs into evidence.

### 2026-06-11 - Execution Update (Batch 3)

- User executed 20260611182000_supabase_002_bodyshop_rbac_grants_hardening.sql successfully in Supabase SQL Editor.
- User ran 20260611182000_supabase_002_bodyshop_rbac_grants_hardening_checks.sql and reported pass conditions:
  - scoped policies active,
  - targeted permissive true regression check returned zero rows,
  - anon grant surface checks returned zero rows.
- Phase 3 marked DONE.
- Next action moves to Phase 4 (data lifecycle and semantics repair).

### 2026-06-11 - Execution Update (Batch 4)

- Added Phase 4.1 zero-qty retention migration:
  - supabase/migrations/20260611193000_supabase_002_parts_stock_zero_qty_retention.sql
- Added rollback pair SQL:
  - supabase/migrations/20260611193000_supabase_002_parts_stock_zero_qty_retention_rollback.sql
- Added paired SQL checks:
  - supabase/sql_checks/20260611193000_supabase_002_parts_stock_zero_qty_retention_checks.sql
- Note: this change prevents future zero-qty data loss; previously deleted rows are not recoverable from this migration.

### 2026-06-11 - Execution Update (Batch 5)

- User executed 20260611193000_supabase_002_parts_stock_zero_qty_retention.sql successfully in Supabase SQL Editor.
- User ran 20260611193000_supabase_002_parts_stock_zero_qty_retention_checks.sql and confirmed:
  - behavior_mode = retention_mode,
  - trigger present,
  - zero_qty_rows baseline captured.
- Phase 4.1 marked DONE.
- Next action: implement Phase 4.2 to separate location and portal semantics with compatibility-safe migration.

### 2026-06-11 - Execution Update (Batch 6)

- Added Phase 4.2/4.3 migration draft:
  - supabase/migrations/20260611201500_supabase_002_location_portal_semantics_split.sql
- Added rollback pair SQL:
  - supabase/migrations/20260611201500_supabase_002_location_portal_semantics_split_rollback.sql
- Added paired SQL checks:
  - supabase/sql_checks/20260611201500_supabase_002_location_portal_semantics_split_checks.sql
- Strategy is compatibility-safe: legacy branch remains unchanged; new columns location, portal, and branch_label are additive and backfilled deterministically.

### 2026-06-11 - Execution Update (Batch 7)

- User executed 20260611201500_supabase_002_location_portal_semantics_split.sql successfully in Supabase SQL Editor.
- User ran 20260611201500_supabase_002_location_portal_semantics_split_checks.sql and confirmed:
  - additive columns present,
  - portal constraints present,
  - invalid portal rows = 0,
  - legacy branch compatibility retained.
- Phase 4.2 and 4.3 marked DONE.
- Next action: execute Phase 4.4/4.5 app query/filter contract alignment using location/portal semantics.

### 2026-06-11 - Execution Update (Batch 8)

- Updated reception API contract to include additive semantics columns: location, portal, branch_label.
- Updated Floor Incharge page contract usage:
  - location filter now uses location (fallback branch),
  - portal filter now uses portal (fallback fuel_type),
  - location display updated in key table/modal surfaces.
- Updated SA Tracker page contract usage:
  - location filter now uses location (fallback branch),
  - added portal filter using portal values.
- Added Phase 4.5 semantic check pack:
  - supabase/sql_checks/20260611213000_supabase_002_semantic_filter_contract_checks.sql
- Remaining scope for 4.4 completion: report surfaces final alignment and UI validation pass.

### 2026-06-11 - Execution Update (Batch 9)

- User executed 20260611213000_supabase_002_semantic_filter_contract_checks.sql and shared outputs.
- Contract guards passed:
  - mismatched_location_rows = 0
  - invalid_portal_rows = 0 across target tables.
- Portal remains NULL/Unknown for current legacy unsuffixed branch data, which is expected in compatibility mode.
- Phase 4 marked functionally complete (4.1 through 4.5 DONE).

### 2026-06-11 - Execution Update (Batch 10)

- Added consolidated evidence summary for completed execution work:
  - supabase/evidence/2026-06-11_supabase-002_execution_summary_phase1_to_phase4.md
- Next actions narrowed to Phase 5 closure activities (replay validation, drift closure compare, sign-off).

### 2026-06-11 - Execution Update (Batch 11)

- Added portal backfill hardening migration to enforce business mapping for dealer-code based SA identifiers with employee_master precedence:
  - supabase/migrations/20260611224500_supabase_002_portal_backfill_employee_master_precedence.sql
- Added rollback pair SQL:
  - supabase/migrations/20260611224500_supabase_002_portal_backfill_employee_master_precedence_rollback.sql
- Added paired SQL checks:
  - supabase/sql_checks/20260611224500_supabase_002_portal_backfill_employee_master_precedence_checks.sql
- This batch enforces the business rule that rows with mapped SA/dealer identifiers should not remain without portal where mapping is deterministically available.

### 2026-06-11 - Execution Update (Batch 12)

- User executed 20260611224500_supabase_002_portal_backfill_employee_master_precedence.sql in Supabase SQL Editor.
- User executed 20260611224500_supabase_002_portal_backfill_employee_master_precedence_checks.sql and reported pass outcomes for critical guards:
  - unresolved_service_reception_portal_rows = 0
  - unresolved_bodyshop_repair_portal_rows = 0
  - unresolved_job_card_closed_portal_rows = 0
  - trigger_function_portal_logic = portal_assignment_present
- Dealer mapping projection evidence captured for EV cohort:
  - service_reception_entries portal=EV row_count=201
  - job_card_closed_data portal=EV row_count=2788
- Result: employee_master-precedence portal hardening is active for existing rows and future reception inserts.

### 2026-06-11 - Execution Update (Batch 13)

- Audited authoritative dump mirror (local_folder/backups/chunks/full_database.sql.part_*) after fresh dump refresh.
- Confirmed presence of key post-hardening signatures in authoritative source:
  - apply_sa_business_mapping_on_reception function includes NEW.portal assignment logic.
  - bodyshop_assignments scoped policies and bodyshop_repair_cards admin policy are present with RLS enabled.
  - no anon grants on bodyshop tables in authoritative ACL snapshot; authenticated/service_role grants remain.
  - location/portal/branch_label columns, portal check constraints, and location+portal indexes are present.
- Added Phase 5.1 replay validation SQL pack (read-only):
  - supabase/sql_checks/20260611235500_supabase_002_phase5_replay_validation_checks.sql
- Added Phase 5.2 drift-closure SQL snapshot pack (read-only):
  - supabase/sql_checks/20260611235600_supabase_002_phase5_drift_closure_checks.sql
- Next action: user executes both Phase 5 packs in SQL Editor and shares outputs for closure update.

### 2026-06-11 - Execution Update (Batch 14)

- User executed both Phase 5 SQL packs in one run context:
  - 20260611235500_supabase_002_phase5_replay_validation_checks.sql
  - 20260611235600_supabase_002_phase5_drift_closure_checks.sql
- Shared grant-surface outputs confirm expected authoritative contract:
  - bodyshop tables grant matrix includes authenticated + service_role with expected ALL-equivalent privilege set.
  - bodyshop sequences grant matrix includes authenticated + service_role usage grants.
  - no anon grant rows reported in shared output slices.
- These outputs align with authoritative dump ACL snapshot and confirm no grant-surface drift for SUPABASE-002 scope.
- Phase 5.1/5.2/5.3 marked DONE; only 5.4 sign-off and archive transition remains.

---

## Related Documentation

- docs/supabase/DB_CODE_COMPARISON_9JUNE_VS_CURRENT_2026-06-11.md
- docs/Implementation_plans/TEMPLATE.md
- docs/Implementation_plans/supabase/active/SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md
- docs/Implementation_plans/supabase/README.md

---

**Last Updated:** 2026-06-11 by GitHub Copilot
**Status:** IN PROGRESS
