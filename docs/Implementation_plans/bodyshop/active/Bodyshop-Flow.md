# Implementation Plan: BODYSHOP-002

**Plan ID:** BODYSHOP-002  
**Created:** 2026-06-11  
**Priority:** HIGH  
**Owner:** Techwheels Product + Web Dev Team  

---

## Executive Summary

This plan implements the Bodyshop intake split at Service Advisor level without changing current Reception receiving flow. Reception remains the source where vehicle receiving is already done. Any entry with service type `Accident` must be treated as Bodyshop work in Service Advisor via a dedicated `Bodyshop` category in Filter by category.

The plan keeps existing `Floor` category behavior unchanged, routes non-Floor and non-Bodyshop rows to `Others`, and enables Bodyshop-specific advisor tasks: setting Customer Type (`Individual`, `Firm`, `FOC`, `Cash`) and uploading vehicle photos with a hard limit of 20 images per job.

**Risk Level:** 🟡 MEDIUM  
**Estimated Duration:** 2-4 working days (web + QA + UAT)  
**Rollback Strategy:** Revert category mapping and hide Bodyshop-specific controls behind a feature flag while retaining already captured bodyshop metadata.

---

## Schema Authority Lock (Mandatory)

- Treat `local_folder/backups/full_database.sql` as the authoritative schema and full database dump. Authority never downgrades.
- If direct file access is blocked by size limits, use `local_folder/backups/chunks/full_database.sql.part_*` as the access mirror of the same dump.
- Never invent tables, columns, functions, triggers, or RLS policies not present in the active authoritative source.
- If any conflict appears, prefer the local dump without reconciliation.

---

## Execution Governance (Live Plan Auto-Update)

- This file is the live source of implementation truth for BODYSHOP-002.
- After every heavy implementation or behavioral change, update all three blocks in this file in the same cycle:
  - `Implementation Tasks` checklist status
  - `Activity Tracker` row-level status/date/notes
  - `Notes & Lessons Learned` dated entry
- For each update, capture:
  - What changed
  - Files/modules touched
  - Validation performed (build, localhost, QA)
  - Remaining blocker/dependency
- Status discipline:
  - `⏳ PENDING`: not started
  - `🔄 IN PROGRESS`: started but not complete
  - `✅ COMPLETED`: implemented and locally validated
  - `❌ BLOCKED`: waiting on schema/migration/approval/external dependency

Formatting note:
- Ignore pasted rich-text artifacts (example: `p.p1`, `p.p2` CSS snippets) unless explicitly required in implementation scope.

---

## Objectives

1. Add Bodyshop as a first-class Service Advisor category for Accident jobs.
2. Keep Floor category logic exactly as-is (no behavior change).
3. Route all remaining non-empty service types to Others.
4. Capture Bodyshop Customer Type and vehicle photos (max 20) from Service Advisor workflow.
5. Ensure Reception remains the existing vehicle receiving source of truth.
6. Keep `bodyshop-floor` and `bodyshop-repair` flows as explicitly planned later-use integration phases.
7. Deprecate `service_branches` by implementing Employee Master winner-logic as the canonical branch/fuel source, then drop `service_branches` safely.

---

## Context & Background

Current process:
- Vehicle receiving is already executed in Reception.
- Reception rows with service type `Accident` belong to Bodyshop.
- Service Advisor currently uses category split logic with `All`, `Floor`, `Other`, `Null`.

Required process:
- Service Advisor must expose `Bodyshop` category containing all Accident entries.
- Remaining entries continue under `Others`.
- `Floor` category must stay unchanged.
- For Bodyshop entries only, advisor performs extra intake tasks:
  - Set Customer Type: Individual, Firm, FOC, Cash
  - Upload vehicle photos, maximum 20 images.

Later-use modules to include in this plan:
- Bodyshop Floor: https://techwheels-service.vercel.app/bodyshop-floor
- Bodyshop Repair Tracker: https://techwheels-service.vercel.app/bodyshop-repair

---

## Bodyshop Job Card Stage Catalog (UI-Aligned)

Source: Current Bodyshop Repair UI flow shown in attached screenshot (`/bodyshop-repair`).

This plan is locked to the following 18 stages and naming sequence:

1. Vehicle Receiving
2. Receiving Photos
3. Job Card
4. Customer Group
5. Documentation
6. Estimation
7. Estimation Approval
8. Claim Intimation
9. Survey
10. Parts Status
11. Floor Assignment
12. Additional Approval
13. Quality Check
14. Re-Inspection
15. Billing
16. DO Status
17. Delivery
18. Payment

Stage-governance note:
- `bodyshop-floor` integration focus: Stage 11 (`Floor Assignment`) and dependencies from Stage 10.
- `bodyshop-repair` integration focus: complete Stage 1-18 lifecycle continuity.

---

## Scope Definition

### In Scope
- Service Advisor category update: `All`, `Floor`, `Bodyshop`, `Others`, `Null`.
- Category mapping rules for Accident, Floor-allowed service types, and fallback Others.
- Bodyshop-only fields/actions in Service Advisor:
  - Customer Type selector
  - Vehicle photo upload with max 20 constraint
- Backend API changes required for persisting bodyshop intake metadata.
- Validation and UX guardrails for photo count and file type.
- Later-phase wiring of Bodyshop intake outputs into:
  - `bodyshop-floor` assignment flow
  - `bodyshop-repair` repair-card lifecycle and stage progression
- Service branch-source simplification:
  - **Phase A (implement now):** remove runtime dependency on `service_branches` in web/mobile paths and enforce Employee Master precedence (forced Location/Fuel Type wins over SA-code derivation and legacy row values).
  - **Phase B (prepare now, execute after validation):** additive drop migration plan for `public.service_branches`.

### Out of Scope
- Any change to Reception receiving flow.
- Any change to Floor category eligibility logic.
- Full bodyshop stage-engine redesign.
- Mobile implementation (tracked separately).

### Deferred But Included (Later Use)
- Integration hardening between Service Advisor Bodyshop intake and `bodyshop-floor` page behavior.
- Integration hardening between Service Advisor Bodyshop intake and `bodyshop-repair` card lifecycle.
- Cross-module reconciliation checks across `service-advisor`, `bodyshop-floor`, and `bodyshop-repair`.

---

## Functional Rules (Lock)

1. If `service_type` is `Accident` (case-insensitive), category is `Bodyshop`.
2. If `service_type` is in existing Floor allowed set, category is `Floor`.
3. If `service_type` is empty/null, category is `Null`.
4. Else category is `Others`.
5. Floor logic must remain backward-compatible with current behavior.
6. Bodyshop extra tasks are visible only for Bodyshop rows.
7. Per job card, vehicle photo count cannot exceed 20.

---

## Implementation Tasks

### Phase 1: Category Routing and UI Filters
- [x] **Task 1.1:** Extend category enum and mapping to include `Bodyshop` and `Others` naming.
- [x] **Task 1.2:** Add Bodyshop category chip in Service Advisor toolbar and counts.
- [x] **Task 1.3:** Preserve current Floor mapping set and verify no regression.
- [x] **Task 1.4:** Update summary/filter computations that depend on category values.

### Phase 2: Bodyshop Intake Data Capture
- [x] **Task 2.1:** Add Bodyshop-only Customer Type selector (`individual`, `firm`, `foc`, `cash`).
- [x] **Task 2.2:** Map/save Customer Type to bodyshop repair card data contract.
- [x] **Task 2.3:** Add Bodyshop-only vehicle photo uploader in Service Advisor row/detail.
- [x] **Task 2.4:** Enforce client-side max 20 image cap per job card.
- [x] **Task 2.5:** Add backend-side safety validation for max photo count.

### Phase 3: Storage, Validation, and Auditability
- [x] **Task 3.1:** Define storage path convention for bodyshop intake photos.
- [x] **Task 3.2:** Persist uploaded file metadata (job card linkage, uploader, timestamp).
- [x] **Task 3.3:** Validate allowed MIME types and max file size.
- [x] **Task 3.4:** Add error states for duplicate/overflow/failed upload.

### Phase 4: QA, UAT, and Rollout
- [ ] **Task 4.1:** Build test matrix for category split behavior.
- [ ] **Task 4.2:** Validate Accident rows appear only in Bodyshop category.
- [ ] **Task 4.3:** Validate Floor category remains unchanged.
- [ ] **Task 4.4:** Validate Others bucket excludes Floor + Bodyshop rows.
- [ ] **Task 4.5:** Validate photo limit (20 allowed, 21 blocked) and Customer Type persistence.

### Phase 5: Later-Use Module Integration (Bodyshop Floor + Repair)
- [ ] **Task 5.1:** Confirm Service Advisor Bodyshop rows are traceable in `bodyshop-floor` assignment keys (reg/jc alignment).
- [ ] **Task 5.2:** Confirm Customer Type and intake photo references are available to `bodyshop-repair` workflows.
- [ ] **Task 5.3:** Add reconciliation report/checklist for mismatches across Service Advisor, Bodyshop Floor, and Bodyshop Repair.
- [ ] **Task 5.4:** Validate no duplicate or orphan bodyshop repair cards are created from Accident intake.
- [ ] **Task 5.5:** UAT sign-off for end-to-end handoff: Reception -> Service Advisor Bodyshop -> Bodyshop Floor -> Bodyshop Repair.
- [ ] **Task 5.6:** Validate stage continuity across all 18 bodyshop stages in `bodyshop-repair`.
- [ ] **Task 5.7:** Validate Stage 10 (`Parts Status`) -> Stage 11 (`Floor Assignment`) handoff integrity for floor operations.

