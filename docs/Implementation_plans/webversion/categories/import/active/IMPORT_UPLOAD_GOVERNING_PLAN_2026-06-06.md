# Import Upload Governing Plan (PSF-First Rollout)

Status: Proposed
Owner: Engineering + Product + Ops
Created: 2026-06-06
Authority: local_folder/backups/full_database.sql

## 1. Objective

Define the governing upload architecture for all cards in the import module, with phased rollout starting from PSF.
PSF pilot uses strict single-table dedupe and merge enforcement on job_card_closed_data.

Pilot scope (Phase 1) includes:
1. PSF Revenue Report (job_card_closed_data) only.

Deferred scope (Phase 2) after PSF pilot validation:
1. Invoice Order Data (service_invoice_order_data)
2. VAS Data (service_vas_jc_data)

Warranty Reports remain on existing 4-slot UX.

## 1A. Glossary

1. Branch: operational label used by legacy flows; for PSF this is a mirror of location.
2. Location: canonical branch dimension for PSF (Ajmer Road, Sitapura).
3. Portal: canonical fuel-type dimension for PSF (PV, EV).
4. Fuel Type: source value from employee_master.fuel_type; mapped directly to portal.
5. Service Advisor ID: source identifier mapped to employee_master.employee_code.

## 1B. Canonical Field Contract

1. Canonical dimensions for PSF are location and portal.
2. branch is not an independent source of truth in PSF after cutover.
3. Derivation path is strictly one-directional:
   1. Service Advisor ID -> employee_master.employee_code
   2. employee_master.location -> row.location
   3. employee_master.fuel_type -> row.portal
   4. row.branch = row.location (legacy compatibility mirror)
4. Upload processing must not derive location or portal from UI slot/branch selection.
5. Validation must block rows where employee mapping is missing location or fuel_type.
6. Allowed enums:
   1. location in (Ajmer Road, Sitapura)
   2. portal in (PV, EV)
7. Reporting and analytics must aggregate PSF by location and portal; branch may be read only as a compatibility alias.

## 1C. Final Long-Term Recommendation (PSF-First)

Target architecture for analytics and operations is typed ingestion plus typed business tables, not row-level JSON as the primary analytics model.

1. Keep two data layers:
   1. Typed landing layer for source-feed ingestion contracts.
   2. Typed curated business layer for app operations and reporting.
2. Do not use row JSON blobs as the primary query surface for business analytics.
3. Keep auditability via batch and error tracking (import batch metadata and row-level validation errors), not via runtime dedupe side tables.
4. For PSF (job_card_closed_data), enforce single-table dedupe and merge only:
   1. Unique key on (location, portal, job_card_number).
   2. Upsert on this key.
   3. No runtime dependency on signature table.
5. Phase adoption rule:
   1. Implement this architecture for PSF first.
   2. Expand the same architecture to each remaining upload card only after PSF pilot is validated and signed off.

## 2. Business Rules To Enforce

1. Routing key is Service Advisor ID, resolved to employee_master.employee_code.
2. Row location is derived from employee_master.location.
3. Row portal is derived from employee_master.fuel_type.
4. Rows with unresolved Service Advisor ID are blocked.
5. Rows with conflicting mapping (for example code found but missing location or fuel_type) are blocked.
6. Upload success must show cumulative session counts by report, location, and portal.
7. For PSF Revenue Report (job_card_closed_data), duplicate Job Card Number in the same location and portal must update the existing row, not insert a new row.
8. PSF merge mode is last-upload-wins for mutable business fields, while preserving created_at semantics.

## 3. Data Model Changes

Add location and portal columns to Revenue tables to match Warranty pattern.

Phase 1 tables:
1. public.job_card_closed_data

Phase 2 tables:
1. public.service_invoice_order_data
2. public.service_vas_jc_data

Columns:
1. location text not null
2. portal text not null

Constraints:
1. location in (Ajmer Road, Sitapura)
2. portal in (PV, EV)

Indexes:
1. location
2. portal
3. location + portal
4. branch + location + portal for reporting filters

PSF idempotency constraint:
1. Add unique key for job_card_closed_data on (location, portal, job_card_number).
2. Runtime dedupe source of truth must be only this unique key and upsert conflict handling.
3. Do not use job_card_closed_data_import_signatures for runtime dedupe.

