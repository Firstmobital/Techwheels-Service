# IMPORT-002 PSF Incremental Upsert Governance Plan

Status: Proposed
Owner: Import Team + Platform Team + Ops
Created: 2026-06-26
Depends On: IMPORT-001_IMPORT_UPLOAD_GOVERNING_PLAN_2026-06-06
Scope: Web import page PSF card only

Authority Inputs:
1. Baseline dump marker: supabase/evidence/authoritative_dump_manifest.json
2. Authoritative dump: local_folder/backups/full_database.sql
3. Exact mirror path used for large-file access parity: local_folder/backups/chunks/full_database.sql.part_*
4. Post-dump overlay file: supabase/evidence/post_dump_verified_promotions.md

---

## 1. Purpose

Adopt safe-by-default PSF import behavior only for the web Import page and only for PSF Revenue Report:
1. Incremental upsert is default mode.
2. Global table wipe is not allowed for production workflows.

This plan converts business recommendation into implementation steps, controls, and evidence.

### 1.1 Scope Lock (Mandatory)

This plan applies only to:
1. URL: https://techwheels-service.vercel.app/import
2. Card: PSF Revenue Report
3. Table: job_card_closed_data

This plan does not apply to and must not change:
1. Any other import card (Invoice, VAS, Parts, Warranty)
2. Mobile import flow
3. Any page outside /import
4. Any table other than job_card_closed_data

---

## 2. Audit Snapshot (Read-Only, 2026-06-26)

### 2.1 Current Behavior Evidence

Web /import PSF card:
1. PSF flow currently includes replace-style clear path when replace flag is enabled.
2. PSF flow also has dedupe and upsert fallback paths.
3. Metadata update exists for table last_updated_at in import_metadata.
4. Full run audit record (mode/operator/hash/counters/failure) is not persisted yet for PSF runs.

### 2.2 Policy Gap Matrix

1. Default incremental mode: Partially implemented, not enforced as explicit PSF default policy.
2. Replace-all restricted/admin-only: Missing.
3. Scoped reconciliation instead of full clear: Missing for PSF replace path.
4. Auditability (mode/operator/file hash/counters/failure): Missing.
5. Operational guardrails (lock/retry/backoff/timeout stop): Missing as enforceable workflow controls.
6. SLA guidance (daytime incremental, off-peak replace): Missing from PSF UX and enforcement.

### 2.3 Immediate Risk

1. PSF clear-all path creates avoidable blast radius and timeout pressure.
2. Lack of mode + scope audit trail weakens incident and dispute resolution.
3. No import lock can allow concurrent conflicting PSF uploads on same scope.

### 2.4 Authoritative Dump Audit (Schema Truth)

Baseline marker:
1. authoritative_dump_manifest.json points to local_folder/backups/full_database.sql.
2. Baseline sha256: 858bfafa88bd94b50b32bf60bc1ac98cf5bdc03f73034dbd086938a545d722ad.

PSF and import schema facts verified from dump and chunk mirror:
1. public.job_card_closed_data exists with location, portal, branch_label, invoice_date.
2. Unique key for conflict handling is partial unique index:
   - uq_jc_closed_branch_job_card_number_invoice_date
   - key: (branch, job_card_number, invoice_date)
   - predicate requires non-empty job_card_number and non-null invoice_date.
3. location+portal has non-unique index (idx_jccd_location_portal), not a unique conflict key.
4. public.import_metadata exists with unique(table_name) and admin-only write policy import_metadata_write_admin_v1.
5. public.job_card_closed_data has permissive authenticated policies for select/insert/update/delete (all true conditions), plus admin policy.
6. public.job_card_closed_data has trigger trg_refresh_all_service_data_from_job_card_closed_data, so every PSF DML can cascade downstream refresh work.
7. public.import_employee_mapping_issues exists.
8. public.import_run_audit table is not present in baseline.
9. public.import_lock table is not present in baseline.
10. public.job_card_closed_data_import_signatures and fn_jc_closed_dedupe_and_merge are not present in baseline.

### 2.5 Post-Dump Overlay Truth

1. post_dump_verified_promotions.md currently lists no promoted entries after baseline refresh.
2. Therefore effective audit truth for this plan is baseline dump schema as-is.

---

## 3. Target Policy Contract

### 3.1 Import Modes

1. Incremental Upsert (default):
   - Update existing rows and insert new rows.
   - Absence in file does not mean delete.
2. Replace-All Scoped (exception):
   - File becomes source of truth only for selected scope.
   - Never global table wipe.

### 3.2 Scope Contract