### Phase 6: `service_branches` Deprecation (Branch/Fuel Winner Logic)
- [x] **Task 6.1 (Phase A):** Implement runtime source-of-truth precedence in Reception/Service Advisor/Floor Incharge/Bodyshop Repair and mobile Bodyshop Repair so Employee Master forced `location` + `fuel_type` always win.
- [x] **Task 6.2 (Phase A):** Replace branch option/filter data sources currently reading `service_branches` with Employee Master/location-derived datasets.
- [x] **Task 6.3 (Phase A):** Remove unused `service_branches` API usage from web/mobile modules; keep behavior parity in filters.
- [x] **Task 6.4 (Phase B):** Prepare migration file to drop `public.service_branches` (table, policies, and sequence) after Phase A validation sign-off.
- [ ] **Task 6.5 (Phase B):** Execute drop migration only after QA confirms no runtime reads remain and no branch/fuel regressions exist.

### Phase 7: Bodyshop V2 Parent-Child Convergence
- [x] **Task 7.1:** Create dedicated docs child table with one-slot-per-doc contract (`repair_card_id`, `doc_key`) and Drive link fields.
- [x] **Task 7.2:** Backfill/attach `repair_card_id` across bodyshop child tables and add FK constraints.
- [x] **Task 7.3:** Enforce strict parent-child contract (`repair_card_id` mandatory where applicable) after fail-fast prechecks.
- [x] **Task 7.4:** Ensure `reception_entry_id` index coverage across bodyshop child tables.
- [x] **Task 7.5:** Standardize dealer-scoped RLS across bodyshop child tables (admin/service-role compatibility retained).

### Phase 8: Insurance Auto-Fetch in Bodyshop SA Docs
- [x] **Task 8.1:** Add `Fetch` button in SA -> Docs -> Insurance Details section on `bodyshop-repair`.
- [x] **Task 8.2:** Read insurance fields from `rto_cache` for current registration and map to card fields:
  - `api_rc_vehicle_insurance_policy_number` -> `insurance_policy_no`
  - `api_rc_vehicle_insurance_company_name` -> `insurance_company`
  - `api_rc_vehicle_insurance_upto` -> `insurance_valid_date`
- [x] **Task 8.3:** Apply freshness gate: if latest cache row is older than 30 days, call existing edge lookup path used by AutoDoc (`invoke-ocean025`) and then re-read mapped values.
- [x] **Task 8.4:** Persist fetched values to `bodyshop_repair_cards` and surface success/failure toast states.
- [ ] **Task 8.5:** Add QA checks for cache-hit, stale-refresh, and API-failure fallback behavior.

### Phase 9: Insurance Type Parity (Authoritative Schema + UI)
- [x] **Task 9.1:** Audit authoritative dump mirror and confirm `bodyshop_repair_cards` insurance columns include `insurance_policy_no`, `insurance_company`, `insurance_valid_date`, and `insurance_type`.
- [x] **Task 9.2:** Add manual `Insurance Type` field in SA -> Docs -> Insurance Details with allowed values `TMI` and `Non-TMI` placed side-by-side with `Valid Until`.
- [x] **Task 9.3:** Add additive migration script to persist `insurance_type` in `bodyshop_repair_cards` with value check constraint.
- [ ] **Task 9.4:** Validate authenticated `/bodyshop-repair` end-to-end persistence/readback for existing `insurance_type` schema in target DB.

### Phase 10: Stage 11 + Stage 12 Parallel Additional Approval Workflow
- [x] **Task 10.1:** Re-audit authoritative schema for Additional Approval capability before design.
- [x] **Task 10.2:** Confirm current authoritative constraints:
  - `bodyshop_repair_cards.additional_approval` exists as text only.
  - `bodyshop_repair_card_documents.doc_key` allows only existing keys (`doc_*`, `doc_estimate`, `doc_survey_approval`) and has no dedicated additional-approval doc key.
- [ ] **Task 10.3:** Define additive migration scope for required data contract (request details, requested/decision state, timestamps/actors, and image/document linkage) with backward compatibility.
- [ ] **Task 10.4:** Implement Bodyshop Floor row action:
  - Add `Additional Approval` button per vehicle row.
  - Open popup with fields: Part No, Part Description, Reason (Remark), Part Image.
  - Submit should persist request and keep vehicle active in Stage 11 while also entering Stage 12 queue.
- [ ] **Task 10.5:** Implement Repair Tracker Stage Queue concurrency rule:
  - A card can be simultaneously visible in Stage 11 (`Floor Assignment`) and Stage 12 (`Additional Approval`) while floor work continues and approval is pending.
- [ ] **Task 10.6:** Implement Stage sidebar sub-stage extension under Stage 11:
  - Add `Additional Approval` status node alongside role substages.
- [ ] **Task 10.7:** Implement Survey tab section `Additional Approval Requested`:
  - Show request details captured from Bodyshop Floor.
  - Add decision actions: `Approved` and `Rejected`.
  - On `Approved`, require approval photo upload before finalizing approval state.
- [ ] **Task 10.8:** Implement Bodyshop Floor notification/rendering:
  - Show `Additional Approval = Approved/Rejected/Pending`.
  - Provide `View` action for approved photo/document.
- [ ] **Task 10.9:** Validate end-to-end state transitions and cross-page consistency on localhost + UAT.

### Phase 11: Initial Approved Parts Capture (Survey Tab - Parts Status Stage 10)
- [x] **Task 11.1:** Audit authoritative schema and confirm `bodyshop_repair_cards.approved_parts` column availability (present in active authoritative dump).
- [ ] **Task 11.2:** Define approved_parts data contract (JSON structure with part_index, part_no, part_description, approved_at, approved_by, finalized_at, finalized_by).
- [ ] **Task 11.3:** Add `Initial Approved Parts` section in Survey tab, visible only when:
  - `surveyStatus === 'approved'`
  - `surveyApprovalPhotoUploaded === true`
- [ ] **Task 11.4:** Implement approved parts form:
  - Dynamic list with Part No and Part Description fields per part.
  - Add Part button to add more parts.
  - Remove Part button for multi-part rows.
  - Submit/Finalize button to lock approved parts list.
- [ ] **Task 11.5:** Implement approved parts display mode (read-only after finalized):
  - Show finalized approved parts with timestamp + actor.
  - Prevent edit after finalization (must request new parts via Additional Approval Requested if needed).
- [ ] **Task 11.6:** Update Stage 10 (Parts Status) completion logic:
  - `stage10Done` if: `approvedPartsFinalized === true` AND `additionalApproval.status !== 'pending'` (or 'none').
  - Stage 10 becomes incomplete again if additional approval is requested later.
- [ ] **Task 11.7:** Validate persistence:
  - Store approved_parts JSON to bodyshop_repair_cards.approved_parts.
  - Ensure history tracking of finalization actor and timestamp.
- [ ] **Task 11.8:** End-to-end UAT:
  - Capture initial approved parts after survey approval photo upload.
  - Finalize parts list.
  - Request additional approval for new parts separately.
  - Verify both sections render together correctly.
  - Confirm Stage 10 completion logic respects both initial + additional workflows.

### Phase 12: Bodyshop Role-Gated Visibility (SA Code + Tab Access)
- [x] **Task 12.1:** Lock row visibility in `bodyshop-repair` for non-admin BODY SHOP SA users by SA code mapping only.
  - Resolve current user -> linked employee codes via `user_employee_links`.
  - Resolve employee attributes via `employee_master` (`department`, `role`, `employee_code`).
  - If Department = `BODY SHOP` and Role = `SA`, show only rows where `bodyshop_repair_cards.sa_employee_code` is in linked SA codes.
  - If SA user has no linked SA code, show empty-state guidance (no fallback to all rows).
- [x] **Task 12.2:** Keep Overview tab visible for any authenticated user with module access.
- [x] **Task 12.3:** Gate tab visibility by BODY SHOP role mapping:
  - `SA` tab: Department `BODY SHOP` + Role `SA`
  - `Approval` tab: Department `BODY SHOP` + Role `SSA`
  - `Survey` tab: Department `BODY SHOP` + Role `SURVEY`
  - `Floor` tab: Department `BODY SHOP` + Role `FLOOR INCHARGE`
  - `QC` and `Billing`: deferred (no business-role rollout in this phase)
- [x] **Task 12.4:** Admin compatibility mode:
  - Admin/Super Admin retain full tab access for support and troubleshooting.
  - Non-admin users get deny-by-default for tabs not mapped to their BODY SHOP role.
- [x] **Task 12.5:** Save/Upload guard alignment:
  - Ensure `Save Receiving` and `Attach photos` are usable only on rows visible under SA-code scope.
  - Prevent silent failures by surfacing clear toast/error if policy blocks update/upload.
