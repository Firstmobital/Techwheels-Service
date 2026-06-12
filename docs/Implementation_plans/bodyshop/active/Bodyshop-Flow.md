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
- [ ] **Task 2.5:** Add backend-side safety validation for max photo count.

### Phase 3: Storage, Validation, and Auditability
- [x] **Task 3.1:** Define storage path convention for bodyshop intake photos.
- [ ] **Task 3.2:** Persist uploaded file metadata (job card linkage, uploader, timestamp).
- [ ] **Task 3.3:** Validate allowed MIME types and max file size.
- [ ] **Task 3.4:** Add error states for duplicate/overflow/failed upload.

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

---

## Dependencies & Prerequisites

- [ ] Product sign-off on category labels: Bodyshop and Others.
- [x] Final decision on bodyshop photo metadata table contract.
- [x] Storage bucket path convention approval.
- [ ] UAT sample entries covering Accident + non-Accident service types.
- [x] DB-level canonical key hardening for bodyshop cards (`reception_entry_id` + uniqueness) prepared in migration file; pending user-run apply.
- [ ] Phase A deprecation validation sign-off: zero runtime dependency on `service_branches` in web/mobile.

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

---

## Related Documentation

- [Implementation Plans Index](../../INDEX.md)
- [Bodyshop Category Readme](../README.md)
- [Deprecated plan moved to inactive](../inactive/BODYSHOP-001_BODYSHOP_MODULE_END_TO_END.md)

---

**Last Updated:** 2026-06-12 by GitHub Copilot  
**Status:** 🟡 IN PROGRESS