Allowed PSF reconciliation scopes:
1. location + portal + date window
2. branch + date window

Minimum required in replace mode:
1. explicit scope selector
2. resolved where-clause preview
3. row-count impact preview before execution

### 3.3 Schema-Constrained Conflict Contract

1. Default PSF upsert conflict target must align with baseline unique index:
   - branch, job_card_number, invoice_date
2. Any future move to location+portal conflict key requires a separate DB migration and promotion evidence.
3. Replace-scoped reconciliation must continue to preserve invoice_date participation for deterministic idempotency.

---

## 4. Implementation Phases

## Phase A: Immediate Safe Phase (Default Incremental, No Global Clear)

Objective: remove production blast radius quickly while preserving throughput.

Tasks:
1. Remove global delete-before-insert behavior from PSF default path.
2. Set default import mode to incremental upsert for PSF imports.
3. Use schema-true conflict key first (branch, job_card_number, invoice_date); keep duplicate-safe insert fallback.
4. Show explicit mode label in PSF upload UI and success summary.
5. Add hard stop when operation crosses timeout budget with actionable message.
6. Ensure invoice_date normalization is mandatory before conflict-stage mutation, because unique index predicate depends on invoice_date presence.

Acceptance Criteria:
1. Daytime PSF import never issues unscoped delete.
2. Re-upload of same file is idempotent within conflict-key rules.
3. User sees mode used in result summary.

---

## Phase B: Controlled Replace Mode (Admin-Only, Scoped, Audited)

Objective: keep replace capability for controlled operations only.

Tasks:
1. Add replace-all-scoped mode toggle behind admin role check.
2. Require dual confirmation text explaining replacement semantics.
3. Enforce off-peak execution window for replace mode.
4. Require mandatory scope selection and display scope SQL-equivalent preview.
5. Reconciliation workflow:
   - delete only rows within selected scope
   - upsert uploaded rows into same scope
6. Block execution if scope is empty/invalid or resolves to global scope.
7. Enforce admin-only replace in application service layer explicitly; do not rely on current permissive job_card_closed_data authenticated policies.

Acceptance Criteria:
1. Non-admin users cannot access replace mode controls.
2. Replace mode cannot run outside allowed window.
3. Replace mode cannot execute without explicit scope confirmation.
4. No global delete SQL is emitted in replace mode.

---

## Phase C: Auditability and Ops Guardrails

Objective: make imports diagnosable, governable, and safe under load.

Tasks:
1. Create PSF import run ledger table (example: import_run_audit):
   - run_id, table_name, mode, scope_json, operator_user_id
   - started_at, finished_at, status, failure_reason
   - file_hash_sha256, file_name, file_size
   - rows_read, rows_inserted, rows_updated, rows_skipped, rows_failed
2. Write ledger row at start and finalize on completion/failure.
3. Add retry policy with exponential backoff for retryable mutation failures.
4. Add per table+scope lock to prevent concurrent run overlap (new table needed because import_lock is absent in baseline).
5. Add chunk-size governance by table type and file size.
6. Timeout guard:
   - stop run when threshold exceeded
   - persist partial counters and explicit stop reason.
7. Include downstream side-effect timing in timeout budget because PSF DML triggers all_service_data refresh function.

Acceptance Criteria:
1. Every run is traceable with mode/scope/operator/hash/counters.
2. Parallel uploads on same table+scope are rejected with clear UX.
3. Timeout exits are deterministic and audited.

---

## 5. Workstream Breakdown

### 5.1 Frontend (Web)

1. PSF mode selector UI with default incremental state.
2. Admin-gated replace controls and warning dialogs.
3. PSF scope picker with impact preview.
4. PSF status panel showing run_id, mode, counters, stop reason.

### 5.2 Backend / Data Layer

1. PSF scoped reconciliation helpers (where-clause builders + validation).
2. PSF import lock primitive (table+scope key).
3. PSF retry/backoff wrapper for chunk mutations.
4. PSF import run audit persistence API/table.

---

## 6. Test and Evidence Plan

Unit Tests:
1. Scope validator rejects global/empty scopes.
2. Mode policy enforcer blocks non-admin replace mode.
3. Retry classifier identifies retryable vs terminal errors.

Integration Tests:
1. Incremental re-upload updates existing rows without delete.
2. Replace-scoped deletes only PSF in-scope rows then upserts file rows.
3. Concurrent same-scope PSF import gets lock rejection.
4. PSF timeout stop records failure with partial counters.