- [ ] **Task 12.6:** QA matrix for role-gating:
  - BODY SHOP + SA with valid SA code link: own rows visible; `SA` tab visible.
  - BODY SHOP + SSA with valid link: `Approval` tab visible.
  - BODY SHOP + SA without SA code link: no rows visible; clear guidance shown.
  - BODY SHOP + SURVEY: `Survey` tab visible; `SA/SSA-Approval/Floor` hidden.
  - BODY SHOP + FLOOR INCHARGE: `Floor` tab visible; `SA/SSA-Approval/Survey` hidden.
  - Mixed-role user (multiple employee links): union of allowed tabs.
  - Admin/Super Admin: all tabs visible, no SA-code row restriction.
- [ ] **Task 12.7:** UAT sign-off evidence:
  - Capture screenshots/video for each role profile.
  - Verify no regression in stage transitions and existing bodyshop intake persistence.
- [x] **Task 12.8:** Root-cause hardening (no future SA-code drift):
  - Add DB trigger on `service_reception_entries` (insert/update for Accident rows) to upsert/sync `bodyshop_repair_cards` SA fields by `reception_entry_id`.
  - Ensure late SA changes in Reception (`sa_employee_code`, `sa_display_name`) are propagated to Bodyshop cards automatically.
  - Add paired SQL checks for drift count (`service_reception_entries` vs `bodyshop_repair_cards`) and trigger existence.
- [x] **Task 12.9:** Audit Permissions/Module Access page contract for SA-stage execution.
  - Ensure user has at least one module with `modify`: `service_advisor` or `reception` or `bodyshop_repair`.
  - Ensure user has at least one module with `view`: `service_advisor` or `reception` or `bodyshop_repair` (or floor/tracker where applicable).
  - Ensure user has active `user_employee_links` + `employee_master` role mapping for BODY SHOP row/tab gating.
  - Ensure `Effective Access Summary` reflects expected dealer scope and active mapping count before UAT.
- [x] **Task 12.10:** Execute and verify SA-stage policy hardening migration in target DB.
  - Migration: `supabase/migrations/20260616183000_bodyshop_sa_stage_policy_hardening.sql`
  - Checks: `supabase/sql_checks/20260616183000_bodyshop_sa_stage_policy_hardening_checks.sql`

---

## Activity Tracker

> **Update this section in real-time as work progresses.**

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 1
```
✅ 1.1 | Add Bodyshop category mapping | Web Dev | 2026-06-11 | 2026-06-11 | Implemented in Service Advisor category resolver
✅ 1.2 | Add Bodyshop category chip/count | Web Dev | 2026-06-11 | 2026-06-11 | Added chip with live counts in filter bar
✅ 1.3 | Regression check for Floor logic | QA/Web Dev | 2026-06-11 | 2026-06-11 | Floor set unchanged; verified with localhost filter behavior
✅ 1.4 | Update derived filter counts | Web Dev | 2026-06-11 | 2026-06-11 | Others and Bodyshop counts active
```

### Phase 2
```
✅ 2.1 | Add Customer Type selector | Web Dev | 2026-06-11 | 2026-06-11 | Added for Accident rows in Service Advisor table
✅ 2.2 | Persist Customer Type | Web Dev + API | 2026-06-11 | 2026-06-11 | Synced to bodyshop_repair_cards on save
✅ 2.3 | Add vehicle photo uploader | Web Dev | 2026-06-11 | 2026-06-11 | Added Attach photos action for Accident rows
✅ 2.4 | Enforce max 20 photos (UI) | Web Dev | 2026-06-11 | 2026-06-11 | Enforced before upload, image-only selection
✅ 2.5 | Enforce max 20 photos (backend) | API | 2026-06-11 | 2026-06-11 | Migration executed; DB trigger guard active
```

### Phase 3
```
✅ 3.1 | Finalize storage path format | API/Web Dev | 2026-06-11 | 2026-06-11 | dealer_code/service-advisor-bodyshop-intake/<entry_id>/...
✅ 3.2 | Persist metadata records | API | 2026-06-11 | 2026-06-11 | Metadata rows now inserted to bodyshop_intake_vehicle_photos
✅ 3.3 | MIME/size validation | API | 2026-06-11 | 2026-06-11 | DB check + universal-drive wiring active for intake photos
✅ 3.4 | Error handling UX | Web Dev | 2026-06-11 | 2026-06-11 | Added user-facing errors for missing JC/customer type/photos and overflow
```

### Phase 4
```
⏳ 4.1 | Execute category split tests | QA | - | - | all/floor/bodyshop/others/null
⏳ 4.2 | Validate Accident routing | QA | - | - | accident -> bodyshop only
⏳ 4.3 | Validate Floor non-regression | QA | - | - | same as existing
⏳ 4.4 | Validate Others routing | QA | - | - | excludes floor and bodyshop
⏳ 4.5 | Validate bodyshop intake fields | QA + UAT | - | - | customer type + max 20 photos
```

### Phase 5
```
⏳ 5.1 | Verify SA -> Bodyshop Floor traceability | QA + Web Dev | - | - | jc/reg mapping parity
✅ 5.2 | Verify SA -> Bodyshop Repair data handoff | QA + Web Dev | 2026-06-11 | 2026-06-11 | SA Accident intake now syncs to repair cards + intake photo metadata/drive links
⏳ 5.3 | Add cross-module reconciliation checklist | QA | - | - | service-advisor/bodyshop-floor/bodyshop-repair
✅ 5.4 | Validate duplicate/orphan prevention (app + DB hardening) | QA + API | 2026-06-11 | 2026-06-12 | Canonical reception identity migration prepared; app write paths aligned to reception key
⏳ 5.5 | Complete end-to-end UAT handoff sign-off | Ops + QA | - | - | reception -> SA -> floor -> repair
🔄 5.6 | Validate 18-stage continuity in bodyshop-repair | QA + Ops | 2026-06-11 | - | Stages 1-4 now auto-progress from SA signals (customer type, photos, jc no)
⏳ 5.7 | Validate Stage10->Stage11 floor handoff | QA + Floor Team | - | - | parts status to floor assignment gate
```

### Phase 6
```
✅ 6.1 | Enforce Employee Master winner precedence (web/mobile) | Web Dev | 2026-06-12 | 2026-06-12 | Reception enrichment precedence updated to Employee Master first, legacy row fallback last
✅ 6.2 | Replace service_branches runtime option sources | Web Dev | 2026-06-12 | 2026-06-12 | Bodyshop web/mobile and Settings branch section moved off service_branches table reads
✅ 6.3 | Remove residual service_branches API reads | Web Dev | 2026-06-12 | 2026-06-12 | Removed service_branches API methods/usages; runtime grep confirms zero refs in src/mobile
✅ 6.4 | Prepare drop migration for service_branches | API | 2026-06-12 | 2026-06-12 | Added `supabase/migrations/20260612130500_drop_service_branches_after_phase_a.sql`
⏳ 6.5 | Execute drop migration + post-checks | API + QA | - | - | run only after zero runtime usage verification
```

### Phase 7
```
✅ 7.1 | Create bodyshop docs child-table contract | API | 2026-06-12 | 2026-06-12 | Executed `20260612170000_add_bodyshop_repair_card_documents.sql`
✅ 7.2 | Backfill child->parent repair_card_id links + add FKs | API | 2026-06-12 | 2026-06-12 | Executed `20260612181000_bodyshop_v2_parent_child_backfill.sql`
✅ 7.3 | Apply strict parent-child enforcement | API | 2026-06-12 | 2026-06-12 | Executed `20260612183000_bodyshop_v2_parent_child_strict_enforcement.sql`
✅ 7.4 | Align child-table dealer-scoped RLS policies | API | 2026-06-12 | 2026-06-12 | Executed `20260612182000_bodyshop_v2_rls_alignment.sql`
✅ 7.5 | Validate FK + parent-link contract readiness | API + QA | 2026-06-12 | 2026-06-12 | Migration pipeline completed end-to-end without strict-phase abort
```

### Phase 8
```
✅ 8.1 | Plan insurance fetch UX + data source contract | Web Dev + API | 2026-06-12 | 2026-06-12 | Fetch in SA Docs insurance block implemented using existing RC lookup path
✅ 8.2 | Implement rto_cache mapped field hydration | Web Dev + API | 2026-06-12 | 2026-06-12 | policy/company/valid-until mapped from latest cache row
✅ 8.3 | Implement 30-day stale refresh via invoke-ocean025 | API | 2026-06-12 | 2026-06-12 | edge lookup called only when cache row missing/stale, then cache re-read
✅ 8.4 | Persist + toast state handling on card save | Web Dev | 2026-06-12 | 2026-06-12 | updates bodyshop_repair_cards insurance fields with success/failure toasts
⏳ 8.5 | QA matrix for hit/stale/failure paths | QA | - | - | include provider failure fallback and no-data path
```

### Phase 9
```
✅ 9.1 | Authoritative schema parity audit for Insurance Type | Web Dev | 2026-06-12 | 2026-06-12 | chunk mirror confirms bodyshop_repair_cards includes insurance_type in active dump
✅ 9.2 | Add SA Docs Insurance Type field (TMI/Non-TMI) | Web Dev | 2026-06-12 | 2026-06-12 | UI field added beside Valid Until in bodyshop-repair docs card
✅ 9.3 | Prepare additive insurance_type migration script | API/Web Dev | 2026-06-12 | 2026-06-12 | added scripts/18_add_insurance_type_to_bodyshop_repair_cards.sql
⏳ 9.4 | Validate authenticated persistence/readback on /bodyshop-repair | API + QA | - | - | schema is present in authoritative dump; pending post-login verification
```

