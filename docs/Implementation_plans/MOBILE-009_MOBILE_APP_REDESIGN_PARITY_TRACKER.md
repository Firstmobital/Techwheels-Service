# MOBILE-009: Mobile App Redesign Parity Tracker (Reference-Locked + DB-Truth)

**Status:** IN PROGRESS (planning complete, implementation pending)  
**Priority:** CRITICAL  
**Start Date:** 2026-05-31  
**Owner:** Techwheels Product + Mobile Engineering + GitHub Copilot  
**Primary Goal:** Rebuild mobile UI to match the provided redesign reference exactly, while replacing all sample/guessed values with live values from the authoritative database contract.

---

## 1) Non-Negotiable Guardrails

1. Design parity is locked to:
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/Techwheels Service Screens.html`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/Techwheels Service App.html`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/app/*.jsx`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/app/theme.css`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/screenshots/*`
2. Database truth is locked to:
   - `supabase/backups/full_database.sql` (authoritative schema and full dump)
3. No guessed/demo values from reference `app/data.js` are allowed in production mobile code.
4. All user-visible values must come from current app data flow (Supabase APIs and DB tables/views aligned to full dump schema).
5. Authority never downgrades: if newer dump supersedes this one later, mappings move forward only.

---

## 2) Authoritative Data Contract (from full_database.sql)

### 2.1 Core entities for Body & Paint

1. `public.job_cards`
   - Keys/fields used in UI: `id`, `reg_number`, `jc_number`, `complaint_date`, `km_reading`, `claim_type`, `complaint_text`, `status`, `created_at`, `updated_at`
   - `status` enum: `draft`, `submitted`, `approved`, `in_work`, `completed`
2. `public.vehicles`
   - Keys/fields used in UI: `reg_number`, `vin`, `model`, `year`, `colour`, `paint_type`, `dealer_code`, `dealer_name`, `dealer_city`, `bp_city_category`, `owner_name`, `owner_phone`, `date_of_sale`
3. `public.panels`
   - Keys/fields: `id`, `job_card_id`, `panel_name`, `action`, `technician_remarks`, `created_at`
   - `action` enum: `repaint`, `replace`
4. `public.panel_photos`
   - Keys/fields: `id`, `panel_id`, `job_card_id`, `photo_type`, `storage_path`, `gps_lat`, `gps_lng`, `gps_city`, `captured_at`, `repair_stage`, `drive_url`, `drive_file_id`
   - `photo_type` enum: `defect`, `primer`, `paint`
   - `repair_stage` check: `pre-repair`, `under-repair`, `post-repair`
5. `public.estimate_rows`
   - Keys/fields: `id`, `job_card_id`, `sr_no`, `panel_name`, `part_number`, `part_description`, `defect`, `action`, `qty`, `ndp_value`, `cut_weld_charges`, `paint_charges`, `total_special_charges`, `job_code`, `job_code_desc`, `no_off`, `labour_charges`, `row_total`
6. `public.documents`
   - Keys/fields: `id`, `job_card_id`, `doc_type`, `storage_path`, `file_size_mb`, `drive_url`, `drive_file_id`, `gps_lat`, `gps_lng`, `gps_city`, `captured_at`
   - `doc_type` enum: `service_history`, `video_job_card`, `video_delivery`, `ppt_pre`, `ppt_post`, `excel_estimate`, `car_image`
7. `public.job_card_summary` (security_invoker view)
   - Dashboard-ready denormalized fields already used by mobile list screens.

### 2.2 Rate/lookup entities used by estimate and selectors

1. `public.autodoc_panel_master`
2. `public.autodoc_rate_cards`
3. `public.autodoc_rate_rows`

---

## 3) Existing Mobile Code Baseline (current implementation)

### 3.1 Existing routes

- Auth routes: `mobile/src/app/(auth)/*`
- Tab shell routes: `mobile/src/app/(tabs)/*`
- Body & Paint flow routes:
  - `mobile/src/app/(tabs)/autodoc.tsx` (Dashboard)
  - `mobile/src/app/job-cards/create.tsx` (Create)
  - `mobile/src/app/job-cards/[id]/jobcard.tsx` (Job Card)
  - `mobile/src/app/job-cards/[id]/damage.tsx` (Damage)
  - `mobile/src/app/job-cards/[id]/capture-photo.tsx` (Capture)
  - `mobile/src/app/job-cards/[id]/panel-photos.tsx` (Panel Photos)
  - `mobile/src/app/job-cards/[id]/estimate.tsx` (Estimate)
  - `mobile/src/app/job-cards/[id]/submit.tsx` (Submit)

### 3.2 Current data API layer already aligned to DB entities

- `mobile/src/lib/api/jobCards.ts`
- `mobile/src/lib/api/vehicles.ts`
- `mobile/src/lib/api/panels.ts`
- `mobile/src/lib/api/photos.ts`
- `mobile/src/lib/api/estimate.ts`
- `mobile/src/lib/api/documents.ts`
- `mobile/src/lib/api/autodocRates.ts`

---

## 4) Reference Screen Inventory (Do Not Drift)

Source: `Techwheels Service Screens.html` sections and artboards.

### 4.1 Section 0 - Authentication

1. Login (`login`)
2. Sign up (`signup`)
3. Password reset (`reset`)

### 4.2 Section 1 - App Shell & Home

1. Home dashboard (`home`)
2. New quick actions (`newScreen`)
3. Search (`search`)
4. Alerts (`alerts`)
5. Profile (`profile`)
6. Settings (`settings`)

### 4.3 Section 2 - Body & Paint (priority)

1. B&P Dashboard (`bp`)
2. Create Job Card (`create`)
3. Job Card Details (`jobcard`)
4. Damage Stage (`damage`)
5. Capture Photo + GPS (`capture`)
6. Panel Photo Gallery (`photos`)
7. Estimate Editor (`estimate`)
8. Submit Claim (`submit`)

### 4.4 Section 3 - Reports

1. Reports Hub (`reports`)
2. Report template variants (`report_rev`, `report_adv`, `report_parts`)

### 4.5 Section 4 - Operations

1. Import (`import`)
2. Admin (`admin`)

---

## 5) Execution Strategy

### 5.1 Delivery order

1. Phase A: Body & Paint screens only (8 screens, exact parity)
2. Phase B: Auth + Shell screens
3. Phase C: Reports + Operations screens
4. Phase D: Cross-screen polish, performance, and final parity QA

### 5.2 For each screen (mandatory checklist)

1. Match layout and spacing to reference artboard.
2. Match typography, icon treatment, radius, and color tokens to reference theme.
3. Wire only DB-backed values (no hardcoded sample values).
4. Validate read/write operations against current mobile API functions.
5. Validate workflow transitions and route params.
6. Capture parity proof screenshots (iOS + Android).
7. Mark activity tracker item complete only after data + visual parity both pass.

---

## 6) Activity Tracker (Master)

Legend: `NS` = Not Started, `IP` = In Progress, `BL` = Blocked, `RV` = Review, `DN` = Done

| ID | Module | Reference Screen ID | Mobile Target Route/File | Data Source (DB Truth) | Status | Owner | Notes |
|---|---|---|---|---|---|---|---|
| AUTH-01 | Auth | login | `mobile/src/app/(auth)/login.tsx` | Supabase auth + profile metadata | NS | Mobile | |
| AUTH-02 | Auth | signup | `mobile/src/app/(auth)/signup.tsx` | Supabase auth | NS | Mobile | |
| AUTH-03 | Auth | reset | `mobile/src/app/(auth)/password-reset.tsx` | Supabase auth recovery | NS | Mobile | |
| SHELL-01 | Shell | home | `mobile/src/app/(tabs)/home.tsx` | reports + summary APIs | NS | Mobile | |
| SHELL-02 | Shell | newScreen | `mobile/src/app/(tabs)/new.tsx` | navigation/action config | NS | Mobile | |
| SHELL-03 | Shell | search | `mobile/src/app/(tabs)/search.tsx` | searchable entities APIs | NS | Mobile | |
| SHELL-04 | Shell | alerts | `mobile/src/app/(tabs)/alerts.tsx` | alerts/notifications source | NS | Mobile | |
| SHELL-05 | Shell | profile | `mobile/src/app/(tabs)/profile.tsx` | user profile + dealer metadata | NS | Mobile | |
| SHELL-06 | Shell | settings | `mobile/src/app/(tabs)/settings.tsx` | settings state + profile metadata | NS | Mobile | |
| BP-01 | Body & Paint | bp | `mobile/src/app/(tabs)/autodoc.tsx` | `job_card_summary` + fallback tables | IP | Mobile | First implementation screen |
| BP-02 | Body & Paint | create | `mobile/src/app/job-cards/create.tsx` | `job_cards`, `vehicles`, `documents`, lookup tables | NS | Mobile | |
| BP-03 | Body & Paint | jobcard | `mobile/src/app/job-cards/[id]/jobcard.tsx` | `job_cards`, `vehicles` | NS | Mobile | |
| BP-04 | Body & Paint | damage | `mobile/src/app/job-cards/[id]/damage.tsx` | `panels`, `panel_photos` | NS | Mobile | |
| BP-05 | Body & Paint | capture | `mobile/src/app/job-cards/[id]/capture-photo.tsx` | `panel_photos` GPS metadata | NS | Mobile | |
| BP-06 | Body & Paint | photos | `mobile/src/app/job-cards/[id]/panel-photos.tsx` | `panel_photos`, `panels` | NS | Mobile | |
| BP-07 | Body & Paint | estimate | `mobile/src/app/job-cards/[id]/estimate.tsx` | `estimate_rows`, `autodoc_rate_*` | NS | Mobile | |
| BP-08 | Body & Paint | submit | `mobile/src/app/job-cards/[id]/submit.tsx` | `documents`, `panel_photos`, `estimate_rows`, `job_cards` | NS | Mobile | |
| REP-01 | Reports | reports | `mobile/src/app/(tabs)/reports.tsx` | report query layer | NS | Mobile | |
| REP-02 | Reports | report_* | `mobile/src/app/reports/[id].tsx` (or existing report route mapping) | report query layer | NS | Mobile | Route parity validation needed |
| OPS-01 | Operations | import | `mobile/src/app/(tabs)/import.tsx` | import pipeline tables/APIs | NS | Mobile | |
| OPS-02 | Operations | admin | `mobile/src/app/(tabs)/admin.tsx` | RBAC + admin APIs | NS | Mobile | |

---

## 7) Body & Paint First-Screen Start Plan (BP-01 Dashboard)

### 7.1 Scope for first delivery

1. Redesign only `BP-01` (`mobile/src/app/(tabs)/autodoc.tsx`) to exact reference layout and visual hierarchy.
2. Preserve current DB-backed data fetch from `listJobCardSummaries()` and existing fallback behavior.
3. Ensure stage counters, chips, search filtering, and card metrics remain source-of-truth from DB data (not local mocks).

### 7.2 BP-01 field-to-source map

1. Job card number: `job_card_summary.jc_number`
2. Registration: `job_card_summary.reg_number`
3. Model/year/color: `job_card_summary.model`, `vehicle_year`, `colour`
4. Status pill: `job_card_summary.status`
5. Stage derivation: computed from `status` + photo/estimate readiness checks against `panel_photos`, `estimate_rows`, and `documents`
6. Panel/photo count: aggregate from `panels`, `panel_photos`
7. Estimate total: authoritative sum from `estimate_rows.row_total`
8. Owner/KM shown when required: `owner_name`, `km_reading`

### 7.3 BP-01 acceptance criteria

1. Visual parity with reference `bp` artboard in spacing, typography, cards, filter strip, and CTA placement.
2. No hardcoded demo values present in rendered output path.
3. All displayed job metrics reconcile with live query results.
4. Route transitions from dashboard cards match current workflow destinations.

---

## 8) QA and Sign-Off Gates

### 8.1 Per-screen gates

1. `Design Gate`: side-by-side screenshot comparison versus reference.
2. `Data Gate`: verify every dynamic value source path maps to DB truth entities.
3. `Flow Gate`: verify navigation transitions and status updates.

### 8.2 Module gate (Body & Paint)

1. All BP-01..BP-08 are `DN` in tracker.
2. No unresolved hardcoded sample data.
3. End-to-end create -> damage -> estimate -> submit path passes on Android and iOS.

---

## 9) Immediate Next Action

1. Execute BP-01 implementation (Body & Paint Dashboard) as first screen.
2. After BP-01 is done, update this tracker row `BP-01` status from `IP` -> `RV` -> `DN` with proof notes.