Operational Evidence:
1. PSF upload run screenshots showing mode and scope summary.
2. PSF import_run_audit query samples for successful and failed runs.
3. Post-deploy timed-window validation report.
4. Evidence that no post-dump promotion overlays were pending during execution window (or explicit overlay entries if they appear later).

---

## 7. Rollout and SLA

1. Daytime SLA: incremental upsert only.
2. Replace-scoped SLA: off-peak approved window only.
3. Feature flags:
   - psf_import_incremental_default_v1
   - psf_import_replace_scoped_admin_v1
   - psf_import_run_audit_v1
4. Rollout order:
   1. Deploy Phase A for PSF only
   2. Validate daytime PSF imports for one week
   3. Enable Phase B for PSF admins
   4. Enable Phase C PSF audit and lock controls

---

## 8. Out of Scope for This Plan

1. Full server-side queue/job-worker migration (tracked as follow-up if DB pressure persists).
2. Historical data correction unrelated to current import runs.
3. Any non-PSF import card changes.
4. Mobile import changes.
5. Changes outside https://techwheels-service.vercel.app/import.

---

## 9. Completion Definition

Plan can move from active to completed archive only when:
1. Global clear path is removed from PSF production import workflow.
2. Admin-only PSF scoped replace path is live with confirmations and window control.
3. PSF import_run_audit ledger is populated for PSF imports.
4. PSF lock/retry/timeout controls are validated in evidence docs.

---

## 10. Change-Control Note

Any request to include another card, another table, or mobile parity requires a separate plan ID and separate approval.

---

## 11. Warranty Audit Learnings Reused For PSF (No Warranty Execution In This Plan)

Boundary statement:
1. Warranty import logic was audited only to extract reusable patterns for PSF hardening.
2. This plan does not authorize any warranty table, UI, or workflow changes.

### 11.1 Reusable Good Patterns Already Present In Warranty Flow

1. Canonicalized source-row capture (`source_row_data`) preserves forensic traceability of import input.
2. Deterministic row hash pattern (`source_row_hash`) provides a stable idempotency primitive.
3. Explicit slot-derived branch/location/portal normalization reduces branch-label drift.
4. Grouped import UX (report family cards + branch slots + per-card progress) gives clear operator feedback.

### 11.2 PSF Improvements Derived From Warranty Audit

1. Introduce PSF run-level trace payload fields mirroring warranty-style provenance:
   - source_file_name
   - source_row_number
   - source_row_hash (strong hash)
   - optional raw row snapshot for dispute investigations
2. Use stronger PSF hash contract (SHA-256) for deterministic re-upload reconciliation metadata.
3. Keep explicit location/portal/branch normalization before conflict-stage upsert.
4. Preserve per-card progress and branch-wise processing telemetry as first-class operator signals.

### 11.3 Critical Guardrail Confirmed By Warranty Audit (Applied To PSF)

1. Upsert conflict keys must always be backed by real unique constraints in DB truth.
2. If a conflict target is not schema-backed, treat it as non-idempotent and block rollout.
3. Admin-only operational restrictions must be enforced at app/workflow layer and not assumed from permissive authenticated table policies.

### 11.4 Evidence Anchors Used For Cross-Learning

1. Baseline manifest: supabase/evidence/authoritative_dump_manifest.json
2. Authoritative dump: local_folder/backups/full_database.sql
3. Large-file mirror: local_folder/backups/chunks/full_database.sql.part_*
4. Overlay file: supabase/evidence/post_dump_verified_promotions.md
5. Import runtime logic source: src/pages/ImportPage.tsx

### 11.5 PSF-Only Reusable Checklist (Execution Order)

Use this checklist only for PSF (job_card_closed_data) under /import.

1. Conflict-key validation
   - Confirm live DB unique key matches PSF upsert conflict target.
   - Current expected key: (branch, job_card_number, invoice_date).
   - Done when: test re-upload updates existing rows and does not duplicate.

2. Invoice-date normalization gate
   - Normalize/derive invoice_date before mutation stage for every row.
   - Reject rows that cannot produce a valid invoice_date.
   - Done when: zero rows reach upsert with null/blank invoice_date.

3. Source provenance fields
   - Persist source_file_name, source_row_number, source_row_hash for PSF run traceability.
   - Keep field naming stable across releases.
   - Done when: random sampled imported rows can be traced back to exact source line.

4. Strong hash contract
   - Use SHA-256 for source_row_hash generation.
   - Record hash version contract in implementation notes.
   - Done when: same input row always yields same hash across environments.

5. Scoped lock and concurrency control
   - Add PSF import lock by table+scope for each run.
   - Reject second concurrent run on same scope with actionable message.
   - Done when: simulated parallel upload produces one success and one lock rejection.