### Phase 10
```
✅ 10.1 | Authoritative Additional Approval schema audit | Web Dev | 2026-06-15 | 2026-06-15 | confirmed only bodyshop_repair_cards.additional_approval (text) exists in active dump
✅ 10.2 | Authoritative doc-key constraint audit | Web Dev | 2026-06-15 | 2026-06-15 | confirmed bodyshop_repair_card_documents has no dedicated additional-approval doc key
⏳ 10.3 | Draft additive migration contract for approval request lifecycle | API + Web Dev | - | - | required before full UX delivery
⏳ 10.4 | Add Bodyshop Floor Additional Approval button + popup | Web Dev | - | - | Part No, Part Description, Reason, Part Image
⏳ 10.5 | Stage queue parallel visibility (Stage 11 + Stage 12) | Web Dev | - | - | pending approval should not block floor worklist presence
⏳ 10.6 | Sidebar Stage 11 sub-node: Additional Approval | Web Dev | - | - | show status with existing floor substages
⏳ 10.7 | Survey tab decision panel (Approved/Rejected + photo gate) | Web Dev | - | - | approved requires approval photo before finalize
⏳ 10.8 | Bodyshop Floor status + view approved photo | Web Dev | - | - | render approval state and view action
⏳ 10.9 | End-to-end validation + UAT sign-off | QA + Ops | - | - | verify consistency across bodyshop-floor and bodyshop-repair
```

### Phase 11
```
✅ 11.1 | Audit approved_parts column in authoritative dump | Web Dev | 2026-06-16 | 2026-06-16 | chunk mirror confirms bodyshop_repair_cards.approved_parts exists in active dump
⏳ 11.2 | Define approved_parts JSON contract (part_index, part_no, part_description, actor/timestamp fields) | Product + Web Dev | - | - | finalized_at/finalized_by tracking required for stage completion gate
⏳ 11.3 | Add Initial Approved Parts section in Survey tab (visible post-survey-approval) | Web Dev | - | - | show only when surveyStatus='approved' && approvalPhotoUploaded
⏳ 11.4 | Implement dynamic parts form (add/remove, Part No, Part Description, Finalize button) | Web Dev | - | - | client-side validation before submit
⏳ 11.5 | Implement read-only display mode after finalization | Web Dev | - | - | finalized parts locked; changes require new Additional Approval Requested flow
⏳ 11.6 | Update Stage 10 completion logic for approved_parts + additional_approval dual flow | Web Dev | - | - | stage10Done = approvedPartsFinalized AND (additionalApproval.status='none' OR 'approved' OR 'rejected')
⏳ 11.7 | Persist approved_parts JSON and finalization metadata | API + Web Dev | - | - | upsert to bodyshop_repair_cards.approved_parts with actor/timestamp
⏳ 11.8 | Complete end-to-end UAT (initial + additional parallel workflows) | QA + Ops | - | - | verify both sections, stage completion logic, and re-activation on additional approval request
```

### Phase 12
```
✅ 12.1 | Enforce SA-code row visibility in bodyshop-repair | Web Dev | 2026-06-16 | 2026-06-16 | query-time scoping + deny-by-default empty state
✅ 12.2 | Keep Overview visible for module-access users | Web Dev | 2026-06-16 | 2026-06-16 | overview always available; hidden tabs fallback handled
✅ 12.3 | Role-tab gating implementation | Web Dev | 2026-06-16 | 2026-06-16 | SA tab for SA, Approval tab for SSA, Survey/Floor role-mapped
✅ 12.4 | Admin compatibility mode in tab visibility | Web Dev | 2026-06-16 | 2026-06-16 | admin/super_admin retain full support tabs
✅ 12.5 | Save/Upload flow guard alignment | Web Dev + API | 2026-06-16 | 2026-06-16 | receiving/docs/estimate/claim writes now policy-aligned
✅ 12.8 | Root-cause sync hardening migration + checks prepared | API | 2026-06-16 | 2026-06-16 | added 20260616170000 trigger sync + sql_checks
✅ 12.9 | Permissions/Module Access page contract audited | Web Dev + QA | 2026-06-16 | 2026-06-16 | effective summary + module rights requirements documented
✅ 12.10 | Execute 20260616183000 policy hardening migration + checks | User + QA | 2026-06-16 | 2026-06-16 | SQL Editor execution complete; RLS enabled + expected v2/v3 policies + storage autodoc policies confirmed
⏳ 12.7 | UAT evidence pack (SA/SSA/Survey/Floor/Admin) | QA + Ops | - | - | screenshots + flow videos pending
```

---

## Dependencies & Prerequisites

- [ ] Product sign-off on category labels: Bodyshop and Others.
- [x] Final decision on bodyshop photo metadata table contract.
- [x] Storage bucket path convention approval.
- [ ] UAT sample entries covering Accident + non-Accident service types.
- [x] DB-level canonical key hardening for bodyshop cards (`reception_entry_id` + uniqueness) executed and active.
- [ ] Phase A deprecation validation sign-off: zero runtime dependency on `service_branches` in web/mobile.
- [x] Authoritative schema parity confirmed for `insurance_type` in `bodyshop_repair_cards` (no additional schema-creation migration prerequisite).
- [ ] Additional Approval additive migration approved and executed before implementing full request lifecycle UI.
- [x] Execute `supabase/migrations/20260616183000_bodyshop_sa_stage_policy_hardening.sql` in target DB and archive results of `supabase/sql_checks/20260616183000_bodyshop_sa_stage_policy_hardening_checks.sql`.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Floor behavior unintentionally changed | Medium | High | Keep existing Floor set untouched and add regression tests |
| Inconsistent service type casing/spelling | High | Medium | Normalize service_type for mapping (trim + lowercase) |
| Photo over-upload or heavy files | Medium | Medium | Client + server cap, type/size validation |
| Split source of truth for customer type | Medium | Medium | Persist to bodyshop card model as canonical store |
| Branch/fuel precedence conflict across legacy rows vs Employee Master | High | High | Enforce winner logic in code: Employee Master forced values first, SA-code derive fallback, legacy row values last |
| Premature `service_branches` drop causing runtime break | Medium | High | Two-phase plan: remove all code reads first, then drop table migration after QA sign-off |

---

## Success Criteria

- ✅ Service Advisor shows Bodyshop category with Accident entries only.
- ✅ Floor category behavior is unchanged versus baseline.
- ✅ Others contains remaining non-empty non-Floor non-Bodyshop entries.
- ✅ Bodyshop entries support Customer Type capture with allowed values.
- ✅ Bodyshop entries support vehicle photo upload up to 20 images maximum.
- ✅ `bodyshop-floor` receives consistent accident/bodyshop handoff data from Service Advisor.
- ✅ `bodyshop-repair` receives consistent customer-type and intake-photo context without duplicate card drift.
- ✅ `bodyshop-repair` uses the locked 18-stage sequence exactly as defined in this plan.
- ✅ Stage 10 (`Parts Status`) to Stage 11 (`Floor Assignment`) transitions are operationally and technically consistent.
- ✅ Phase A complete: no runtime reads from `service_branches` in targeted web/mobile modules; Employee Master winner logic active.
- ✅ Phase B complete: `public.service_branches` dropped via migration with no regressions in branch/fuel filters and assignments.
- ✅ SA Docs includes manual Insurance Type capture (`TMI`/`Non-TMI`) and persists once additive migration is executed.
- ✅ Stage 11 and Stage 12 can run in parallel for the same vehicle when additional approval is requested.
- ✅ Survey tab can approve/reject Additional Approval requests with mandatory approval photo on approve.
- ✅ Bodyshop Floor shows Additional Approval state and supports viewing approved proof image.

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Product Owner: _______________ (Signature) (Date)
- [ ] Web Dev Lead: _______________ (Signature) (Date)
- [ ] Service Ops Lead: _______________ (Signature) (Date)
- [ ] QA Lead: _______________ (Signature) (Date)

---

## Notes & Lessons Learned

### 2026-06-11 - Plan Kickoff
- Requirement locked: Reception remains receiving source.
- Requirement locked: Accident entries route to Bodyshop category in Service Advisor.
- Requirement locked: Floor category remains unchanged.
- Requirement locked: Bodyshop advisor must capture Customer Type and up to 20 vehicle photos.
- Requirement added: `bodyshop-floor` and `bodyshop-repair` are included as later-use integration phases in this plan.

### 2026-06-15 - Additional Approval Parallel Workflow Requirement Captured
- New business requirement captured from localhost validation:
  - Bodyshop Floor needs per-row `Additional Approval` action with popup fields: Part No, Part Description, Reason, Part Image.
  - Same vehicle must be operationally present in both Stage 11 and Stage 12 while approval is pending.
  - Stage 11 sidebar must include `Additional Approval` as an additional sub-status line.
  - Survey tab must expose `Additional Approval Requested` details and decision actions (`Approved`, `Rejected`) with mandatory approval photo on approve.
  - Bodyshop Floor must reflect approval decision state and provide approved-photo view action.
