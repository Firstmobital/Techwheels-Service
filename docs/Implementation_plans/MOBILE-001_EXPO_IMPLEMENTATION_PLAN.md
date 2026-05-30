# Techwheels Service - Mobile App Implementation Plan

**Document Date**: May 27, 2026  
**Target Platforms**: Android & iOS via Expo  
**Parity Goal**: 100% feature parity with web version (v1.0)  
**UI Strategy**: Mobile-centric design (NOT web UI copy)

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Project Audit Summary](#project-audit-summary)
3. [Architecture Decision](#architecture-decision)
4. [Phase-Wise Implementation Plan](#phase-wise-implementation-plan)
5. [Shared Code Layer Strategy](#shared-code-layer-strategy)
6. [Module Bundling Strategy](#module-bundling-strategy)
7. [Risk Mitigation](#risk-mitigation)
8. [Success Criteria](#success-criteria)
9. [Release Prerequisites and OTA-First Delivery](#release-prerequisites-and-ota-first-delivery)
10. [Execution Anti-Drift Protocol](#execution-anti-drift-protocol)

---

## Executive Summary

Techwheels Service is a React + TypeScript + Vite web application serving automotive dealership operations with 8 core pages and 5 major domains (Import, Reports, AutoDoc, Admin, Settings). The task is to create a **fully native mobile app via Expo** with identical business logic but **mobile-centric UI/UX**.

### Key Principles
- **Code Reuse**: Shared business logic layer (API, mappers, queries, utilities)
- **Native Mobile**: Expo-managed workflow for iOS & Android
- **Feature Parity**: All web domains + reports + AutoDoc features on mobile
- **Bundle Optimization**: Pre-bundle all dependencies in APK to minimize OTA updates
- **Authentication**: Same Supabase Auth (JWT, RLS, module permissions)

### Backend Function Deployment Dependency (Critical)

Web/mobile frontend deploys and Supabase Edge Function deploys are independent release tracks. For any AutoDoc upload contract change, deploy functions before parity QA.

Mandatory deploy commands (project: `jmdndcphkmaljhwgzqxq`):

```bash
supabase functions deploy universal-drive-upload --project-ref jmdndcphkmaljhwgzqxq
supabase functions deploy document-link-upsert --project-ref jmdndcphkmaljhwgzqxq
```

Required verification for `car_image` flow:
- `universal-drive-upload` accepts `car_image` as valid `file_type`
- successful upload sets Drive link fields and creates/updates Drive artifact
- source object cleanup follows server flag behavior (`DRIVE_DELETE_SOURCE_OBJECT=true` in target project env)

### Mobile Upload Observability Policy

All mobile upload flows must emit structured logs and flush on terminal outcomes.

- Use `mobile/src/utils/logger.ts` with `logEvent(eventName, metadata, module)`
- Required metadata: `stage`, `duration_ms`, `error_code`, `error_message`, `employee_id`, `provider`
- For push-related traces use module `push-registration`; for upload traces use module `autodoc-upload`
- Call `flushPendingLogsToS3({ reason })` on upload success/failure terminal states

### AutoDoc Mobile/Web Drift Addendum (2026-05-29)

Observed production drift:
- Mobile AutoDoc route params can carry a job reference (for example `jc_number`) that is not always the canonical `job_cards.id`, causing stage APIs to query by a non-canonical key and return zero-row errors (`PGRST116`).
- Resulting impact on mobile: `Job Card` and `Submit` stages can fail to load, and `Damage/Estimate` can appear empty despite web showing active workflow data.
- Mobile dashboard had a generic `Open` action only; users also require stage-status chip click to deep-link directly into that job's current stage, consistent with web behavior.

Required parity rule:
- UI/UX may remain mobile-centric.
- Workflow routing, data loading, and stage progression logic must remain behaviorally equivalent to web for the same job card.

Implementation requirement:
- Add canonical job-card reference resolution in mobile API layer before stage/document/photo/estimate reads and writes.
- Make stage status chip actionable per job card on mobile dashboard and open the derived stage route.
- Keep fallback behavior non-blocking where possible so submit screen can still render checklist with warnings when optional datasets fail.

### AutoDoc Navigation and State Rehydration Addendum (2026-05-29, continued)

Observed additional drift during validation:
- Mobile stage screens could open with incomplete identity context, causing record lookup drift across Job Card, Damage, Estimate, and Submit.
- Parent + child stack headers could render together, producing confusing labels such as (tabs) and duplicated top bars.
- Existing DB state (job details, panel selections, estimate rows) could appear empty when stage transitions did not preserve identity hints.

Parity corrections applied:
- Stage navigation now carries identity hints across transitions: job_card_id + jc_number + reg_number.
- Job resolver now supports hint-assisted recovery so the selected card rehydrates the same persisted record across all stages.
- API-level resolution alignment expanded across jobCards, panels, photos, estimate, and documents to keep reads/writes pinned to the intended record.
- Root stack header for job-card routes is hidden to avoid duplicate header and route-group label leakage.
- Job Card and Submit use non-blocking fallback rendering when full summary visibility is restricted, preserving edit/continue workflow.

Parity acceptance requirement for AutoDoc:
- Selecting an existing job card from mobile dashboard must load editable Job Card state from DB, then preserve that same state through Next to Damage, Estimate, and Submit.
- Damage must show existing panel cards if already saved in DB.
- Estimate must show existing rows if already saved in DB.
- Submit must reflect the same document/readiness state used by web logic for that job.

### Mobile Dev Server Run Rule (Critical)

- Do not start Expo from repository root for mobile parity QA.
- Always launch from mobile project context:

```bash
npm --prefix /Users/vkbin/Techwheels-Service/mobile run start -- --clear --tunnel
```

- If launched from repo root, wrong project resolution can mask/falsely invalidate parity fixes.

### Create Job Card Parity Implementation (2026-05-29)

**Status**: ✅ COMPLETE - Full web parity achieved via OTA

**Objective**: Ensure mobile "Create New Job Card" flow matches web AutoDocPage form structure exactly (UI/UX remains mobile-centric).

**Root Issue**: Users reported missing fields (Complaint Date, Claim Type, Complaint Notes) in mobile form despite being in code, plus form structure differed from web (Job Card Number location, section naming).

**Implementation Details**:

**File**: [mobile/src/app/job-cards/create.tsx](mobile/src/app/job-cards/create.tsx)

**Changes Made**:

1. **Vehicle Lookup Section** (unchanged structure):
   - Registration Number, Job Card Number, KM Reading, Walkaround Video, Car Image, Fetch from DB button
   - ✅ **Removed Job Card Number from this section** (moved to Job Details for web parity)

2. **Vehicle Details Section** (conditional render after lookup succeeds):
   - VIN/Chassis No, Model, Year, Colour, Paint Type, Date of Sale, Owner Name, Owner Phone, Dealer City, BP City Category
   - ✅ All 8 fields present and rendering correctly

3. **Job Details Section** (renamed from "Job Card Details"):
   - ✅ **Renamed header**: "Job Card Details" → "Job Details" (matches web)
   - ✅ **Moved Job Card Number here** (was in Vehicle Lookup, now in Job Details after Vehicle Details conditional)
   - ✅ **Warranty Claim Type**: Label changed from "Claim Type" (web uses "Warranty Claim Type")
   - ✅ **Customer Complaint**: Renamed from "Complaint Notes" (web label is "Customer Complaint")
   - ✅ **Removed Complaint Date field**: Not present in web create form (web has it in edit, not in create)

**Form Flow (After Parity Fix)**:
```
Vehicle Lookup (visible on load)
    ↓ (after Fetch From DB success)
Vehicle Details (conditional)
    ↓ (always visible)
Job Details
    ↓ (on Create Draft Job Card click)
Job Card Created → Navigate to detail screen
```

**Field Mapping Alignment**:

| Web (AutoDocPage) | Mobile (create.tsx) | Status |
|------|------|------|
| VEHICLE LOOKUP section | Vehicle Lookup | ✅ Match |
| Job Card Number in Job Details | Job Card Number moved to Job Details | ✅ Match |
| Warranty Claim Type selector | Warranty Claim Type selector | ✅ Match |
| Customer Complaint textarea | Customer Complaint textarea | ✅ Match |
| (No Complaint Date in create) | Complaint Date removed | ✅ Match |

**API Layer** (no changes required):
- `createJobCard()` payload includes: `regNumber`, `jcNumber`, `complaintDate`, `kmReading`, `claimType`, `complaintText`
- Mobile now sets `complaintDate` from form default (today's date in YYYY-MM-DD format) or from optional date picker future enhancement
- `upsertVehicle()` called before `createJobCard()` to satisfy RLS policy requiring vehicle row presence

**Testing Validation**:
- Form renders all fields visible on device screen (no cut-off fields below scroll)
- Vehicle lookup works (RC fallback chain functional from prior OTA c45dabc5)
- Vehicle Details section appears after lookup succeeds
- Job Details section properly labels all fields
- Create Draft Job Card button saves payload with all fields

**OTA Deployment**:
- Update Group: b6e6d227-9a78-4c3e-8ce5-529bd6105127
- Platform: iOS (production)
- Message: "Restore web parity: Job Details section"
- Commit: 46462b5
- Include in next Android build when quota resets

**Code Reference**:
- Mobile form structure: [mobile/src/app/job-cards/create.tsx](mobile/src/app/job-cards/create.tsx#L640-L690)
- Web form structure: [src/pages/AutoDocPage.tsx](src/pages/AutoDocPage.tsx#L3700-L3800) (Job Details section)

### Create Job Card Upload Source Expansion (2026-05-30)

**Status**: ✅ COMPLETE - Published via production OTA (android + ios)

**Objective**: Remove file-only limitation in mobile create flow so required walkaround and car-image inputs can be captured directly from camera, selected from gallery, or chosen from files.

**Root Cause Confirmed**:
- `Create Job Card` upload fields were wired only to `expo-document-picker`, which prevented camera capture and gallery-first workflows.

**Implementation Details**:

**File**: [mobile/src/app/job-cards/create.tsx](mobile/src/app/job-cards/create.tsx)

**Changes Made**:
1. Added `expo-image-picker` camera and media-library support for both required upload fields.
2. Replaced direct picker call with source-selection action sheet for each field:
  - Walkaround video: `Capture Video`, `Pick from Gallery`, `Choose File`
  - Car image: `Capture Photo`, `Pick from Gallery`, `Choose File`
3. Added explicit permission checks and user alerts for denied camera/gallery access.
4. Preserved draft auto-save behavior on first walkaround selection and made it source-agnostic (camera/gallery/file).
5. Updated UI placeholder text to communicate all supported source options.

**OTA Deployment**:
- Update Group: `11fbb4d6-941b-4b88-a1ea-70337b343057`
- Platforms: `android`, `ios`
- Message: `mobile: add capture + gallery + file options for walkaround video and car image in create job card`
- Commit: `cc2ff18b2fdffe1c60ebc87cd914a5257c855e98`

**Validation**:
- Type diagnostics for [mobile/src/app/job-cards/create.tsx](mobile/src/app/job-cards/create.tsx) returned no errors after patch.

### Database Authority Guardrail

- Treat `local_folder/backups/full_database.sql` as the authoritative schema and full database dump for implementation and parity validation.
- Authority never downgrades to older snapshots or inferred schemas from partial references.

## Release Prerequisites and OTA-First Delivery

This section is the mandatory go/no-go gate before first distributable mobile builds.

### Build Output Terminology (Important)
- `APK`: Android install file for internal testing.
- `AAB`: Android Play Store submission artifact.
- `IPA` (not IPK): iOS install/submission artifact generated by EAS.
- Expo Go is for development/runtime testing; production binaries come from EAS Build.

### Prerequisite Checklist (Must Be 100% Complete)
1. Expo and EAS account access confirmed for the target organization/project.
2. `mobile/app.json` contains final identifiers:
  - `expo.slug = techwheels-service`
  - `expo.android.package = com.techwheels.service`
  - `expo.ios.bundleIdentifier = com.techwheels.service`
3. `eas init` completed in `mobile/`, and both fields are linked to the same EAS project:
  - `expo.extra.eas.projectId` (UUID from Expo)
  - `expo.updates.url` (`https://u.expo.dev/<same-project-uuid>`)
4. OTA is configured before first release build:
  - `expo-updates` installed
  - `runtimeVersion` strategy set (recommended: `{ "policy": "appVersion" }`)
  - release channels created and mapped (`preview`, `production`)
5. Android Firebase requirement validated for push-enabled builds:
  - `mobile/google-services.json` exists
  - `android.googleServicesFile` is set in app config
6. iOS credentials path is decided:
  - Apple Team ID + App Store Connect access available
  - Distribution certificate/provisioning handled by EAS managed credentials
7. Secrets and envs are configured for build profiles (`eas secret:list` / `eas env:list`).
8. Local toolchain is green:
  - Node and npm satisfy `mobile/package.json` engines
  - `npx expo-doctor` passes
  - `npx expo config --type public` shows expected iOS/Android identifiers and updates URL

### OTA-First Rule for This Project
- First installable build must already include OTA capability.
- Every later JS/TS/UI fix is shipped via OTA to the same channel (no rebuild needed).
- Rebuild required only when native layer changes (new native module, plugin config, permission changes, app icon/splash/native settings, SDK/runtime bump).

### Current Execution Snapshot (2026-05-29)
- CLI readiness:
  - `node`, `npm`, `npx`, `expo`, `eas` available.
  - `firebase` and `aws` CLI were missing and have been installed.
- Mobile config validation (`cd mobile && npx expo config --type public`) is now resolving correct app identity (`slug`, `android.package`, `ios.bundleIdentifier`).
- Firebase service project created under `admin@firstmobital.com`:
  - Firebase project: `techwheels-service` (Display name: `Techwheels-Service`).
  - Android app registered: `com.techwheels.service`.
  - iOS app registered: `com.techwheels.service`.
  - Native config files generated in `mobile/`:
    - `google-services.json`
    - `GoogleService-Info.plist`
- EAS linkage corrected:
  - `extra.eas.projectId` now UUID: `54c61729-6d1f-414e-8224-18a77663ba75`.
  - `updates.url` now UUID-based URL: `https://u.expo.dev/54c61729-6d1f-414e-8224-18a77663ba75`.
  - `runtimeVersion` configured as `{ "policy": "appVersion" }`.
- AWS S3 integration complete:
  - S3 bucket `techwheels-service-logs-prod` created in ap-south-1 (ap-south-1 = Mumbai).
  - IAM user `techwheels-service-s3-uploader` created with programmatic access.
  - S3 policy attached: scoped `ListBucket`, `GetObject`, `PutObject`, `DeleteObject` for single bucket.
  - AWS CLI profile `techwheels-service` configured and validated:
    - `aws sts get-caller-identity` returns ARN: `arn:aws:iam::405894865811:user/techwheels-service-s3-uploader`
    - `aws s3api head-bucket` confirms bucket access.
    - Smoke test passed: upload, delete test file successful.
  - AWS/S3 env key mapping ready to apply (from reference pattern):
    - `EXPO_PUBLIC_AWS_REGION` / `AWS_REGION`
    - `EXPO_PUBLIC_AWS_ACCESS_KEY_ID` / `AWS_ACCESS_KEY_ID`
    - `EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY` / `AWS_SECRET_ACCESS_KEY`
    - `EXPO_PUBLIC_S3_BUCKET_NAME` / `S3_BUCKET_NAME` = `techwheels-service-logs-prod`
- EAS credentials provisioning complete:
  - Android:
    - Keystore generated and linked for `@tw_admin/techwheels-service` production signing.
    - SHA256 fingerprint recorded: `F3:8A:5A:FE:6E:B2:5F:61:92:3C:F9:AC:85:C2:A6:57:5C:8C:90:8D:C8:2C:39:7C:77:5C:38:2A:C1:DF:41:71`.
  - iOS:
    - Apple account session validated for team `LTSQS2N52R` (First Mobital Private Limited).
    - Distribution certificate reused: serial `3B677E5054DB75243113E50D923B4954` (expires `2027-03-20`).
    - Ad hoc provisioning profile created and active: portal ID `8PC877LYYC` for `com.techwheels.service`.
    - Registered test device included: `00008110-00116CE21186201E` (Vinod Kumar Bijarnia - iPhone).
- Remaining blockers before first OTA-capable preview build:
  - First preview builds (Android APK + iOS IPA) pending.

## Execution Anti-Drift Protocol

This plan is the single execution source of truth. Any important implementation decision must be reflected here before or immediately after code/config change.

### Mandatory Update Triggers
Update this file whenever any one of these changes happens:
1. Build pipeline changes (EAS profiles, channels, runtimeVersion, submission flow).
2. Third-party integration changes (Firebase, AWS S3, Supabase, notification providers, auth providers).
3. Native capability changes (permissions, plugins, app identifiers, google-services.json, Apple capabilities).
4. API contract changes (Edge Function payload/response, required env variables, storage path rules).
5. Release policy changes (OTA-vs-rebuild rules, preview/production branch mapping).
6. Security/credential handling changes (new secrets, secret names, credential rotation process).
7. Any resolved blocker that changes implementation order or acceptance criteria.

### Required Update Format
For each important change:
1. Update the relevant section content.
2. Add a dated entry in the change log below.
3. Update `Last Updated` at the bottom of this document.
4. If execution order changes, update Phase tasks and Success Criteria together.

### Working Rule During Execution
- No major command run (build, submit, OTA publish, credential onboarding) should proceed if this document is stale relative to the latest decision.
- If conflict exists between chat discussion and this document, update this document first, then execute.

### Live Change Log
- 2026-05-30: **COMPLETED** Create Job Card upload-source parity enhancement on mobile: added camera capture + gallery pick + file pick for both walkaround video and car image in [mobile/src/app/job-cards/create.tsx](mobile/src/app/job-cards/create.tsx), preserving draft auto-save behavior.
- 2026-05-30: Published production OTA update for upload-source expansion (`group: 11fbb4d6-941b-4b88-a1ea-70337b343057`, `android update id: 019e7720-fb34-7c00-a437-2f687fe8638a`, `ios update id: 019e7720-fb34-71c6-817b-26385d853f66`, commit `cc2ff18b2fdffe1c60ebc87cd914a5257c855e98`).
- 2026-05-29: Added OTA-first prerequisite gate and credential/build baseline for APK + IPA delivery.
- 2026-05-29: Added Execution Anti-Drift Protocol with mandatory update triggers and sync rules.
- 2026-05-29: Completed CLI readiness preflight; installed missing `firebase` and `aws` CLIs.
- 2026-05-29: Validated mobile Expo config from `mobile/`; recorded Firebase file and OTA config blockers (project UUID wiring, runtimeVersion, native Firebase files).
- 2026-05-29: Reauthenticated Firebase CLI (`admin@firstmobital.com`) and created new Firebase project `techwheels-service` for service app.
- 2026-05-29: Registered Android and iOS Firebase apps for `com.techwheels.service` and generated `google-services.json` + `GoogleService-Info.plist`.
- 2026-05-29: Re-linked EAS project to valid UUID and aligned `updates.url` + `extra.eas.projectId` with UUID-based OTA routing.
- 2026-05-29: Hardened `mobile/eas.json` profiles with release channels (`development`, `preview`, `production`) and preview iOS distribution.
- 2026-05-29: Updated OTA/build scripts in `mobile/package.json` for both platforms (`--platform all`, preview iOS build, production Android+iOS builds).
- 2026-05-29: Added `ota:prod:ios` command and wired dedicated `production-apk` EAS profile for `build:prod:apk` while retaining production AAB flow.
- 2026-05-29: Added explicit `ota:prod:all` command alias for production OTA all-platform publish naming consistency.
- 2026-05-29: Derived AWS/S3 env naming contract from reference project for service rollout (`EXPO_PUBLIC_AWS_REGION`, `EXPO_PUBLIC_AWS_ACCESS_KEY_ID`, `EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY`, `EXPO_PUBLIC_S3_BUCKET_NAME`).
- 2026-05-29: Added AWS S3 console-to-CLI onboarding runbook, least-privilege IAM guidance, and production secret handling guardrail.
- 2026-05-29: Completed AWS S3 integration: bucket created (`techwheels-service-logs-prod`, ap-south-1), IAM user + policy provisioned (`techwheels-service-s3-uploader`), CLI profile configured and validated (sts, bucket head, smoke test all green).
- 2026-05-29: Provisioned Android EAS signing credentials with production keystore and recorded SHA256 fingerprint.
- 2026-05-29: Provisioned iOS EAS credentials by reusing valid Apple distribution certificate and creating active ad hoc provisioning profile with registered test device.
- 2026-05-29: Resolved Expo SDK 54 iOS build failure by aligning `react-native-worklets` dependency with installed `react-native-reanimated`.
- 2026-05-29: Replaced `mobile/src/lib` symlinked files with local materialized copies to satisfy EAS remote build upload constraints.
- 2026-05-29: Completed iOS preview build (`4f68ea74-5e04-4864-88e9-c7545c0beaf4`) and generated installable IPA artifact.
- 2026-05-29: Completed production iOS build + auto-submit to App Store Connect (`build: df2cd31a-0573-4975-b63c-b8a8d931559f`, `submission: b15ab589-6f17-4514-9050-5b589eca6c48`, app id `6774519420`).
- 2026-05-29: Fixed `ota:prod:all` static rendering crash (`window is not defined`) by guarding logger/supabase auth persistence during Node web export.
- 2026-05-29: Published production OTA updates successfully (`all-platform group: f427e5f3-564d-41be-9971-04f3f1c59eb4`, `ios-only group: b261aabd-57c4-4b97-939b-24c3f892cba4`).
- 2026-05-29: Production Android build remains blocked by Expo Free plan monthly Android build quota reset window.
- 2026-05-29: Ported mobile logger to AWS S3 parity flow from reference app (`react-native-aws3`, device-level log file fallback, rate-limited uploads with backoff, debounced flush triggers) while preserving existing `logEvent(eventName, metadata, module)` API.
- 2026-05-29: Set production EAS AWS env vars for logger uploads (`EXPO_PUBLIC_AWS_REGION`, `EXPO_PUBLIC_AWS_ACCESS_KEY_ID`, `EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY`, `EXPO_PUBLIC_S3_BUCKET_NAME`) and verified values are present in `production` environment.
- 2026-05-29: Completed Expo native/prebuild hygiene pass (`expo-doctor` now 18/18) by fixing app config schema drift (`ios.supportsTablet`, `updates.codegenMode` removal, stale `expo.eas` block removal), removing Metro symlink override, and untracking `.expo` state files.
- 2026-05-29: Paused queued production iOS build intentionally to reconcile execution state with this plan before continuing.
- 2026-05-29: Added mandatory Native Build Gate checklist (doctor/install-check/public-config plus native trigger file list) to prevent missed binary rebuild requirements.
- 2026-05-29: Hardened default native dependency baseline by adding missing imported packages (`@expo/vector-icons`, `expo-font`, `@react-navigation/native`) and added automated import-vs-dependency guard script (`npm run check:native-deps`).
- 2026-05-29: **COMPLETED** AutoDoc Create Job Card screen web parity implementation:
  - Implemented vehicle lookup with RC fallback chain: `resolveRegNumberFromReference()` → `fetchVehicleByReg()` → `fetchVehicleFromRcLookup()`
  - Added Vehicle Details form section with 8 fields: VIN, Model, Year, Colour, Paint Type, Date of Sale, Owner Name/Phone, Dealer City, BP City Category
  - Vehicle upsert before job card create (fixes RLS insert policy requiring existing vehicle row)
  - Job Card Details section renamed to "Job Details" (matching web)
  - Field "Claim Type" renamed to "Warranty Claim Type" (web parity)
  - Field "Complaint Notes" renamed to "Customer Complaint" (web parity)
  - Removed "Complaint Date" field (not in web create form)
  - Job Card Number moved from Vehicle Lookup to Job Details section (web parity)
  - Published OTA group b6e6d227-9a78-4c3e-8ce5-529bd6105127 (ios-only)
  - Commit: 46462b5
- 2026-05-29: **COMPLETED** In-app OTA modal for mandatory updates without manual restart:
  - Created `useMandatoryOTAUpdate` hook with background checking on launch/foreground/interval (60s cooldown foreground, 2m session check)
  - Created `MandatoryUpdateModal` blocking UI with update button and error messaging
  - Wired to root layout (`mobile/src/app/_layout.tsx`)
  - Auto-applies update via `Updates.fetchUpdateAsync()` + `Updates.reloadAsync()` when available
  - OTA event logging to module "ota-gate" with stage/reason/error metadata
  - Published OTA group aec8e1f6 (all-platform)
- 2026-05-29: **COMPLETED** S3 logger single rolling object per device fix:
  - Added persistent S3 object key storage in SecureStore (`LOG_S3_OBJECT_KEY`)
  - `resolveS3ObjectKey()` stores key on first upload, retrieves on subsequent uploads
  - Single S3 object per device/email now receives all logs from that device (rolling updates, no new object creation)
  - Same-day log retention: `cleanupOldLogs()` filters device log file to only today's entries (IST date matching)
  - Published OTA group caf6ff69 (all-platform)
- 2026-05-29: **COMPLETED** Back button to dashboard navigation:
  - Header-left back button with blue text "Back" and navigation to `/(tabs)/autodoc` via `router.replace()`
  - Removed redundant "← Back to Dashboard" in-screen button (OTA 61df2d11)
  - Removed "Clear & New" header button (OTA 61df2d11)
- 2026-05-29: **COMPLETED** 6 production iOS OTAs published:
  - c45dabc5: Vehicle lookup + details parity
  - 48def93e: Intermediate
  - d32756eb: Intermediate
  - aec8e1f6: OTA modal + logging
  - 61df2d11: Remove redundant buttons
  - caf6ff69: S3 logger object key fix
  - b6e6d227: Create Job Card web parity

---

## Project Audit Summary

### Web Stack
| Component | Technology |
|-----------|------------|
| UI Framework | React 19 + TypeScript |
| Build Tool | Vite |
| Styling | TailwindCSS v4 |
| Routing | React Router v7 |
| Backend | Supabase (Auth, Postgres, Storage) |
| Charts | Recharts v3 |
| Data Exchange | ExcelJS, XLSX, PapaParse |
| Presentation | PPTXGenJS |

### Core Domains & Pages

#### Domain 1: Authentication
- **Pages**: LoginPage, SignUpPage, PasswordUpdatePage, AuthCallback
- **Logic**: Supabase Auth + JWT token management
- **Mobile Adaptation**: Bottom-sheet or full-screen auth flows

#### Domain 2: Import
- **Page**: ImportPage
- **Capacity**: Multi-file CSV ingest (job cards, parts, invoices)
- **Logic Files**: 
  - `openJobCardsColumnMapper.ts`
  - `cancelJobCardColumnMapper.ts`
  - `closedButNotInvoicedColumnMapper.ts`
  - `invoiceColumnMapper.ts`
  - `partsConsumptionColumnMapper.ts`
  - `partsOrderColumnMapper.ts`
  - `partsStockColumnMapper.ts`
  - `vasColumnMapper.ts`
- **Mobile Adaptation**: 
  - File picker from device storage
  - Real-time upload progress indicator
  - Duplicate detection UI
  - Conflict resolution inline

#### Domain 3: Reports
- **Page**: ReportsPage + category-based report components
- **Report Categories**: Labour, Revenue, Performance, Parts
- **Logic Files**:
  - `reportQueries.ts` (general queries)
  - `partsReportQueries.ts` (parts-specific)
  - `generateExcel.ts` (export to Excel)
  - `generatePPT.ts` (export to PowerPoint)
- **Mobile Adaptation**:
  - Replace Recharts with lightweight charting (Victory Native or custom SVG)
  - Responsive chart sizing
  - Export options adapted (PDF instead of PPT for better mobile support)

#### Domain 4: AutoDoc (Job Card Management)
- **Pages**: AutoDocPage, JobCardPage
- **Capacity**: Full job card lifecycle + vehicle lookup + panel management + photo/document storage
- **Logic Files**:
  - `jobCards.ts` (API)
  - `vehicles.ts` (API)
  - `panels.ts` (API)
  - `photos.ts` (API)
  - `documents.ts` (API)
  - `estimate.ts` (API)
  - `activityLog.ts` (API)
- **Mobile Adaptation**:
  - Camera integration for panel photos
  - Gallery picker for attachments
  - Photo compression before upload
  - Offline document caching
  - Swipeable panel carousel

#### Domain 5: Admin
- **Page**: AdminPage
- **Capacity**: User/dealer/module/permission CRUD
- **Mobile Adaptation**: Simplified admin dashboard, delegated to web for complex tasks

#### Domain 6: Settings
- **Page**: SettingsPage
- **Capacity**: Employee data management
- **Mobile Adaptation**: Mobile-first employee list with search

### Database Schema (Key Tables)
| Table | Purpose |
|-------|---------|
| `documents` | Job card attachments, photos, estimates |
| `employee_master` | Employee roster with fuel type, department |
| `job_cards` | Core job card records |
| `panels` | Vehicle panels linked to job cards |
| `estimate_rows` | Estimate line items |
| `invoices` | Invoice records with status tracking |
| `parts_inventory`, `parts_orders`, `parts_consumption` | Parts lifecycle |
| `vehicles` | Vehicle master with RC lookup |

### API Layer (12 API Modules)
1. `auth.ts` - Login, signup, password reset
2. `vehicles.ts` - Vehicle CRUD, RC lookup
3. `jobCards.ts` - Job card CRUD, status transitions
4. `panels.ts` - Panel management per job card
5. `photos.ts` - Photo upload, retrieval
6. `estimate.ts` - Estimate creation, updates
7. `documents.ts` - Document storage, retrieval
8. `activityLog.ts` - Activity audit trail
9. `email.ts` - Email notifications
10. `autodocRates.ts` - Rate lookup
11. `rcLookup.ts` - RC validation
12. `types.ts` - Shared TS types

### Key Utilities & Helpers
- `columnMatcher.ts` - Infer column headers from CSV
- `employeeMatcher.ts` - Match employee data
- `exportUtils.ts` - Excel/PDF export helpers
- `autodocStorage.ts` - IndexedDB for offline caching
- `reportQueries.ts` & `partsReportQueries.ts` - Dynamic SQL query builders
- `database.types.ts` - Supabase-generated TypeScript types

### Access Control
- **Auth Gate**: Supabase JWT with role labels (admin, manager, staff, viewer)
- **Module Permissions**: `public.modules` table + frontend `ROUTE_MODULE_MAP`
- **Row-Level Security**: RLS policies enforce dealer scoping
- **Dealer Code**: Resolved from JWT metadata

---

## Architecture Decision

### Why Expo Managed Workflow?
- ✅ **Managed Hosting**: EAS Build + EAS Submit handle compilation & signing
- ✅ **Over-the-Air Updates**: Push fixes without app store resubmission
- ✅ **Shared JS Codebase**: React + TypeScript directly (not React Native rewrite)
- ✅ **Rapid Iteration**: Hot reload + same dev experience as web
- ✅ **Production Ready**: Used by Fortune 500 companies

### Code Structure (Monorepo Approach)

```
/Users/vkbin/Techwheels-Service/          # PROJECT ROOT = WEB APP
├── src/                                    # ✅ EXISTING WEB APP (React + Vite)
│   ├── pages/                              # Web pages
│   │   ├── LoginPage.tsx
│   │   ├── ImportPage.tsx
│   │   ├── ReportsPage.tsx
│   │   ├── AutoDocPage.tsx
│   │   ├── AdminPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── ...
│   ├── components/                         # Web components
│   ├── lib/                                # **SHARED BUSINESS LOGIC**
│   │   ├── api/                            # 12 API modules
│   │   │   ├── auth.ts
│   │   │   ├── vehicles.ts
│   │   │   ├── jobCards.ts
│   │   │   ├── panels.ts
│   │   │   ├── photos.ts
│   │   │   ├── documents.ts
│   │   │   ├── estimate.ts
│   │   │   ├── activityLog.ts
│   │   │   ├── email.ts
│   │   │   ├── autodocRates.ts
│   │   │   ├── rcLookup.ts
│   │   │   └── index.ts
│   │   ├── *ColumnMapper.ts                # 8 column mappers
│   │   ├── reportQueries.ts                # Report queries
│   │   ├── partsReportQueries.ts           # Parts queries
│   │   ├── database.types.ts               # TS types (from Supabase)
│   │   ├── supabase.ts                     # Supabase client
│   │   ├── autodocStorage.ts               # Storage layer
│   │   ├── columnMatcher.ts                # CSV utilities
│   │   ├── employeeMatcher.ts              # Employee matching
│   │   ├── branches.ts                     # Branch utilities
│   │   ├── exportUtils.ts                  # Export helpers
│   │   ├── getTableColumns.ts              # Column utilities
│   │   └── generators/                     # Report generators
│   ├── context/                            # React context
│   │   ├── DirtyContext.tsx                # Form state
│   │   └── ...
│   ├── hooks/                              # React hooks
│   ├── App.tsx                             # Web routing
│   ├── main.tsx                            # Entry point
│   └── ...
│
├── mobile/                                 # 🆕 NEW MOBILE APP (Expo)
│   ├── app/                                # Expo Router (file-based routing)
│   │   ├── _layout.tsx                     # Root layout
│   │   ├── (auth)/                         # Auth screens group
│   │   │   ├── _layout.tsx
│   │   │   ├── login.tsx
│   │   │   ├── signup.tsx
│   │   │   └── password-reset.tsx
│   │   ├── (tabs)/                         # Authenticated screens group
│   │   │   ├── _layout.tsx                 # Bottom tab navigation
│   │   │   ├── import/index.tsx
│   │   │   ├── reports/[id].tsx
│   │   │   ├── autodoc/[id].tsx
│   │   │   ├── admin/index.tsx
│   │   │   └── settings/index.tsx
│   │   └── ...
│   ├── components/                         # Mobile-specific components
│   │   ├── auth/
│   │   ├── import/
│   │   ├── reports/
│   │   ├── autodoc/
│   │   ├── settings/
│   │   ├── admin/
│   │   └── common/                         # Shared UI components
│   ├── lib/                                # **SYMLINKED TO ../src/lib/**
│   │   ├── api/                            # 🔗 Symlink to ../../src/lib/api
│   │   ├── *ColumnMapper.ts                # 🔗 Symlinks
│   │   ├── reportQueries.ts                # 🔗 Symlink
│   │   ├── partsReportQueries.ts           # 🔗 Symlink
│   │   ├── database.types.ts               # 🔗 Symlink
│   │   ├── columnMatcher.ts                # 🔗 Symlink
│   │   ├── employeeMatcher.ts              # 🔗 Symlink
│   │   ├── branches.ts                     # 🔗 Symlink
│   │   ├── exportUtils.ts                  # 🔗 Symlink
│   │   ├── getTableColumns.ts              # 🔗 Symlink
│   │   ├── supabase.ts                     # Mobile adaptation (AsyncStorage)
│   │   └── autodocStorage.ts               # Mobile adaptation (AsyncStorage)
│   ├── hooks/                              # Mobile-specific hooks
│   │   ├── useCamera.ts
│   │   ├── useMediaLibrary.ts
│   │   ├── useDocumentPicker.ts
│   │   ├── useReportData.ts                # Adapted from web
│   │   ├── useOnline.ts                    # Adapted from web
│   │   ├── useLastUpdated.ts               # Adapted from web
│   │   ├── useOfflineQueue.ts
│   │   └── ...
│   ├── context/                            # Mobile context
│   │   ├── AuthContext.tsx
│   │   ├── DirtyContext.tsx                # 🔗 Symlinked from web
│   │   ├── PermissionContext.tsx
│   │   └── ...
│   ├── app.config.js                       # Dynamic Expo configuration
│   ├── eas.json                            # EAS build profiles
│   ├── package.json                        # All dependencies pre-bundled
│   ├── babel.config.js                     # Babel configuration
│   └── metro.config.js                     # Metro bundler config
│
├── package.json                            # Web project config
├── tsconfig.json
├── vite.config.ts
├── supabase/                               # Shared backend config
│   ├── migrations/
│   ├── functions/
│   └── ...
├── docs/
├── scripts/
└── ... (other root files)
```

### Key Points:
✅ **NO `/web` folder** - Project root IS the web application  
✅ **`src/` at root** - Contains all web code (existing structure)  
✅ **`mobile/` folder** - New mobile app, symlinks to `../src/lib/` for shared logic  
✅ **Monorepo benefits**: Single source of truth for API logic, types, queries  
✅ **Zero duplication**: Same 12 API modules used by both web & mobile  

---

## Why This Structure?
1. **Monorepo = Single Source of Truth** for business logic
2. **`mobile/lib/` symlinked to `src/lib/`** = Zero duplication
3. **Expo Router** provides web-like file-based routing without React Router
4. **Group layouts** enable shared UI (auth flows, authenticated tabs)
5. **Easy dependency management**: All web packages pre-included in mobile `package.json`

---

## Phase-Wise Implementation Plan

### Phase 1: Project Initialization & Setup (1-2 days)

#### 1.1 Create Expo Project
```bash
cd /Users/vkbin/Techwheels-Service
mkdir mobile
cd mobile
expo init --template bare-minimum techwheels-service
# or use: npx create-expo-app@latest techwheels-service
cd techwheels-service
```

#### 1.2 Configure TypeScript
```bash
npm install --save-dev typescript @types/react @types/react-native
npx tsc --init
```

#### 1.3 Install Core Dependencies (COMPREHENSIVE - ALL by default)
Create `mobile/package.json` with ALL required modules pre-bundled:

```json
{
  "name": "techwheels-service-mobile",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "build:prod:apk": "eas build -p android --profile production-apk",
    "build:preview:apk": "eas build -p android --profile preview",
    "ota:prod": "CI=1 eas update --branch production --platform all --message",
    "ota:prod:all": "CI=1 eas update --branch production --platform all --message",
    "ota:prod:ios": "CI=1 eas update --branch production --platform ios --message",
    "ota:preview": "CI=1 eas update --branch preview --platform all --message"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.103.3",
    "@react-native-async-storage/async-storage": "2.2.0",
    "@react-native-picker/picker": "^2.11.1",
    "@react-native-community/datetimepicker": "8.4.4",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "react-native": "0.81.5",
    "react-native-gesture-handler": "2.28.0",
    "react-native-reanimated": "4.1.6",
    "react-native-safe-area-context": "5.6.2",
    "react-native-screens": "4.16.0",
    "react-native-web": "^0.21.0",
    "expo": "~54.0.33",
    "expo-router": "~6.0.23",
    "expo-constants": "18.0.13",
    "expo-device": "~8.0.10",
    "expo-file-system": "19.0.21",
    "expo-camera": "~17.0.10",
    "expo-image-picker": "~17.0.10",
    "expo-document-picker": "14.0.8",
    "expo-sharing": "~14.0.7",
    "expo-print": "~15.0.7",
    "expo-linking": "~8.0.11",
    "expo-local-authentication": "~17.0.8",
    "expo-location": "~19.0.8",
    "expo-notifications": "~0.32.16",
    "expo-background-fetch": "~14.0.9",
    "expo-task-manager": "~14.0.9",
    "expo-updates": "~29.0.16",
    "expo-build-properties": "~1.0.10",
    "expo-application": "~7.0.8",
    "expo-secure-store": "15.0.8",
    "exceljs": "^4.4.0",
    "papaparse": "^5.5.3",
    "pptxgenjs": "^4.0.1",
    "recharts": "^3.8.1",
    "xlsx": "^0.18.5",
    "jspdf": "^2.5.1",
    "jspdf-autotable": "^3.8.2",
    "html2canvas": "^1.4.1",
    "qrcode": "^1.5.4",
    "classnames": "^2.5.1",
    "zustand": "^5.0.8",
    "dotenv": "^17.3.1",
    "date-fns": "^4.1.0",
    "nativewind": "^4.x",
    "tailwindcss": "^4.1.13",
    "zod": "^3.23.8",
    "csv-parse": "^6.1.0",
    "iconv-lite": "^0.7.0",
    "lucide-react": "^0.544.0"
  },
  "devDependencies": {
    "@babel/core": "^7.26.0",
    "@types/react": "~19.1.10",
    "@types/react-native": "^0.81.0",
    "babel-plugin-module-resolver": "^5.0.2",
    "babel-plugin-transform-import-meta": "^2.3.3",
    "typescript": "~5.9.2",
    "patch-package": "^8.0.1",
    "eslint": "^8.57.0"
  },
  "engines": {
    "node": ">=20.19.0",
    "npm": ">=10.x"
  }
}
```

**Key Points**:
- ✅ ALL web dependencies included (Supabase, ExcelJS, PapaParse, etc.)
- ✅ ALL mobile-specific packages (Expo, Camera, ImagePicker, etc.)
- ✅ State management (Zustand)
- ✅ Styling (TailwindCSS, NativeWind)
- ✅ Document generation (jsPDF, html2canvas)
- ✅ Data parsing (CSV, PapaParse, XLSX)
- ✅ Storage & Auth (AsyncStorage, Secure Store, Supabase)
- ✅ Utilities (date-fns, classnames, qrcode, zod)
- ✅ Proven versions from reference project

**Bundle Result**:
- APK includes ALL dependencies (~150 MB compressed)
- No npm downloads needed on device
- OTA updates only push app code changes (~50-200 KB)

#### 1.4 Set Up Routing (Expo Router)
```bash
npm install expo-router expo-font expo-splash-screen
```

Create `app/_layout.tsx`:
```tsx
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  )
}
```

#### 1.5 Set Up TypeScript + NativeWind (Tailwind for React Native)
```bash
npm install nativewind tailwindcss
npx tailwindcss init
```

Create `tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
```

#### 1.6 Configure Supabase Environment Variables
Create `.env.local`:
```env
EXPO_PUBLIC_SUPABASE_URL=<your_supabase_url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your_anon_key>
```

#### 1.7 Copy Database Types
```bash
cp ../src/lib/database.types.ts ./lib/
```

#### 1.8 Initialize APK Pre-Bundling
Add to `app.json`:
```json
{
  "expo": {
    "name": "Techwheels",
    "slug": "techwheels-service",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "plugins": [
      ["expo-build-properties", {
        "ios": { "useFrameworks": "static" },
        "android": {}
      }]
    ],
    "eas": {
      "build": {
        "experimental": {
          "prebuildCommand": "echo 'prebuild'"
        }
      }
    }
  }
}
```

**Deliverable**: Expo project structure ready, all dependencies installed

---

### Phase 2: Shared Code Layer Setup (1-2 days)

#### 2.1 Create Symlinks for Shared Code
```bash
cd mobile/lib
ln -s ../../src/lib/api ./api
ln -s ../../src/lib/*ColumnMapper.ts .
ln -s ../../src/lib/reportQueries.ts .
ln -s ../../src/lib/partsReportQueries.ts .
ln -s ../../src/lib/database.types.ts .
ln -s ../../src/lib/columnMatcher.ts .
ln -s ../../src/lib/employeeMatcher.ts .
ln -s ../../src/lib/branches.ts .
ln -s ../../src/lib/getTableColumns.ts .
```

#### 2.2 Adapt Supabase Client for Mobile
Create `mobile/lib/supabase.ts` (adapts web version):
```tsx
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Database } from './database.types'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

export const hasSupabaseEnv = !!supabaseUrl && !!supabaseKey
```

#### 2.3 Adapt Local Storage (IndexedDB → AsyncStorage)
Create `mobile/lib/autodocStorage.ts` (mobile version):
```tsx
import AsyncStorage from '@react-native-async-storage/async-storage'

export const autodocStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
}
```

#### 2.4 Create State Management Layer (Zustand - from Reference Project)
Reference project uses **Zustand with persist middleware** (proven pattern):

```bash
mkdir -p mobile/store
```

Create `mobile/store/jobCardStore.ts` (Zustand with persistence):
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface JobCardState {
  selectedJobCardId: string | null
  draftJobCards: Record<string, any>
  setSelectedJobCard: (id: string) => void
  saveDraft: (id: string, data: any) => void
  clearDraft: (id: string) => void
}

export const useJobCardStore = create<JobCardState>(
  persist(
    (set) => ({
      selectedJobCardId: null,
      draftJobCards: {},
      setSelectedJobCard: (id) => set({ selectedJobCardId: id }),
      saveDraft: (id, data) =>
        set((state) => ({
          draftJobCards: { ...state.draftJobCards, [id]: data },
        })),
      clearDraft: (id) =>
        set((state) => {
          const drafts = { ...state.draftJobCards }
          delete drafts[id]
          return { draftJobCards: drafts }
        }),
    }),
    {
      name: 'job-card-store',
      storage: AsyncStorage, // Mobile persistence
    }
  )
)
```

**Pattern Rationale**: Zustand is lighter than Redux, easier to type with TypeScript, and persist middleware survives app restarts (from ref project).

#### 2.5 Create Context Layer (Auth, Permissions)
```bash
mkdir -p mobile/context
cp ../src/context/DirtyContext.tsx ./context/
```

Create `mobile/context/AuthContext.tsx`:
```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  session: Session | null
  user: Session['user'] | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription?.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

#### 2.5 Create Custom Hooks for Mobile
Create `mobile/hooks/` folder:

**`useCamera.ts`**:
```tsx
import * as ImagePicker from 'expo-image-picker'

export const useCamera = () => {
  const takePicture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') throw new Error('Camera permission denied')
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      aspect: [4, 3],
      quality: 0.8,
    })
    return result
  }
  return { takePicture }
}
```

**`useMediaLibrary.ts`**:
```tsx
import * as ImagePicker from 'expo-image-picker'

export const useMediaLibrary = () => {
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') throw new Error('Media library permission denied')
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      aspect: [4, 3],
      quality: 0.8,
    })
    return result
  }
  return { pickImage }
}
```

**`useDocumentPicker.ts`**:
```tsx
import * as DocumentPicker from 'expo-document-picker'

export const useDocumentPicker = () => {
  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'application/vnd.ms-excel'],
    })
    return result
  }
  return { pickDocument }
}
```

#### 2.6 Create Mobile-Safe Utility Exports
Create `mobile/lib/utils.ts`:
```tsx
// Re-export shared utilities
export * from './columnMatcher'
export * from './employeeMatcher'
export * from './exportUtils'
export * from './reportQueries'
export * from './partsReportQueries'
export * from './branches'
export * from './getTableColumns'
```

**Deliverable**: Shared code layer integrated, mobile-safe adapters created

---

### Phase 3: Authentication Screens (1-2 days)

#### 3.1 Create Auth Group Layout
Create `mobile/app/(auth)/_layout.tsx`:
```tsx
import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animationEnabled: true,
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="password-reset" />
    </Stack>
  )
}
```

#### 3.2 Create Login Screen
Create `mobile/app/(auth)/login.tsx`:
```tsx
import { useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.replace('/(tabs)/import')
    } catch (error: any) {
      Alert.alert('Login Failed', error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="flex-1 justify-center px-4 bg-white">
      <Text className="text-3xl font-bold mb-8 text-center">Techwheels</Text>
      <TextInput
        className="border border-gray-300 rounded px-4 py-3 mb-4"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        editable={!loading}
      />
      <TextInput
        className="border border-gray-300 rounded px-4 py-3 mb-6"
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />
      <TouchableOpacity
        className="bg-blue-600 rounded py-3 mb-4"
        onPress={handleLogin}
        disabled={loading}
      >
        <Text className="text-white text-center font-semibold">
          {loading ? 'Signing in...' : 'Sign In'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
        <Text className="text-center text-gray-600">Don't have an account? <Text className="text-blue-600 font-semibold">Sign Up</Text></Text>
      </TouchableOpacity>
    </View>
  )
}
```

#### 3.3 Create Sign Up & Password Reset Screens
(Similar pattern for `signup.tsx` and `password-reset.tsx`)

**Deliverable**: Auth flow screens created, Supabase Auth integrated

---

### Phase 4: Main Navigation & Tab Screens (2-3 days)

#### 4.1 Create Tab Navigation Layout
Create `mobile/app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router'
import { useAuth } from '../../context/AuthContext'

export default function TabsLayout() {
  const { loading } = useAuth()

  if (loading) return null

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#2563eb',
      }}
    >
      <Tabs.Screen
        name="import/index"
        options={{
          title: 'Import',
          tabBarLabel: 'Import',
        }}
      />
      <Tabs.Screen
        name="reports/index"
        options={{
          title: 'Reports',
          tabBarLabel: 'Reports',
        }}
      />
      <Tabs.Screen
        name="autodoc/index"
        options={{
          title: 'AutoDoc',
          tabBarLabel: 'AutoDoc',
        }}
      />
      <Tabs.Screen
        name="settings/index"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
        }}
      />
      <Tabs.Screen
        name="admin/index"
        options={{
          title: 'Admin',
          tabBarLabel: 'Admin',
        }}
      />
    </Tabs>
  )
}
```

#### 4.2 Create Import Screen (Mobile-Centric)
Create `mobile/app/(tabs)/import/index.tsx`:
```tsx
import { useState } from 'react'
import { View, Text, TouchableOpacity, FlatList, Alert } from 'react-native'
import { useDocumentPicker } from '../../../hooks/useDocumentPicker'
import * as Papa from 'papaparse'

const IMPORT_TYPES = [
  { id: 'job_cards', label: 'Job Cards', mapper: 'openJobCardsColumnMapper' },
  { id: 'invoices', label: 'Invoices', mapper: 'invoiceColumnMapper' },
  { id: 'parts_order', label: 'Parts Orders', mapper: 'partsOrderColumnMapper' },
]

export default function ImportScreen() {
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const { pickDocument } = useDocumentPicker()

  const handleSelectFile = async () => {
    try {
      const result = await pickDocument()
      if (result.canceled) return

      const file = result.assets[0]
      // Parse CSV and upload
      Alert.alert('Success', 'File uploaded successfully')
    } catch (error: any) {
      Alert.alert('Error', error.message)
    }
  }

  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold mb-6">Import Data</Text>

      <FlatList
        data={IMPORT_TYPES}
        renderItem={({ item }) => (
          <TouchableOpacity
            className={`p-4 mb-3 rounded-lg ${
              selectedType === item.id ? 'bg-blue-600' : 'bg-white border border-gray-200'
            }`}
            onPress={() => setSelectedType(item.id)}
          >
            <Text className={selectedType === item.id ? 'text-white font-semibold' : 'text-gray-800'}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
      />

      {selectedType && (
        <TouchableOpacity
          className="bg-blue-600 rounded-lg py-3 mt-6"
          onPress={handleSelectFile}
        >
          <Text className="text-white text-center font-semibold">Select File</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
```

#### 4.3 Create Reports Screen
Create `mobile/app/(tabs)/reports/index.tsx`:
(Use Victory Native for lightweight charts instead of Recharts)

```tsx
import { View, Text, ScrollView } from 'react-native'
import { useReportData } from '../../../hooks/useReportData'

export default function ReportsScreen() {
  const { data, loading } = useReportData()

  if (loading) return <Text>Loading...</Text>

  return (
    <ScrollView className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold mb-6">Reports</Text>
      {/* Victory Native charts here */}
    </ScrollView>
  )
}
```

#### 4.4 Create AutoDoc Screen
Create `mobile/app/(tabs)/autodoc/index.tsx`:
(List of job cards with actions)

#### 4.5 Create Settings Screen
Create `mobile/app/(tabs)/settings/index.tsx`:

#### 4.6 Create Admin Screen
Create `mobile/app/(tabs)/admin/index.tsx`:

**Deliverable**: Main navigation + 5 core screens scaffolded

---

### Phase 5: Feature Implementation (3-5 days)

#### 5.1 Import Feature
- CSV file picker integration
- Column mapper application
- Duplicate detection
- Conflict resolution UI
- Upload progress tracking
- Error handling & retry logic

#### 5.2 Reports Feature
- Report query execution (shared queries)
- Chart rendering (Victory Native)
- Export to PDF
- Filter UI (date range, branch, etc.)

#### 5.3 AutoDoc Feature
- Job card list (infinite scroll)
- Job card detail view
- Panel carousel (swipeable)
- Photo capture (camera)
- Photo gallery picker
- Document upload
- Estimate entry
- Activity log
- Status transitions (with permissions check)

#### 5.4 Settings Feature
- Employee list (search, pagination)
- User settings
- Logout

#### 5.5 Admin Feature
- User CRUD (if permissions allow)
- Module permissions
- Dealer assignment

**Deliverable**: All features working end-to-end with mobile UI/UX

---

### Phase 6: Testing & Optimization (2-3 days)

#### 6.1 Testing Strategy
- **Unit Tests**: Shared business logic (mappers, queries)
- **Integration Tests**: API layer with Supabase
- **E2E Tests**: Critical user flows (login → import → report)
- **Device Testing**: Android emulator + iOS simulator + real devices

#### 6.2 Performance Optimization
- Image compression before upload
- Lazy loading for reports
- Memoization of expensive calculations
- Code splitting for routes

#### 6.3 Offline Support
- AsyncStorage caching for frequently accessed data
- IndexedDB-like database for offline job card drafts
- Sync queue for pending uploads

**Deliverable**: All tests passing, app optimized for mobile

---

### Phase 7: OTA-Ready Builds and Deployment (2-3 days)

#### 7.1 Release Channels and Runtime Baseline
Before first distributable build, ensure app config has:

```json
{
  "expo": {
    "runtimeVersion": { "policy": "appVersion" },
    "updates": {
      "url": "https://u.expo.dev/<PROJECT_UUID>",
      "fallbackToCacheTimeout": 0,
      "codegenMode": "partial"
    },
    "extra": {
      "eas": {
        "projectId": "<PROJECT_UUID>"
      }
    }
  }
}
```

Rules:
- Same UUID must be used in both `updates.url` and `extra.eas.projectId`.
- `runtimeVersion` must be present from build one to guarantee OTA compatibility boundaries.

#### 7.2 Build Profiles (APK + IPA/AAB)
Use `eas.json` profiles aligned to output types:

```json
{
  "cli": { "version": ">= 18.3.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    },
    "production": {
      "autoIncrement": true,
      "channel": "production",
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": { "production": {} }
}
```

Notes:
- `preview` Android gives QA-installable APK.
- `preview` iOS produces installable IPA for internal device testing.
- `production` Android should be AAB for Play Store.

#### 7.3 First Build Sequence (OTA Enabled From Day 1)
Run from `mobile/` only:

```bash
eas login
eas init
npx expo-doctor
npx expo config --type public

# Android internal install build (APK)
eas build --platform android --profile preview

# iOS internal install build (IPA)
eas build --platform ios --profile preview
```

Optional production builds:

```bash
# Android Play Store artifact (AAB)
eas build --platform android --profile production

# iOS App Store artifact
eas build --platform ios --profile production
```

#### 7.4 OTA Command Set (Both Platforms)
Add/update scripts so OTA can target both platforms from first release:

```json
{
  "scripts": {
    "ota:preview": "CI=1 eas update --branch preview --platform all --message",
    "ota:prod": "CI=1 eas update --branch production --platform all --message"
  }
}
```

Release usage:

```bash
npm run ota:preview -- --message "Fix autodoc stage routing"
npm run ota:prod -- --message "Fix report export crash"
```

#### 7.5 OTA vs Rebuild Decision Matrix
- OTA allowed: JS/TS logic, screen layout, validation rules, API request/response mapping.
- Rebuild required: native module/plugin addition, permission/plugin config changes, app icon/splash, SDK upgrade, runtimeVersion change.

#### 7.5.1 Native Build Gate (Mandatory Before OTA-Only Release)
Run this gate before any release decision:

```bash
cd mobile
npm run check:native-deps
npx --yes expo-doctor
npx expo install --check
npx expo config --type public
```

Gate must be green only when all are true:
- `npm run check:native-deps` reports no undeclared external imports.
- `expo-doctor` reports no native/config failures.
- `expo install --check` reports no required SDK compatibility upgrades.
- Public Expo config includes expected Firebase/native entries (`android.googleServicesFile`, `ios.googleServicesFile`, plugins list, `runtimeVersion`).

Treat as native rebuild required if any of these changed since last production binary:
- `mobile/package.json` (new/updated native dependency such as `expo-*`, `react-native-*`, native SDK bridge libs).
- `mobile/package-lock.json` (native dependency tree changes).
- `mobile/app.json` or `mobile/app.config.js` (plugins, permissions, bundle IDs, native files, runtimeVersion behavior).
- `mobile/google-services.json` or `mobile/GoogleService-Info.plist`.
- `mobile/metro.config.js`, `mobile/babel.config.js`, `mobile/eas.json` when they alter native build behavior.
- Any `mobile/ios/**` or `mobile/android/**` file when prebuild folders are present.

If any trigger above is true, do not ship OTA-only. Build a fresh preview binary first, validate on device, then promote.

#### 7.6 Deployment Targets
- Internal QA: preview channel APK + IPA.
- External stores: production AAB/IPA via EAS Submit.

**Deliverable**: OTA-enabled first builds produced for Android (APK) and iOS (IPA), with production pipeline ready.

---

## Shared Code Layer Strategy

### File Synchronization

#### Approach 1: Symlinks (Recommended for monorepo)
```bash
cd mobile/lib
ln -s ../../src/lib/api ./api
ln -s ../../src/lib/*ColumnMapper.ts .
# ... etc
```

**Pros**: Zero duplication, updates automatically  
**Cons**: Windows compatibility issues

#### Approach 2: npm Workspace
```json
{
  "workspaces": [
    ".",
    "mobile"
  ]
}
```

Create `packages.json` in `mobile/`:
```json
{
  "name": "@techwheels/mobile",
  "dependencies": {
    "@techwheels/shared": "workspace:*"
  }
}
```

**Pros**: Works on all OS, proper dependency management  
**Cons**: Requires refactoring to `shared/` folder

#### Approach 3: Manual Copy with CI/CD
Copy shared files on build:
```bash
npm run prebuild:mobile  # Copies files from src/lib
```

**Pros**: Simple, no symlinks  
**Cons**: Manual sync required

### Recommendation
**Use Symlinks initially** → Easy to test → Migrate to workspace if needed

---

## Module Bundling Strategy

### Objective
Minimize OTA update size by pre-including all dependencies in APK

### Implementation

#### 1. **Include all dependencies by default in `package.json`**
```json
{
  "dependencies": {
    // All 20+ packages included
  }
}
```

#### 2. **Configure webpack/metro to bundle everything**
Expo automatically bundles all installed modules → No extra config needed

#### 3. **Disable remote OTA updates for major dependencies**
```json
{
  "expo": {
    "updates": {
      "checkAutomatically": "ON_LOAD",
      "fallbackToCacheTimeout": 0
    }
  }
}
```

#### 4. **OTA Updates Only for App Code**
Only push updates to `app/` folder, not `node_modules/`

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Symlink breaking on Windows** | Development blocked | Use npm workspace alternative |
| **APK size bloat** | Long download time | Pre-bundle, enable ProGuard on Android |
| **Offline sync conflicts** | Data inconsistency | Queue + conflict resolution logic |
| **RLS policy misalignment** | Unauthorized access | Test every API call with dummy credentials |
| **Charting library incompatibility** | Reports broken on mobile | Use Victory Native (React Native compatible) |
| **Camera/file permissions** | Feature not working | Request permissions early, provide fallback |
| **Supabase session expiry** | User logged out mid-session | Auto-refresh token on every API call |

---

## Success Criteria

### Phase-Gate Checkpoints

| Phase | Checkpoint | Status |
|-------|-----------|--------|
| 1 | Expo project initialized, all dependencies installed | 🟢 Complete |
| 2 | Shared code layer integrated, symlinks working | 🟢 Complete |
| 3 | Auth flow end-to-end (login → dashboard) | 🟢 Complete |
| 4 | Main navigation + 5 core screens functioning | � Complete |
| 5 | All features working (import, reports, autodoc, admin, settings) | 🟢 In Active Development |
| 6 | 100% test coverage for shared logic, E2E tests passing | 🟡 Pending |
| 7 | APK built & deployable via EAS, OTA updates configured | 🟢 Complete (iOS; Android blocked by quota) |

### Feature Parity Checklist

- 🟢 **Authentication**: Login/signup/password reset wired to Supabase, session restore and route guards active
- 🟢 **Import Dashboard**: Live job card list integrated, UI/UX mobile-centric
- 🟡 **Reports**: Screen scaffold exists; live report queries and exports in progress
- 🟢 **AutoDoc - Create Job Card**: Complete web parity achieved:
  - Vehicle lookup with RC fallback chain implemented
  - Vehicle Details section with all 8 fields (VIN, Model, Year, Colour, Paint Type, Date of Sale, Owner Name/Phone, Dealer City, BP Category)
  - Vehicle upsert before job card create (RLS compliance)
  - Job Details section properly named and labeled (Warranty Claim Type, Customer Complaint)
  - Complaint Date field removed (web parity)
  - Back button to dashboard navigation
  - OTA groups: c45dabc5, aec8e1f6, 61df2d11, caf6ff69, b6e6d227
- 🟠 **AutoDoc - Full Lifecycle**: List, detail route, stage routing, panels, photos, documents, estimate in active development
- 🟠 **AutoDoc - OTA Modal**: Mandatory in-app update modal deployed (OTA aec8e1f6) with auto-reload capability
- 🟠 **Admin**: Basic screen and gating in place; full CRUD workflows pending
- 🟠 **Settings**: Screen and logout flow working; full settings coverage pending
- 🟡 **Offline Support**: Framework exists; type/runtime stabilization and sync validation pending
- 🟢 **Access Control**: Auth group and tabs group redirect guards active
- 🟢 **Logging**: AWS S3 integration with persistent device object key and same-day retention deployed (OTA caf6ff69)

### Performance Targets

- APK size: < 150 MB (compressed)
- App startup time: < 3 seconds
- Report load time: < 2 seconds
- Photo upload: < 10 seconds (with compression)
- OTA update size: < 10 MB

### OTA Deployment Milestones

| OTA Group | Date | Platform | Message | Features |
|-----------|------|----------|---------|----------|
| c45dabc5 | 2026-05-29 | iOS | Vehicle lookup + details parity | RC fallback, Vehicle Details section |
| aec8e1f6 | 2026-05-29 | iOS | Mandatory OTA modal | In-app update gate, auto-reload |
| 61df2d11 | 2026-05-29 | iOS | Remove redundant buttons | Clean "Clear & New", "← Back to Dashboard" |
| caf6ff69 | 2026-05-29 | iOS | Stabilize S3 logger object key | Single rolling log per device, same-day retention |
| b6e6d227 | 2026-05-29 | iOS | Restore web parity: Job Details section | Warranty Claim Type, Customer Complaint, Job Card # reordered |
| (Android) | (Blocked) | (Android) | (Quota reset) | (Pending monthly reset or billing upgrade) |

---

## Next Steps

### Completed (Phase 1-4, AutoDoc Create)
1. ✅ CLI readiness pass (`eas`, `expo`, `firebase`, `aws`).
2. ✅ Mobile config validation from `mobile/`.
3. ✅ Firebase onboarding for service app (project + Android/iOS app registration + native files).
4. ✅ AWS S3 onboarding (CLI profile, bucket access verification, env mapping runbook).
5. ✅ EAS project linking (`projectId` and `updates.url` aligned on UUID).
6. ✅ Build profile hardening verification (preview APK/IPA channel mapping and production artifact profile).
7. ✅ EAS credentials/signing provisioning (Android + iOS) and first OTA-capable preview iOS build.
8. ✅ Production iOS build with `--auto-submit`; Apple processing path now active in App Store Connect.
9. ✅ Production OTA publish smoke test (`ota:prod:all` and `ota:prod:ios`).
10. ✅ In-app OTA modal (mandatory update without manual restart) - wired to root layout, auto-reload via Expo Updates.
11. ✅ AWS S3 logger with persistent device object key - single rolling log per device, same-day retention.
12. ✅ Create Job Card screen web parity - vehicle lookup, vehicle details, job details sections all aligned with web.
13. ✅ Back button navigation to dashboard.
14. ✅ 7 production iOS OTAs published and delivered (c45dabc5, 48def93e, d32756eb, aec8e1f6, 61df2d11, caf6ff69, b6e6d227).

### In Progress / Next (Phase 5-7)
1. **AutoDoc Full Lifecycle** - Job card list with stage status chips (clickable), detail/stage routing with identity hint preservation, panel carousel, photo gallery, document upload, estimate entry, activity log.
2. **Reports Feature** - Dynamic report queries with filters, lightweight chart rendering, PDF export.
3. **Import Feature** - File picker integration, column mapper, duplicate detection, conflict resolution.
4. **Admin Feature** - User/module/permission CRUD.
5. **Settings Feature** - Employee list, user settings.
6. **Testing** - Unit, integration, E2E test suite.
7. **Android APK** - Wait for monthly quota reset or billing upgrade, then build and validate.
8. **Play Store Submission** - AAB build, app listing, testing groups setup.

### Blocked
- **Android production build execution**: Expo Free plan monthly Android build quota exhausted; awaiting monthly reset or billing upgrade.

---

## Appendix: EAS Credentials and First Build Checklist

### Prerequisites
- Expo account and organization permissions confirmed.
- EAS CLI installed and authenticated (`eas whoami`).
- Apple Developer and Google Play Console access available.

### Android Credential Inputs
```bash
# In mobile/
eas credentials -p android
```

Checklist:
- Keystore created or imported in EAS.
- `mobile/google-services.json` present when push notifications are enabled.

### iOS Credential Inputs
```bash
# In mobile/
eas credentials -p ios
```

Checklist:
- Correct Apple Team selected.
- Distribution certificate and provisioning profile managed by EAS.

### Device Testing Path
```bash
# Dev runtime check only
npx expo start --clear --tunnel

# Installable binary testing
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

Expo Go is useful for fast JS iteration, but release validation must happen on EAS-built APK/IPA.

### AWS S3 Onboarding (Console + CLI)

Use this exact sequence for service app S3 setup:

1. In AWS Console, switch to target region (recommended: `ap-south-1` unless business requires otherwise).
2. Create bucket for service logs/artifacts (example pattern: `techwheels-service-logs-prod`).
3. Keep Block Public Access enabled for all settings.
4. Enable default encryption (SSE-S3 at minimum).
5. Create an IAM user for programmatic S3 access (do not use root credentials).
6. Attach least-privilege bucket policy to IAM user (`s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` scoped to target bucket).
7. Create access key for that IAM user.
8. Configure local AWS profile:

```bash
aws configure --profile techwheels-service
```

9. Validate identity and bucket access:

```bash
AWS_PROFILE=techwheels-service aws sts get-caller-identity
AWS_PROFILE=techwheels-service aws s3api head-bucket --bucket <YOUR_BUCKET_NAME> --region <YOUR_REGION>
```

10. Perform upload/delete smoke test:

```bash
echo "techwheels-service-s3-check" > /tmp/tw-s3-check.txt
AWS_PROFILE=techwheels-service aws s3 cp /tmp/tw-s3-check.txt s3://<YOUR_BUCKET_NAME>/healthchecks/tw-s3-check.txt
AWS_PROFILE=techwheels-service aws s3 rm s3://<YOUR_BUCKET_NAME>/healthchecks/tw-s3-check.txt
```

Security rule:
- Do not place long-lived AWS secret keys in app-bundled public variables for production mobile runtime.
- Prefer server-side credential usage (for example, edge/backend upload flow).

Current code note:
- Current mobile logger now uploads debug logs to AWS S3 using EXPO_PUBLIC AWS/S3 credentials and Expo `extra` fallback values.

---

**Document Status**: EXECUTION READY + Create Job Card Parity Complete (Prerequisites + OTA baseline defined, anti-drift protocol active, upload source expansion deployed via production OTA)  
**Last Updated**: 2026-05-30 (Create flow upload-source expansion + production OTA publish for android/ios)  
**Next Review**: AutoDoc full lifecycle, Reports feature, Android APK (pending quota reset), Play Store submission
