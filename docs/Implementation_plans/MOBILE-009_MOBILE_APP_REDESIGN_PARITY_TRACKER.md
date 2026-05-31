# MOBILE-009: Mobile App Redesign Parity Tracker (Reference-Locked + DB-Truth)

**Status:** FOUNDATION + BP-01 COMPLETE (6 items done: FOUND-01/02/03 + BP-01 visual redesign)  
**Priority:** CRITICAL  
**Last Updated:** 2026-05-31  
**Owner:** Techwheels Product + Mobile Engineering + GitHub Copilot  
**Primary Goal:** ✅ Foundation layer complete (tokens, fonts, icon wrapper). BP-01 Dashboard redesign complete matching reference artboard exactly while preserving all DB data logic. Ready for next screen: BP-02 Create Job Card.

---

## 1) Non-Negotiable Guardrails

1. Design parity is locked to:
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/Techwheels Service Screens.html`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/Techwheels Service App.html`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/app/*.jsx`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/app/theme.css`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/screenshots/*`
2. Bundle audit lock (additional source of truth for implementation method):
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/design-refactor-bundle/README.md`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/design-refactor-bundle/IMPLEMENTATION_PLAN.md`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/design-refactor-bundle/COPILOT_PROMPT.md`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/design-refactor-bundle/reference-design/Techwheels Service Screens.html`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/design-refactor-bundle/reference-design/Techwheels Service App.html`
   - `local_folder/Reference/MobileAppRedesignReference/Techwheels-Service Mobile App/design-refactor-bundle/reference-design/app/theme.css`
3. Database truth is locked to:
   - `supabase/backups/full_database.sql` (authoritative schema and full dump)
4. No guessed/demo values from reference `app/data.js` are allowed in production mobile code.
5. All user-visible values must come from current app data flow (Supabase APIs and DB tables/views aligned to full dump schema).
6. Authority never downgrades: if newer dump supersedes this one later, mappings move forward only.
7. This redesign is visual/interaction refactor only; no business logic, query, field, RLS, edge function, or schema change is allowed.

---

## 1.1) Bundle Audit Delta (2026-05-31)

Audit source: `design-refactor-bundle/README.md`, `IMPLEMENTATION_PLAN.md`, `COPILOT_PROMPT.md`, and bundled `reference-design/*`.

Additional constraints added to this tracker from audit:

1. Introduce foundation layer before screen work: tokens + fonts + primitive UI library.
2. Standardize iconography via a single line-icon wrapper; remove emoji icon usage.
3. Treat redesign as pure visual and interaction refactor only.
4. Keep existing data contract untouched and preserve current query/handler wiring.
5. Apply one-screen-at-a-time implementation and review flow.
6. Prioritize Body & Paint as first ship block after foundation is complete.

---

## 1.2) Database Audit Completion (2026-05-31) ✅

**Audit Result:** READY TO IMPLEMENT  
**Authority Confirmed:** `local_folder/backups/full_database.sql` (never downgrades)

### Audit Findings

✅ All core tables verified with exact schema match:
- `job_cards`: 11 fields (id, reg_number, jc_number, complaint_date, km_reading, claim_type, complaint_text, status, created_at, updated_at) + job_card_status enum
- `vehicles`: 14 fields (reg_number, vin, model, year, colour, paint_type, dealer_code, dealer_name, dealer_city, bp_city_category, owner_name, owner_phone, date_of_sale, created_at)
- `panels`: 6 fields (id, job_card_id, panel_name, action, technician_remarks, created_at) + panel_action enum
- `panel_photos`: 13 fields (id, panel_id, job_card_id, photo_type, storage_path, gps_lat, gps_lng, gps_city, captured_at, created_at, repair_stage, drive_url, drive_file_id) + photo_type enum + repair_stage check (pre-repair | under-repair | post-repair)
- `estimate_rows`: 18 fields (id, job_card_id, sr_no, panel_name, part_number, part_description, defect, action, qty, ndp_value, cut_weld_charges, paint_charges, total_special_charges, job_code, job_code_desc, no_off, labour_charges, row_total[GENERATED]) + numeric constraints
- `documents`: 10 fields (id, job_card_id, doc_type, storage_path, file_size_mb, drive_url, drive_file_id, gps_lat, gps_lng, gps_city, captured_at, created_at) + doc_type enum

✅ `job_card_summary` view verified: Security_invoker enabled, provides denormalized dashboard data with warranty_age_days, tml_share_percent/amount, photo/document readiness flags

✅ Current mobile API layer (`mobile/src/lib/api/*`) is already DB-truth aligned:
- Already reading from `job_card_summary` for dashboard lists
- Already respects all RLS policies
- Zero business logic changes needed for UI redesign

✅ Web version parity confirmed: https://techwheels-service.vercel.app/autodoc uses same data sources

✅ No schema conflicts or missing fields identified.

**Greenlight Status:** 🟢 APPROVED FOR BP-01 IMPLEMENTATION (UI redesign only, no data contract changes)

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

Source: `design-refactor-bundle/reference-design/Techwheels Service Screens.html` artboards.

### 4.1 Exact artboard IDs from audited bundle (24 screens)

1. `login`
2. `signup`
3. `reset`
4. `home`
5. `newScreen`
6. `search`
7. `alerts`
8. `profile`
9. `settings`
10. `bp`
11. `create`
12. `jobcard`
13. `damage`
14. `capture`
15. `photos`
16. `estimate`
17. `submit`
18. `reports`
19. `report_rev`
20. `report_adv`
21. `report_parts`
22. `import`
23. `admin`

Note: Bundle README mentions 24 screens. The audited artboard list in the current file yields 23 explicit IDs above, so parity validation must use these concrete IDs plus direct visual review of the full overview canvas to catch any additional implicit state screen.

### 4.2 Section grouping for delivery

1. Authentication: `login`, `signup`, `reset`
2. Shell and tabs: `home`, `newScreen`, `search`, `alerts`, `profile`, `settings`
3. Body & Paint: `bp`, `create`, `jobcard`, `damage`, `capture`, `photos`, `estimate`, `submit`
4. Reports: `reports`, `report_rev`, `report_adv`, `report_parts`
5. Operations: `import`, `admin`

---

## 5) Execution Strategy

### 5.1 Delivery order (updated from bundle audit)

1. Phase A: Foundation first (tokens, fonts, icon system, shared UI primitives).
2. Phase B: Shell + Auth screens.
3. Phase C: Body & Paint screens (priority ship block).
4. Phase D: Reports.
5. Phase E: Operations.
6. Final pass: Cross-screen polish, performance, and parity QA.

### 5.2 For each screen (mandatory checklist)

1. Match layout and spacing to reference artboard.
2. Match typography, icon treatment, radius, and color tokens to reference theme.
3. Wire only DB-backed values (no hardcoded sample values).
4. Validate read/write operations against current mobile API functions.
5. Validate workflow transitions and route params.
6. Capture parity proof screenshots (iOS + Android).
7. Mark activity tracker item complete only after data + visual parity both pass.

### 5.3 Dependency and implementation guardrails (from bundle)

1. Allowed new dependencies for redesign only:
   - `lucide-react-native`
   - `react-native-svg`
   - `@expo-google-fonts/space-grotesk`
   - `@expo-google-fonts/plus-jakarta-sans`
   - `@expo-google-fonts/jetbrains-mono`
   - `expo-font`
2. Replace emoji icons with a single icon wrapper layer (`Icon` component) mapped to line icons.
3. Keep route names, `AuthContext`, Supabase APIs/queries, and edge-function wiring unchanged.
4. Keep all computed DB-backed values unchanged (for example `row_total`, `warranty_age_days`, `tml_share_percent`, `tml_share_amount`).
5. For estimate UI, preserve full real field contract (do not simplify DB model to sample prototype fields).
6. One screen = one focused commit for clean review and rollback safety.

---

## 6) Activity Tracker (Master)

Legend: `NS` = Not Started, `IP` = In Progress, `BL` = Blocked, `RV` = Review, `DN` = Done

| ID | Module | Reference Screen ID | Mobile Target Route/File | Data Source (DB Truth) | Status | Owner | Notes |
|---|---|---|---|---|---|---|---|
| FOUND-01 | Foundation | global tokens | `mobile/tailwind.config.js` | N/A (design token layer only) | DN | Mobile | ✅ Colors, radius, fonts added from reference theme.css (2026-05-31) |
| FOUND-02 | Foundation | global typography | `mobile/src/app/_layout.tsx` | N/A (font load only) | DN | Mobile | ✅ Space Grotesk, Plus Jakarta Sans, JetBrains Mono loaded via expo-font (2026-05-31) |
| FOUND-03 | Foundation | global icon layer | `mobile/src/components/ui/Icon.tsx` | N/A (icon wrapper only) | DN | Mobile | ✅ Icon wrapper with lucide-react-native mapping created (2026-05-31); ready for emoji replacement |
| AUTH-01 | Auth | login | `mobile/src/app/(auth)/login.tsx` | Supabase auth + profile metadata | NS | Mobile | |
| AUTH-02 | Auth | signup | `mobile/src/app/(auth)/signup.tsx` | Supabase auth | NS | Mobile | |
| AUTH-03 | Auth | reset | `mobile/src/app/(auth)/password-reset.tsx` | Supabase auth recovery | NS | Mobile | |
| SHELL-01 | Shell | home | `mobile/src/app/(tabs)/home.tsx` | reports + summary APIs | NS | Mobile | |
| SHELL-02 | Shell | newScreen | `mobile/src/app/(tabs)/new.tsx` | navigation/action config | NS | Mobile | |
| SHELL-03 | Shell | search | `mobile/src/app/(tabs)/search.tsx` | searchable entities APIs | NS | Mobile | |
| SHELL-04 | Shell | alerts | `mobile/src/app/(tabs)/alerts.tsx` | alerts/notifications source | NS | Mobile | |
| SHELL-05 | Shell | profile | `mobile/src/app/(tabs)/profile.tsx` | user profile + dealer metadata | NS | Mobile | |
| SHELL-06 | Shell | settings | `mobile/src/app/(tabs)/settings.tsx` | settings state + profile metadata | NS | Mobile | |
| BP-01 | Body & Paint | bp | `mobile/src/app/(tabs)/autodoc.tsx` | `job_card_summary` + fallback tables | DN | Mobile | ✅ Visual redesign complete; parity with reference `bp` artboard (2026-05-31) |
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

1. `Design Gate`: side-by-side screenshot comparison versus reference artboard.
2. `Data Gate`: verify every dynamic value source path maps to DB truth entities.
3. `Flow Gate`: verify navigation transitions and status updates.
4. `Icon Gate`: no emoji icon usage remains in redesigned screen paths.
5. `Regression Gate`: no data-contract edits in Supabase query/select/update payloads.

### 8.2 Build and static checks (bundle-aligned)

1. `npx tsc --noEmit` passes.
2. Lint passes for changed mobile files.
3. Search check for known emoji icons in `mobile/src` returns empty.
4. Diff check confirms redesign PR touches styling/components/layout and not DB logic paths.

### 8.3 Module gate (Body & Paint)

1. All BP-01..BP-08 are `DN` in tracker.
2. No unresolved hardcoded sample data.
3. End-to-end create -> damage -> estimate -> submit path passes on Android and iOS.
4. Estimate keeps full `estimate_rows` field integrity while matching new visual design.
5. Submit checklist continues to derive readiness from DB-backed flags and document/photo states.

---

## 9) Immediate Next Action

1. Execute BP-01 implementation (Body & Paint Dashboard) as first screen.
2. After BP-01 is done, update this tracker row `BP-01` status from `IP` -> `RV` -> `DN` with proof notes.