- Authoritative schema checkpoint completed from chunk mirror:
  - `bodyshop_repair_cards.additional_approval` exists only as text in current dump.
  - `bodyshop_repair_card_documents.doc_key` does not include an additional-approval-specific key in current dump.
- Execution gate set:
  - Full feature delivery is migration-gated and will proceed via additive schema change from authoritative baseline (no destructive change, no authority downgrade).

### 2026-06-11 - Stage Catalog Lock (From UI Screenshot)
- Added and locked 18-stage bodyshop sequence from current `/bodyshop-repair` flow.
- Added Stage 10 -> Stage 11 integration validation as a dedicated later-phase checkpoint.

### 2026-06-11 - Implementation Progress Update (Phase 1 + Phase 2 Partial)
- Implemented Service Advisor category behavior: `Accident` -> `Bodyshop`, Floor unchanged, fallback `Others`.
- Implemented Accident-row behavior:
  - `Estimate` and `Invoice` actions not applicable
  - Mandatory `JC Number`
  - Mandatory `Customer Type`
  - `Attach photos` action with max 20 images
  - Save blocked until required Accident fields are satisfied
- Implemented bodyshop card sync on save: `customer_type` and base card fields are upserted to `bodyshop_repair_cards`.
- Local validation done on localhost (`/service-advisor`) with Bodyshop category rows.
- Current blocker outside this scope: unrelated TypeScript build error in Floor Incharge page (`unused getFuelTypeLabel`).

### 2026-06-16 - Phase 11: Initial Approved Parts Workflow Requirement Added
- New business requirement to enhance Stage 10 (Parts Status) visibility:
  - Employee needs to capture pre-approved parts immediately after Survey Approval Photo upload + Survey Status approved.
  - New section: `Initial Approved Parts` (rendered between Survey Approval section and Additional Approval Requested section on Survey tab).
  - Use case: Parts supervisor knows which parts are definitely needed (captured early), separate from later additional-approval flow.
  - Architecture: Use existing `approved_parts` JSON column in bodyshop_repair_cards if available, else additive migration.
  - UI: Dynamic form to add/remove parts (Part No, Part Description), Finalize button to lock list.
  - Stage completion: Stage 10 done when `approvedParts.finalized === true` AND `additionalApproval.status !== 'pending'`.
  - Workflow independence: Initial approved parts finalization does NOT prevent Additional Approval Requested from appearing later for new/changed parts.
- Phase 11 is the final gate for Stage 10 completion visibility; planning to start implementation 2026-06-16.

### 2026-06-11 - Database Authority Reminder Applied
- Re-validated bodyshop schema from authoritative dump: `local_folder/backups/full_database.sql`.
- Confirmed `bodyshop_repair_cards` exists with `customer_type` but no dedicated intake-photo metadata table exists in authoritative source.
- Deferred backend-hard safety tasks (2.5, 3.2, 3.3) until additive migration is created from authoritative baseline.

### 2026-06-11 - Migration File Prepared (Not Executed)
- Created additive migration file only (no execution):
  - `supabase/migrations/20260611235900_bodyshop_intake_vehicle_photos_metadata_and_rls.sql`
- Migration contents:
  - New table `public.bodyshop_intake_vehicle_photos`
  - Max-20-per-reception-entry backend trigger guard
  - Universal Drive link fields: `drive_url`, `drive_file_id`
  - Updated-at trigger using `public.set_updated_at()`
  - RLS enablement and RBAC policies
  - Required grants/indexes/comments
- Status: ready for user-controlled apply in database environment.

### 2026-06-11 - SQL Editor Handoff (Run Now)
- Migration to run now in Supabase SQL Editor:
  - `supabase/migrations/20260611235900_bodyshop_intake_vehicle_photos_metadata_and_rls.sql`
- Execution mode:
  - Run full file as one script (single transaction block from `begin;` to `commit;`).
  - Do not split statements across separate editor runs.

Post-run verification (read-only checks):
1. Table + columns
```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bodyshop_intake_vehicle_photos'
order by ordinal_position;
```

2. RLS enabled
```sql
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relname = 'bodyshop_intake_vehicle_photos';
```

3. Policies created
```sql
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'bodyshop_intake_vehicle_photos'
order by policyname;
```

4. Trigger + function present
```sql
select trigger_name
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'bodyshop_intake_vehicle_photos'
order by trigger_name;

select proname
from pg_proc
where proname = 'enforce_bodyshop_intake_photo_limit';
```

5. Drive-link fields present
```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bodyshop_intake_vehicle_photos'
  and column_name in ('drive_url', 'drive_file_id')
order by column_name;
```

After migration apply:
- Update this plan entries to `✅ COMPLETED` for Task 2.5 and Task 3.2/3.3.
- Next implementation step in app code: write metadata rows (including `drive_url`, `drive_file_id`) immediately after universal-drive-upload returns success.

### 2026-06-11 - Post Migration Integration Completed
- User confirmed migration `20260611235900_bodyshop_intake_vehicle_photos_metadata_and_rls.sql` executed successfully.
- Implemented app-side integration:
  - Service Advisor Accident photo upload now inserts into `public.bodyshop_intake_vehicle_photos`
  - Calls `universal-drive-upload` with resource type `bodyshop_intake_photo`
  - Persists Drive outputs in metadata row (`drive_url`, `drive_file_id`) via edge function update
- Extended edge function contract to support `bodyshop_intake_photo` resource mapping.

### 2026-06-11 - Universal Upload Stability + Bodyshop Repair Intake Sync
- Architecture decision locked: keep one shared edge function for uploads across the project (`universal-drive-upload`); no separate bodyshop-only upload function.
- Universal function contract refined for clarity:
  - Reception estimate/invoice continues to require `reception_entry_id`
  - Bodyshop intake photo path uses explicit `resource_id` (`bodyshop_intake_vehicle_photos.id`)
  - Existing upload resource behavior remains unchanged for backward compatibility.
- Deployed function update:
  - `supabase functions deploy universal-drive-upload`
  - Deployment confirmed on project `jmdndcphkmaljhwgzqxq`.

### 2026-06-11 - Bodyshop Repair Visibility from Accident Reception
- Implemented automatic intake-card sync in `/bodyshop-repair` load cycle:
  - Fetches `service_reception_entries` with `service_type = Accident` for selected date range
  - Creates missing `bodyshop_repair_cards` as Stage 1 intake rows
  - Uses keying guard (JC number, fallback registration number) to avoid duplicate inserts.
- Outcome: all Accident receptions are visible in Bodyshop Repair as intake cards without manual card creation.

### 2026-06-11 - Stage Auto-Progression Rules from Service Advisor Signals
- Implemented stage sync for all Bodyshop/Accident rows from Service Advisor into `bodyshop_repair_cards`:
  - If customer type is set -> Stage 1 done, Stage 2 active (`Receiving Photos`)
  - If at least one intake photo exists -> Stage 2 done, Stage 3 active (`Job Card`)
  - If JC number is present -> Stage 3 done, Stage 4 active (`Customer Group`)
- Behavior note:
  - Sync is forward-only (`max(current_stage, desired_stage)`) to prevent stage rollback.
  - Photo upload path triggers row reload so stage updates reflect immediately in UI.
- Local validation:
  - Verified in localhost Service Advisor and Bodyshop Repair flows.
  - Known unrelated build blocker remains: unused symbol in `FloorInchargePage.tsx`.

### 2026-06-11 - Duplicate Bodyshop Card Hotfix Across Modules
- Root-cause observed: same vehicle/job card being written from multiple modules without a DB uniqueness guard on `bodyshop_repair_cards`.
- Implemented app-level duplicate prevention now:
  - Reception: create path checks existing card by JC, fallback reg, before insert.
  - Service Advisor: save path updates latest matching card deterministically (duplicate-safe lookup; no `maybeSingle` for potentially duplicated keys).
  - Bodyshop Floor: first-assignment path checks existing card by JC/reg before insert.
  - Bodyshop Repair: accident auto-intake insert guard checks both JC and reg keys.
  - Bodyshop Repair: render list dedupes to latest record per key so repeated historical duplicates are not shown as separate cards.
  - Bodyshop Repair API `createRepairCard`: now reuses existing card (JC/reg) and updates instead of always inserting.
- Validation:
  - Local production build passes after hotfix.
- Scope note:
  - This hotfix prevents new duplicate drift in app paths and suppresses duplicate display.
  - Long-term canonical fix remains DB-level schema hardening (`reception_entry_id` identity + unique constraint).

### 2026-06-12 - Canonical Reception Identity Hardening Implemented (Code + Migration)
- Added migration file:
  - `supabase/migrations/20260612001000_bodyshop_repair_cards_canonical_reception_identity.sql`
- Migration actions:
  - Adds `reception_entry_id` to `public.bodyshop_repair_cards`
  - Backfills reception linkage from Accident reception rows using JC/reg matching preference
  - Deletes duplicate rows keeping latest per `reception_entry_id`
  - Adds FK to `public.service_reception_entries(id)` and unique partial index on `reception_entry_id`
  - Adds index on `reception_entry_id` for lookup performance