6. Run-audit ledger
   - Log mode, operator, timestamps, file hash, inserted/updated/skipped/failed counters, failure reason.
   - Persist both success and failure terminal states.
   - Done when: every PSF run has one complete audit record.

7. Timeout and retry guardrails
   - Add bounded retry with backoff for retryable errors.
   - Stop run with explicit reason at timeout threshold.
   - Done when: timeout and retry paths are visible in audit ledger and UI message.

8. Admin-only replace enforcement
   - Enforce replace-scoped mode in application workflow checks, not only table policies.
   - Require explicit scope + confirmation before execution.
   - Done when: non-admin cannot trigger replace path in UI/API flow.

9. Post-deploy proof set
   - Capture: re-upload idempotency evidence, lock conflict evidence, timeout evidence, and audit-log query output.
   - Done when: evidence bundle is attached in plan/evidence docs and signed off.

---

## 12. Recommended Execution Plan (PSF Canonicalization: branch -> location, drop branch_label)

Objective:
1. Make location + portal the only canonical analytical/business dimensions for PSF.
2. Remove legacy ambiguity caused by branch and branch_label.
3. Preserve production safety by migrating read-paths and constraints before dropping columns.

### 12.1 Target Contract

1. Canonical dimensions:
   - location = branch/location business dimension
   - portal = fuel/business dimension
2. Legacy columns to remove after migration:
   - branch_label
   - branch
3. Write-path source of truth:
   - Primary: Service Advisor ID -> employee_master.employee_code -> employee_master.location + employee_master.fuel_type
   - Fallback SA-code mapping:
     - 3000840 -> Sitapura + PV
     - 500A840 -> Sitapura + EV
     - 3001440 -> Ajmer Road + PV

### 12.2 Phase A - Write Path Hardening (No Column Drop Yet)

1. Compute location and portal first for every PSF row.
2. If employee_master lookup fails, apply fallback SA-code mapping.
3. If both fail, reject row with explicit reason code (do not insert ambiguous dimensions).
4. Keep branch temporarily as compatibility mirror of location only.
5. Keep branch_label temporarily as compatibility mirror of location only.

Exit criteria:
1. 100% of inserted PSF rows have valid location and portal.
2. 0 rows inserted with unresolved canonical dimensions.

### 12.3 Phase B - Read Path Replacement

1. Replace job_card_closed_data.branch reads with location in PSF consumers.
2. Replace branch_label display fallback with location.
3. Update filters/grouping to location + portal semantics.
4. Keep temporary compatibility fallback only where needed during cutover window.

Priority hotspots (execute first):
1. src/lib/reportQueries.ts
2. mobile/src/lib/reportQueries.ts
3. src/pages/SATrackerPage.tsx
4. src/pages/FloorInchargePage.tsx

Exit criteria:
1. No critical dashboard/report path depends on branch_label.
2. PSF filters and summaries remain parity-stable after switch.

### 12.4 Phase C - Constraint and Upsert Key Migration

1. Create canonical unique key for PSF upsert using location + portal + job_card_number + invoice_date.
2. Backfill/dedupe existing rows to satisfy new key.
3. Switch importer conflict target to canonical key.
4. Validate re-upload idempotency under canonical key only.

Exit criteria:
1. Upsert path no longer depends on branch key.
2. Duplicate re-upload test passes for Ajmer Road PV, Sitapura PV, Sitapura EV.

### 12.5 Phase D - Drop Legacy Columns

1. Drop branch_label only after read-path migration is complete.
2. Drop branch only after:
   - canonical key is active,
   - upsert target switched,
   - compatibility window closed.

Exit criteria:
1. No runtime query selects/filters/joins on branch or branch_label for PSF.
2. Production smoke checks and report parity checks pass.

### 12.6 Go/No-Go Checks Before Final Drop

1. Code search returns no PSF runtime references to branch_label.
2. Code search returns no PSF runtime references to job_card_closed_data.branch.
3. Import upsert conflicts run only on canonical key.
4. Re-upload idempotency evidence captured for all three canonical dealer mappings.
5. Audit ledger confirms stable run outcomes across daytime and scheduled windows.

### 12.7 Rollback Strategy

1. Keep reversible migration sequence until post-cutover validation completes.
2. If parity breaks, revert read-path switch first, then constraint switch, then column drops.
3. Never perform destructive column drops and key switch in the same deployment step.

---

## 13. Deep Frontend Audit (Web + Mobile) And Step-by-Step Execution Matrix

Audit date:
1. 2026-06-26