Backfill policy:
1. For existing rows, infer location from existing branch where possible.
2. For existing rows without deterministic portal, backfill portal using employee_code to employee_master.fuel_type.
3. Any remaining unknowns must be reported and resolved before final not-null enforcement.

## 4. Frontend UX Changes

Revenue section:
1. Replace 4 branch slots with one slot per Revenue card.
2. Keep card-level Upload All button.
3. Keep row-ready counters.
4. Add pre-upload validation summary:
   1. total rows
   2. mapped rows
   3. blocked rows
   4. split preview by location and portal

Warranty section:
1. Keep existing 4-slot behavior unchanged.

UI copy:
1. Revenue: replace branch-slot wording with Service Advisor ID auto-routing wording.
2. Warranty: keep branch and portal wording.
3. Remove any revenue copy that claims dealer-code auto-routing unless that path is truly used.

## 5. Upload Processing Changes

Revenue parsing:
1. Parse rows from single file.
2. Read Service Advisor ID column aliases.
3. Resolve employee using employee_master index by employee_code.
4. Derive location and portal from matched employee row.

Row build:
1. Set row.location and row.portal from mapping.
2. Set row.branch to canonical location value used in current schema compatibility layer.
3. Enforce single-table upsert semantics only.

PSF merge behavior:
1. Upsert job_card_closed_data using conflict target (location, portal, job_card_number).
2. On duplicate JC number, update row with latest uploaded values for invoice/order business columns.
3. Keep deterministic auditability by storing latest import metadata and merge counters.
4. Reject rows where job_card_number is blank before merge stage.
5. Remove dependency on trigger-based signature insertion for dedupe outcomes.

Validation gates:
1. Block upload if any unresolved Service Advisor IDs exist.
2. Block upload if mapped employee has missing location or fuel_type.
3. Block upload if derived location or portal falls outside allowed enum values.

Error export:
1. Generate downloadable CSV for blocked rows.
2. Include columns:
   1. source_row_number
   2. service_advisor_id
   3. reason_code
   4. reason_detail
   5. suggested_action

## 6. Session Cumulative Upload Tracking

Need visible progress in current user session for Revenue uploads.

Track dimensions:
1. report table name
2. location
3. portal
4. inserted rows
5. deduped or merged rows
6. blocked rows

Persistence:
1. Maintain in React state.
2. Mirror in sessionStorage keyed by user id + login timestamp + dealer scope.
3. Clear on logout.

Display:
1. Revenue summary strip at top of Revenue group.
2. Show per-report and total counts.
3. Show missing coverage hints, for example Sitapura EV not uploaded in this session.

## 7. Analytics and Reporting Alignment

Add Revenue analytics support by location and portal.

Actions:
1. Update reports queries to aggregate using location and portal for Revenue tables.
2. Preserve backward compatibility for historical rows during backfill window.
3. Add QA check that Revenue and Warranty portal totals can be compared consistently.

## 8. Migration Plan

Migration set (ordered):
1. Add nullable location and portal columns to public.job_card_closed_data.
2. Backfill location using branch normalization map.
3. Backfill portal from employee_master.fuel_type via employee_code.
4. Add check constraints for allowed values.
5. Add indexes.
6. Enforce not null after unresolved rows reach zero.
7. Update unique or upsert conflict keys for PSF merge semantics.
8. Disable and remove trigger paths that write to job_card_closed_data_import_signatures.
9. Remove function public.fn_jc_closed_dedupe_and_merge() if unused after trigger drop.
10. Drop table public.job_card_closed_data_import_signatures after cutover validation.
11. Create separate Phase 2 migration set for service_invoice_order_data and service_vas_jc_data after pilot sign-off.

Safety:
1. Ship reversible migrations.
2. Keep old code path behind feature flag until validation passes.
3. Signature-table drop is final cutover step only after production smoke checks pass.

## 9. Feature Flag and Rollout

Flag: revenue_single_file_autorouting_v1

Rollout steps:
1. Deploy schema migrations.
2. Deploy frontend with flag off.
3. Enable PSF-only mode for internal admin users.
4. Validate real PSF uploads for all three Service Advisor code families.
5. Enable PSF-only mode for all users.
6. Prepare next upload-card rollout only after PSF stabilization and sign-off.
7. Apply the same contract incrementally to each upload in the import module.
8. Remove legacy slot-driven behavior card-by-card only after each card passes pilot checks.