- App alignment to canonical key:
  - Service Advisor now reads/updates Bodyshop cards primarily by `reception_entry_id`
  - Reception accident-create path writes `reception_entry_id` and checks existing by that key first
  - Bodyshop Floor first-assignment path checks/inserts by `reception_entry_id`
  - Bodyshop Repair accident sync inserts with `reception_entry_id`; dedupe prefers canonical reception key
  - Bodyshop Repair API `createRepairCard` now resolves/uses `reception_entry_id` and blocks orphan creation when no Accident reception source is found
- Validation:
  - Local production build passes after all updates.

### 2026-06-12 - RLS Permission Alignment for Service Advisor Save Path
- Issue observed: Service Advisor users with module edit rights saw save failure:
  - `new row violates row-level security policy for table "bodyshop_repair_cards"`
- Root cause from authoritative schema snapshot:
  - `bodyshop_repair_cards` had admin-only policy and no module-RBAC insert/update/select policy equivalent to Service Reception and intake-photo tables.
- Added migration file:
  - `supabase/migrations/20260612004500_bodyshop_repair_cards_rbac_for_sa_and_reception.sql`
- Migration adds module-scoped RBAC policies for `authenticated` on `bodyshop_repair_cards`:
  - SELECT: `service_advisor`, `reception`, `bodyshop_floor`, `bodyshop_repair`, `bodyshop_tracker`
  - INSERT/UPDATE: `service_advisor`, `reception`, `bodyshop_repair`
  - Dealer-scope checks via linked `service_reception_entries.dealer_code` (canonical `reception_entry_id`) with `sa_employee_code` dealer-code fallback.
- Expected outcome:
  - Service Advisor save can update bodyshop card sync without requiring admin role, while preserving dealer-scope isolation.

### 2026-06-12 - RLS Migration Execution Confirmed
- User confirmed execution in SQL Editor:
  - `supabase/migrations/20260612004500_bodyshop_repair_cards_rbac_for_sa_and_reception.sql`
- Next validation target:
  - SA role should be able to save Accident rows in Service Advisor without `bodyshop_repair_cards` RLS violation.

### 2026-06-12 - Bodyshop Repair UI Naming Clarification (Card vs Opened View)
- Confirmed terminology for `/bodyshop-repair` tracker behavior:
  - Outer clickable tile in the grid is the **Repair Card summary card** (list card).
  - Opened view after click is the **Detail Full-Screen overlay** rendered via portal (not a separate per-card route).
- Behavior lock:
  - Clicking a list card sets `selected` and opens the full-screen detail experience.
  - Back action clears `selected` and returns to the list.
  - URL remains `/bodyshop-repair`; detail is in-page overlay state, not a new route.

### 2026-06-12 - `service_branches` Deprecation Strategy Locked (Phase A + Phase B)
- Decision locked:
  - Implement **Phase A now**: remove runtime dependency on `service_branches` and enforce Employee Master winner precedence for branch/fuel (`forced Location/Fuel Type` wins).
  - Prepare **Phase B now**: migration to drop `public.service_branches`, to be executed only after Phase A QA sign-off.
- Rationale:
  - `service_branches` is currently a legacy UI helper and adds maintenance burden.
  - Authoritative schema scan shows no FK blocker; runtime code references remain and must be removed before drop.

### 2026-06-12 - Phase A Implemented + Phase B Drop Migration Prepared
- Phase A implementation completed in code:
  - Removed runtime `service_branches` reads from web/mobile Bodyshop Repair paths.
  - Removed `service_branches` CRUD API methods from reception API module.
  - Converted Settings -> Branch Management to Employee Master derived read-only branch list.
  - Updated Reception enrichment precedence so Employee Master location/fuel wins over legacy row values.
- Phase B preparation completed:
  - Added migration file `supabase/migrations/20260612130500_drop_service_branches_after_phase_a.sql`.
- Pending:
  - Execute Phase B migration only after QA validates branch/fuel behavior parity in Reception, Service Advisor, Floor Incharge, and Bodyshop Repair.

### 2026-06-12 - SA/Bodyshop Intake UX + Stage Governance Consolidation
- Bodyshop SA intake stage semantics tightened in app code:
  - Stage 1 completion now requires both `Customer Type` and `KM Reading`.
  - Stage 2 completion requires at least one intake photo.
  - Stage 3 completion requires Job Card availability.
  - Stage 4 completion is explicit via `Send WA` action (no generic auto-complete).
- Receiving workflow UX consolidated:
  - Unified `Save Receiving` flow now persists both receiving form fields and KM updates together.
  - Duplicate save-path behavior removed for receiving intake.
- WA click auditability completed (DB + app consumption):
  - Added migration `supabase/migrations/20260612142000_capture_customer_group_wa_click_metadata.sql`.
  - `bodyshop_repair_cards` now stores `customer_group_wa_sent_at` and `customer_group_wa_sent_by`.
  - Trigger captures actor/time on first Stage 4 -> Stage 5 transition.
  - SA/Bodyshop UI now reads and displays persisted WA metadata.
- SA tab information architecture updated:
  - Removed standalone top `Docs` tab from bodyshop detail view.
  - Full documentation form is now rendered inside SA -> `Docs` card on click.
  - Compact SA cards with stage abbreviations and status colors implemented (`Done`, `Pending`, `Not Started`).
  - SA sub-card content now lazy-renders only after card selection; deselection hides content.
- Data correction support added:
  - Added targeted reset script for one-card replay from Reception source:
    - `scripts/16_reset_bodyshop_progress_jc_mbtplt_jp2_2627_002479.sql`
  - Script now enforces existing linked reception row, re-syncs base reception fields, resets bodyshop progression fields, and clears intake photo metadata rows for the linked reception entry.

### 2026-06-12 - Mandatory Docs Upload/View/Replace Schema + Wiring
- New migration prepared for manual execution:
  - `supabase/migrations/20260612170000_add_bodyshop_repair_card_documents.sql`
- Migration adds authoritative persistence for SA docs rows:
  - New table `public.bodyshop_repair_card_documents`
  - Unique slot per repair card + document key (`repair_card_id`, `doc_key`)
  - RLS + dealer-scoped policies + admin bypass policy
  - Updated-at trigger via `public.set_updated_at()`
- Universal uploader extended:
  - `supabase/functions/universal-drive-upload/index.ts` now supports `resource_type = bodyshop_document`
  - Resolves row by `resource_id`, uploads/replaces in Google Drive, writes `drive_url` + `drive_file_id` back to `bodyshop_repair_card_documents`
- Bodyshop Repair UI wired:
  - `src/pages/BodyshopRepairPage.tsx` now renders per-document actions for each mandatory/optional row:
    - `Upload`
    - `View`
    - `Replace`
  - Upload path persists metadata row + invokes universal uploader + marks corresponding doc boolean on `bodyshop_repair_cards`.

### 2026-06-12 - Bodyshop V2 Parent-Child Convergence (Executed)
- Requirement implemented: strict parent-child contract for bodyshop child tables with `bodyshop_repair_cards` as canonical parent.
- Migrations executed in order:
  - `supabase/migrations/20260612170000_add_bodyshop_repair_card_documents.sql`
  - `supabase/migrations/20260612181000_bodyshop_v2_parent_child_backfill.sql`
  - `supabase/migrations/20260612182000_bodyshop_v2_rls_alignment.sql`
  - `supabase/migrations/20260612183000_bodyshop_v2_parent_child_strict_enforcement.sql`
- Schema convergence delivered:
  - Added/filled `repair_card_id` linkage on child tables that lacked parent linkage.
  - Enforced strict parent-linking (`repair_card_id` not-null where applicable) after backfill checks.
  - Ensured `reception_entry_id` indexing coverage across bodyshop child tables.
  - Validated FK constraints after backfill and before strict mode completion.
- RLS convergence delivered:
  - Standardized dealer-scoped RBAC policy model on bodyshop child tables.
  - Preserved admin bypass and service-role backend compatibility.
- Data-safety posture:
  - Backfill phase remained additive and non-destructive.
  - Strict phase configured fail-fast to block silent corruption if orphan rows were present.

### 2026-06-12 - Plan Documentation Consolidation
- Plan governance decision: keep `Bodyshop-Flow.md` as single active source of implementation truth.
- V2 parent-child migration planning content has been consolidated into this active file.
- Separate active plan file for V2 was removed to avoid split tracking.

### 2026-06-12 - Audit Addendum (Live URL + Authoritative Dump)
- Audit scope executed:
  - Live page: `https://techwheels-service.vercel.app/bodyshop-repair`
  - Schema authority: `local_folder/backups/full_database.sql` with chunk mirror `local_folder/backups/chunks/full_database.sql.part_*`
- Live audit observation:
  - URL is authentication-gated in current audit session; unauthenticated surface renders sign-in page only.
  - Post-login stage interactions could not be directly validated in this run.
- Authoritative schema finding (from chunk mirror):
  - `public.bodyshop_repair_cards` contains `insurance_policy_no`, `insurance_company`, `insurance_valid_date`.
  - `insurance_type` is present in other tables (example: open/cancel/closed job-card style tables), but not in `bodyshop_repair_cards` in active dump.