Audit scope:
1. Web frontend: src/**
2. Mobile frontend: mobile/src/**
3. Focus: branch/branch_label/location/portal usage and job_card_closed_data query dependencies

### 13.1 Quantified Impact Summary

1. Total keyword surface (web + mobile): 2,188 matches.
2. Web keyword matches: 1,454.
3. Mobile keyword matches: 734.
4. Web branch-sensitive job_card_closed_data query matches: 58.
5. Mobile branch-sensitive job_card_closed_data query matches: 14.

Interpretation:
1. This is a high-blast-radius schema change.
2. branch/branch_label drop must be staged with explicit compatibility gates.

### 13.2 job_card_closed_data-Specific Critical Files

Web (direct references):
1. src/lib/reportQueries.ts
2. src/pages/ImportPage.tsx
3. src/pages/TechnicianPage.tsx
4. src/pages/reports/performance/AdvisorPerformanceReport.tsx
5. src/pages/SettingsPage.tsx
6. src/pages/SATrackerPage.tsx
7. src/pages/BodyshopTrackerPage.tsx
8. src/lib/getTableColumns.ts
9. src/lib/database.types.ts

Mobile (direct references):
1. mobile/src/lib/reportQueries.ts
2. mobile/src/components/reports/AdvisorPerformanceMobile.tsx
3. mobile/src/app/(tabs)/import.tsx
4. mobile/src/lib/getTableColumns.ts
5. mobile/src/lib/database.types.ts

### 13.3 Highest-Risk Breakpoints (Observed)

1. Import write path still writes branch and branch_label for PSF rows.
2. Report query layer still applies branch-based filtering for job_card_closed_data.
3. Several UI filter experiences use location fallback to branch; dropping branch early will break fallback assumptions.
4. Mobile report query layer mirrors branch-based filtering patterns and must be migrated in lockstep before schema drop.

### 13.4 Step-by-Step Implementation Matrix (Execution Sequence)

Step 1: Create compatibility contract
1. Keep branch and branch_label present during transition.
2. Force branch and branch_label to mirror location on write.
3. Freeze new feature work touching PSF branch semantics until cutover complete.

Step 2: Web read-path migration first
1. Primary file: src/lib/reportQueries.ts
2. Replace job_card_closed_data branch filters with location-based filters.
3. Preserve portal behavior unchanged.
4. Update dependent pages incrementally:
   - src/pages/SATrackerPage.tsx
   - src/pages/TechnicianPage.tsx
   - src/pages/reports/performance/AdvisorPerformanceReport.tsx
   - src/pages/BodyshopTrackerPage.tsx

Step 3: Mobile read-path migration second
1. Primary file: mobile/src/lib/reportQueries.ts
2. Replace job_card_closed_data branch filters with location-based filters.
3. Update dependent mobile consumers:
   - mobile/src/components/reports/AdvisorPerformanceMobile.tsx
   - mobile/src/app/(tabs)/import.tsx (read/display consistency)

Step 4: Shared schema adapters and typing updates
1. Update src/lib/getTableColumns.ts and mobile/src/lib/getTableColumns.ts contracts.
2. Update src/lib/database.types.ts and mobile/src/lib/database.types.ts to remove branch_label usage and deprecate branch for PSF rows.
3. Keep temporary optional branch typing only during compatibility window.

Step 5: Constraint and upsert cutover
1. Add canonical unique key using location + portal + job_card_number + invoice_date.
2. Switch importer conflict target to canonical key.
3. Validate idempotent re-upload behavior on all canonical dealer/fuel mappings.

Step 6: Column drop (final)
1. Drop branch_label after web+mobile read-path parity is verified.
2. Drop branch only after canonical key switch and no-runtime-reference gate passes.

### 13.5 Mandatory Gates Between Steps

Gate A (after Step 2):
1. Web regression suite green for PSF reports and trackers.
2. No web critical query path reads job_card_closed_data.branch_label.

Gate B (after Step 3):
1. Mobile report flows parity-verified for PSF-derived widgets.
2. No mobile critical query path reads job_card_closed_data.branch_label.

Gate C (before Step 6):
1. Code search: zero runtime references to job_card_closed_data.branch in web+mobile report query layers.
2. Code search: zero runtime references to job_card_closed_data.branch_label.
3. Production dry-run evidence captured for importer, reports, and tracker pages.

### 13.6 Out-of-Scope Clarifier For This Audit Section

1. This section audits full frontend impact for safe planning.
2. It does not expand IMPORT-002 functional execution beyond PSF scope.
3. Non-PSF tables that legitimately use branch are not part of this migration.