## 10. Test Plan

Unit tests:
1. Service Advisor ID mapping to location and portal.
2. Validation failure categories.
3. Session cumulative counter reducer logic.

Integration tests:
1. Single-file PSF upload with mixed Service Advisor IDs routes correctly.
2. Blocked-row CSV download content correctness.
3. Warranty flow unchanged.
4. PSF duplicate JC in same location and portal updates existing row and does not create a second row.
5. PSF duplicate JC across different portal remains isolated by portal and does not overwrite cross-portal rows.

Phase 2 integration tests (deferred):
1. Invoice Order single-file routing and merge behavior.
2. VAS single-file routing behavior.

Database tests:
1. Constraint checks for location and portal.
2. Backfill completeness checks.
3. Aggregation query correctness by location and portal.
4. Verify no active trigger on job_card_closed_data writes to signature table.
5. Verify upsert on (location, portal, job_card_number) alone handles re-upload idempotency.

User acceptance tests:
1. User can complete Revenue upload without branch slot selection.
2. User sees what is done and missing in current session.
3. User can download and fix blocked rows.

## 11. Risks and Mitigations

Risk 1: Employee master missing fuel_type values.
Mitigation: preflight report and mandatory data cleanup before not-null enforcement.

Risk 2: Historical rows without deterministic portal.
Mitigation: staged backfill and explicit unresolved queue.

Risk 3: Behavior drift between Revenue and Warranty upload code.
Mitigation: shared routing utilities and shared validation error model.

Risk 4: False upload failures from dedupe/merge semantics.
Mitigation: success criteria based on processed outcome, not only net row growth.

## 12. Acceptance Criteria

1. Revenue uploads use one file per report.
2. Rows are routed by Service Advisor ID via employee_master location and fuel_type.
3. Revenue tables store location and portal for new rows.
4. Upload blocks unresolved or conflicting mapping rows and exports downloadable error CSV.
5. Warranty flow remains unchanged.
6. Session cumulative counts show done vs missing by location and portal.
7. Reports support EV vs PV analytics for Revenue.
8. PSF duplicates by JC number are merged as updates within (location, portal), not duplicated.

Phase 1 pilot completion criteria:
1. All above criteria are met for PSF Revenue Report (job_card_closed_data).
2. Phase 2 rollout for Invoice Order and VAS is not started until PSF pilot sign-off.
3. job_card_closed_data_import_signatures is no longer used at runtime.
4. Signature trigger/function retired and table dropped after cutover checks.

## 13. Work Breakdown

Phase A: Schema readiness
1. Add columns, backfill, constraints, indexes for job_card_closed_data.
2. Produce unresolved mapping audit output.
3. Add unique key for single-table upsert on (location, portal, job_card_number).
4. Prepare migration to retire trigger/function and drop signatures table.

Phase B: Frontend behavior
1. PSF single-slot UI.
2. PSF routing + validation + blocked CSV.
3. Session cumulative counters and UI for PSF.

Phase C: Analytics (PSF first)
1. Update PSF aggregations to include location and portal.
2. Validate parity against Warranty dimensions where applicable.

Phase D: Rollout
1. Feature-flagged PSF release.
2. Pilot with admin users.
3. PSF full rollout.
4. Phase 2 design and rollout for Invoice Order and VAS.

## 14. Additional Items You Were Missing

1. Explicit unresolved-row remediation workflow owner (Ops or Admin team).
2. Feature flag rollback criteria and trigger thresholds.
3. Backfill verification checklist before turning on not-null constraints.
4. Consistent canonical enum values for location and portal to avoid case drift.
5. Telemetry events for upload outcomes: mapped, blocked, deduped, merged.
6. Permission check that only users with import access can download blocked-row diagnostics.

## 15. Immediate Next Step

Create Phase 1 migration draft for PSF-only single-table enforcement: add location and portal, add unique key (location, portal, job_card_number), then prepare trigger/function retirement and signature-table drop after validation. After PSF production sign-off, execute the same contract card-by-card across remaining import uploads.