- Implementation outcome aligned to finding:
  - Added Insurance Type UI in Bodyshop SA Docs with fixed options: `TMI`, `Non-TMI`.
  - Added additive migration script: `scripts/18_add_insurance_type_to_bodyshop_repair_cards.sql` with check constraint for allowed values.
- Pending closure criteria:
  - Manual migration execution in target DB.
  - Authenticated UAT on `/bodyshop-repair` to validate fetch + manual override + save persistence behavior.

### 2026-06-13 - Bodyshop Floor Multi-Role Assignment Phase
- **Requirement:** Extend Bodyshop Floor page assignment UI from 3 roles to 5 roles with inline multi-assignment support per role.
  - Add 2 new primary roles: **Electrician ⚡** and **DET 🧰** (primary allocation, same as existing 3)
  - Each role supports inline `+` button to add multiple support people (no popup/modal)
  - All roles (Dentor, Painter, Technician, Electrician, DET) support stage tracking when assigned as primary
  - Support people can be assigned for any role (all 5 roles accept additional support)

- **Schema Authority Verified (from authoritative dump):**
  - **Primary roles table:** `public.bodyshop_assignments` (final model: one-row-per-job-card)
    - One active row per `job_card_number` enforced by index `uq_bodyshop_assignments_active_job_card`
    - Primary assignee columns for all 5 roles in same row:
      - `dentor_employee_code`, `dentor_employee_name`
      - `painter_employee_code`, `painter_employee_name`
      - `technician_employee_code`, `technician_employee_name`
      - `electrician_employee_code`, `electrician_employee_name`
      - `det_employee_code`, `det_employee_name`
    - Role-wise stage columns in same row:
      - `<role>_work_status`, `<role>_remark`, `<role>_out_ts`
    - Role-wise IN timestamp columns in same row:
      - `<role>_in_ts`
  - **Support roles table:** `public.bodyshop_floor_support_assignments` (new, module-isolated)
    - Support role constraint: `DENTOR | PAINTER | TECHNICIAN | ELECTRICIAN | DET` (all 5 roles for support staff)
    - Does NOT support: work_status, remark, out_ts (support people are non-stage-trackable)
    - Designed for multi-person support assignments per job card in Bodyshop Floor only
    - **Separation rationale:** `job_card_support_assignments` is explicitly for Floor Incharge module (comment: "floor incharge workflow"); new dedicated table isolates Bodyshop Floor concerns

- **Architecture Decision (Hybrid Model):**
  - **Primary assignments** use `bodyshop_assignments` one-row record + stage controls (select, status, remark, save)
    - One active row per job card
    - Up to one primary person per role in that row
    - All 5 roles support role-wise stage tracking and role-wise IN/OUT timestamps
  - **Support assignments** use `bodyshop_floor_support_assignments` (accepts all 5 roles) + inline `+` picker (no stage controls)
    - Multiple support people per role per job card
    - Any role can have additional support staff beyond the primary assignee
  - **Layout per role cell:** Primary person name + support pills below + inline picker when `+` clicked
  - **Data loading:** Merge both tables on load; group by jcKey, role; maintain order by assigned_at DESC
  - **Module isolation:** Dedicated table keeps Bodyshop Floor separate from Floor Incharge (`job_card_support_assignments`)

- **Implementation Scope (src/pages/BodyshopFloorPage.tsx):**
  - Add `SupportRole` type: `'DENTOR' | 'PAINTER' | 'TECHNICIAN' | 'ELECTRICIAN' | 'DET'` (all 5 roles for support)
  - Add `SupportAssignment` interface mirroring `public.bodyshop_floor_support_assignments` schema
  - Add `supportAssignments` state: `Record<string, Record<SupportRole, SupportAssignment[]>>`
  - Add `inlinePickerOpen`, `inlinePickerValue` state for role-scoped pickers
  - Add `empByRole` memo to filter employees by primary role capability (5 roles)
  - Add `empBySupportRole` memo to filter employees by support role capability (5 roles, all roles can be support)
  - Add `loadAll()` integration: fetch both `bodyshop_assignments` (primary) + `bodyshop_floor_support_assignments` (support)
  - Add `addSupportAssignment()` function: validate, insert, update local state
  - **Remove modal UI:** existing "Assign Bodyshop Team" modal no longer needed; all UI inline
  - **Table columns:** All 5 role columns with same layout: `🔨 Dentor | 🎨 Painter | 🔧 Technician | ⚡ Electrician | 🧰 DET`
  - **Inline picker pattern:** Click `+` → dropdown appears → select employee → "Add" button → pill appears, picker closes

- **Schema Modifications Applied (Final):**
  - `20260613010000_bodyshop_assignments_phase_a_additive_columns.sql`
  - `20260613020100_bodyshop_assignments_phase_b_backfill_and_canonicalize.sql`
  - `20260613020200_bodyshop_assignments_phase_c_enforce_one_active_row_per_jc.sql`
  - `20260613020300_bodyshop_support_phase_d_duplicate_guard.sql`
  - `20260613020400_bodyshop_assignments_phase_e_legacy_insert_bridge.sql`
  - `20260613020500_bodyshop_assignments_phase_f_cleanup_legacy_columns.sql`
  - `20260613020600_bodyshop_assignments_add_role_in_ts.sql`
  - Final state is now authoritative in fresh `full_database.sql` dump.

- **Status:** ✅ IMPLEMENTATION COMPLETE (schema + frontend)

---

### 2026-06-13 - Bodyshop Floor Multi-Role Schema Migrations Applied
- **Executed migrations (successful, no errors):**
  1. `20260613000000_expand_bodyshop_assignments_roles.sql` ✅ (historical step, superseded by one-row model)
  2. `20260613000001_create_bodyshop_floor_support_assignments.sql` ✅
  3. `20260613000000_verify_bodyshop_floor_multi_role_schema.sql` ✅
  4. `20260613010000_bodyshop_assignments_phase_a_additive_columns.sql` ✅
  5. `20260613020100_bodyshop_assignments_phase_b_backfill_and_canonicalize.sql` ✅
  6. `20260613020200_bodyshop_assignments_phase_c_enforce_one_active_row_per_jc.sql` ✅
  7. `20260613020300_bodyshop_support_phase_d_duplicate_guard.sql` ✅
  8. `20260613020400_bodyshop_assignments_phase_e_legacy_insert_bridge.sql` ✅
  9. `20260613020500_bodyshop_assignments_phase_f_cleanup_legacy_columns.sql` ✅
  10. `20260613020600_bodyshop_assignments_add_role_in_ts.sql` ✅

- **Schema Status:** 🟢 IMPLEMENTED AND LIVE (Post-Cutover)
  - `bodyshop_assignments`: one active row per job card, 5 role assignee slots, role-wise stage + IN/OUT timestamps
  - `bodyshop_floor_support_assignments`: 5 support roles, no stage tracking, module-isolated
  - Active uniqueness guards present on primary and support tables
  - RLS policies active; authenticated and service_role grants configured

- **Next Phase:** UAT and production hardening only (no pending schema redesign)

### 2026-06-13 - Bodyshop Floor Multi-Role Frontend Implementation Complete
- **BodyshopFloorPage.tsx Updated:**
  - ✅ Expanded BSRole type from 3 to 5 roles (added ELECTRICIAN, DET)
  - ✅ Added SupportRole type and SupportAssignment interface
  - ✅ Added supportAssignments state (grouped by jcKey + role, multiple per role)
  - ✅ Added inlinePickerOpen/inlinePickerValue state for role-scoped inline pickers
  - ✅ Updated normRole() to handle all 5 roles (no mapping of DET to PAINTER)
  - ✅ Updated ROLE_META with icons for new roles (⚡ ELECTRICIAN, 🧰 DET)
  - ✅ Updated empByRole memo to include 5 roles
  - ✅ Added empBySupportRole memo for filtering support employees
  - ✅ Updated loadAll() to fetch bodyshop_floor_support_assignments (new table)
  - ✅ Added addSupportAssignment() function for inline support assignment flow
  - ✅ Updated table headers: added ⚡ Electrician and 🧰 DET columns
  - ✅ Rewrote role column rendering to include:
    - Primary assignment select (existing)
    - Support pills + inline `+` button (new)
    - Inline picker on `+` click with employee select + Add button (new)
    - Status/remark/save controls (only when primary assigned, existing)
  - ✅ Updated carMap initialization to include all 5 roles
  - ✅ Removed modal usage from inline workflow (modal still available if needed later)

- **Features Implemented:**
  - **5-role UI:** All roles visible in table header and columns
  - **Primary assignment:** Select dropdown per role (with stage tracking: status, remark, out_ts)
  - **Support assignment:** Inline `+` button → picker → select employee → "Add" button (no stage tracking)
  - **Multi-person support:** Any role can have multiple support people (pills display + add button)
  - **Module isolation:** Uses dedicated `bodyshop_floor_support_assignments` table (separate from Floor Incharge)
  - **Duplicate prevention:** Checks if employee already assigned before adding

- **Build Status:** ✅ TypeScript compiled, no errors, production build successful

- **Testing Checklist (Ready for UAT):**
  - [ ] Primary role assignment works for all 5 roles
  - [ ] Primary roles with stage controls show correctly (status, remark, out_ts)
  - [ ] Support assignment inline picker appears on `+` click
  - [ ] Support pills display existing support people per role
  - [ ] Duplicate detection prevents same person being added twice
  - [ ] Inline picker closes after successful add
  - [ ] Support people list persists after page refresh
  - [ ] IN TS / OUT TS computed from primary assignments only
  - [ ] Role filter dropdown works with all 5 roles
  - [ ] No data loss on existing cars/assignments during upgrade

### 2026-06-13 - Sub Plan: Convert bodyshop_assignments to One Row Per Job Card (Current Tables Only)
- **Objective:** Keep existing table names and migrate `public.bodyshop_assignments` in-place from row-per-role to row-per-job-card, while retaining `public.bodyshop_floor_support_assignments` as multi-row support table.
- **Result:** Completed. Final schema is active and reflected in authoritative `full_database.sql`.

- **Target Architecture (Locked):**
  - `public.bodyshop_assignments`:
    - Exactly one active row per `job_card_number`
    - Primary assignee columns for all 5 roles in the same row:
      - `dentor_employee_code`, `dentor_employee_name`
      - `painter_employee_code`, `painter_employee_name`
      - `technician_employee_code`, `technician_employee_name`
      - `electrician_employee_code`, `electrician_employee_name`
      - `det_employee_code`, `det_employee_name`
  - Optional role-wise stage columns (if stage remains role-level in one row):
    - `<role>_work_status`, `<role>_remark`, `<role>_out_ts` for each of 5 roles
  - `public.bodyshop_floor_support_assignments`:
    - Continues as multi-row table for additional staff
    - Support can exist for any of 5 roles

- **Important Clarification:**
  - `unique(job_card_number, role)` is **not** sufficient for this requirement.
  - It still allows multiple rows per job card (one row per role).
  - Required enforcement for primary table is one-row-per-job-card, i.e. `unique(job_card_number)` (or partial unique on active rows).

- **Exact Migration Sequence (Safe In-Place Conversion):**

1. **Phase A - Additive schema (no behavior break)**
   - Add new role-specific primary columns to `public.bodyshop_assignments` (nullable initially).
   - Add role-wise stage columns (nullable initially) only if role-level status is required in one row.
   - Do **not** drop legacy row-per-role columns yet (`role`, `employee_code`, `employee_name`, `work_status`, `remark`, `out_ts`).

2. **Phase B - Backfill canonical one-row records**
   - For each `job_card_number`, choose one canonical row (latest `updated_at`/`assigned_at` active row).
   - For each role in legacy rows, write latest active assignee into matching new role-specific columns on canonical row.
   - If stage columns are added, backfill per-role status/remark/out_ts similarly from latest role row.
   - Mark non-canonical duplicate rows for same `job_card_number` as inactive (`is_active=false`) instead of deleting.

3. **Phase C - Enforce uniqueness for primary table**
   - Add one-row-per-job-card guard:
     - Preferred: partial unique index on `job_card_number` where `is_active = true`
     - Alternative: unique constraint on `job_card_number` if inactive history rows are not needed.
   - Validate no active duplicates remain before creating unique index/constraint.

4. **Phase D - Support table duplicate protection**
   - Keep support table multi-row by design.
   - Add active duplicate guard on support table:
     - Unique active tuple on (`job_card_number`, `support_role`, `employee_code`) where `is_active = true`
   - This allows multiple support rows per role but blocks same person repeated in same role for same job card.

5. **Phase E - App switch and compatibility window**
   - Update app writes to new one-row primary columns only.
   - Keep read fallback to legacy columns for a short compatibility window.
   - After validation period, stop writing legacy columns.

6. **Phase F - Cleanup (final hardening)**
   - Remove/deprecate legacy row-per-role columns from `public.bodyshop_assignments`:
     - `role`, `employee_code`, `employee_name`, `work_status`, `remark`, `out_ts`
   - Keep migration rollback notes and verification queries in the same release pack.

- **Pre-Checks Before Running SQL (Executed):**
  - Count active duplicate rows per `job_card_number` in `public.bodyshop_assignments`.
  - Confirm no required production flow depends on multiple active primary rows per job card.
  - Confirm support table is already live for additional workforce.

- **Post-Checks After Each Phase (Completed):**
  - Phase B: each job card has one canonical active row with populated role columns.
  - Phase C: unique enforcement succeeds without violations.
  - Phase D: duplicate support insert for same person+role+job card is blocked.
  - Phase E: Bodyshop Floor page reads/writes correctly with one-row primary model.

- **Execution Status:** ✅ COMPLETED
- **Next Action:** None for schema conversion. Only UAT verification and monitoring remain.

### 2026-06-13 - Sub Plan: Stage 11 Substages in Bodyshop Repair (Interconnected with Bodyshop Floor)
- **Objective:** Implement Stage 11 (`Floor Assignment`) in `bodyshop-repair` as role-wise substages sourced from `bodyshop-floor` data for the same job card.

- **Authority Lock (Mandatory):**
  - Treat `local_folder/backups/full_database.sql` as authoritative; if access-limited, use `local_folder/backups/chunks/full_database.sql.part_*` mirror.
  - Never invent schema objects not aligned to active authoritative source.
  - If conflict appears, prefer local dump.

- **Authoritative Current Schema (Verified):**
  - `public.bodyshop_assignments` now stores one active row per job card with role-wise fields:
    - Assignee: `<role>_employee_code`, `<role>_employee_name`
    - Status: `<role>_work_status`
    - Timestamps: `<role>_in_ts`, `<role>_out_ts`
    - Note: only shared `assigned_by` exists; no role-specific `completed_by` columns in active dump.
  - `public.bodyshop_floor_support_assignments` stores additional support staff rows and remains non-stage-trackable.

- **Stage 11 Substage UI Contract (Bodyshop Repair):**
  - Show one substage card/row per role: Dentor, Painter, Technician, Electrician, DET.
  - Role state rules:
    - No primary assignee in role slot: `Not Required`
    - Primary assignee exists: role workflow active with `In Process` / `Hold` / `Completed`
  - Per-role fields to display:
    - `Assigned To` = `<role>_employee_name` (+ code optional)
    - `Status` = `<role>_work_status`
    - `IN TS` = `<role>_in_ts`
    - `OUT TS` = `<role>_out_ts`
    - `Done At` = `<role>_out_ts` when completed
    - `Done By` = role-specific completion actor (see limitation fix below)

- **Parent Stage 11 Status Derivation (from assigned roles only):**
  - If zero roles assigned: `Unassigned`
  - Else if any assigned role is `hold`: `Hold`
  - Else if all assigned roles are `completed`: `Completed`
  - Else: `In Process`

- **Known Limitation in Active Schema:**
  - There is no per-role `completed_by` in `public.bodyshop_assignments`.
  - Current `assigned_by` cannot reliably represent completion actor.

- **Required DB Change to Remove Limitation (Additive):**
  - Add role-specific completion actor columns to `public.bodyshop_assignments`:
    - `dentor_completed_by`, `painter_completed_by`, `technician_completed_by`, `electrician_completed_by`, `det_completed_by`
  - Backfill strategy:
    - For rows where `<role>_work_status = 'completed'` and `<role>_completed_by` is null, seed from `assigned_by`.
  - Migration file:
    - `supabase/migrations/20260613020700_bodyshop_assignments_add_role_completed_by.sql`

- **Frontend Implementation Patch Scope (single patch target):**
  - `src/pages/BodyshopRepairPage.tsx`
    - Add Stage 11 reader for `bodyshop_assignments` role-wise fields by job card.
    - Render role substages with `Not Required` vs active workflow states.
    - Compute and display Stage 11 parent status from role substages.
    - Show `Done By` from `<role>_completed_by` once migration is applied.
  - `src/pages/BodyshopFloorPage.tsx`
    - On stage save to `completed`, write `<role>_completed_by` with current user.
    - Keep existing `out_ts` behavior unchanged.

- **Execution Steps:**
1. Run additive migration for role `completed_by` columns.
2. Deploy frontend Stage 11 substage patch in Bodyshop Repair + completion writer in Bodyshop Floor.
3. Validate with one shared job card across both pages.

- **Validation Checklist:**
  - [ ] New role `completed_by` columns exist in DB.
  - [ ] Stage 11 in Bodyshop Repair shows 5 role substages.
  - [ ] Unassigned roles show `Not Required`.
  - [ ] Assigned roles show status lifecycle and IN/OUT timestamps.
  - [ ] `Done By` shows real completion actor per role after completion.
  - [ ] Parent Stage 11 status follows derivation rules exactly.

- **Execution Status:** ⏳ PENDING implementation patch
- **Next Action:** Apply migration `20260613020700...`, then implement Stage 11 substage UI patch.

---

## Related Documentation

- [Implementation Plans Index](../../INDEX.md)
- [Bodyshop Category Readme](../README.md)
- [Deprecated plan moved to inactive](../inactive/BODYSHOP-001_BODYSHOP_MODULE_END_TO_END.md)

---

**Last Updated:** 2026-06-13 by GitHub Copilot  
**Status:** 🟡 SCHEMA CONVERSION COMPLETED; UAT IN PROGRESS
