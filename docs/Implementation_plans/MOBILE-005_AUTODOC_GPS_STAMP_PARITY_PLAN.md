# MOBILE-005: AutoDoc Mobile Parity with Mandatory GPS-Stamped Damage Photos

**Plan ID:** MOBILE-005  
**Created:** 2026-05-28  
**Priority:** HIGH  
**Owner:** Techwheels Product + Mobile Dev Team  
**Status:** PENDING

---

## Executive Summary

This plan delivers full mobile parity for AutoDoc workflows and enforces mandatory GPS stamping for stage-wise damage photos (pre-repair, under-repair, post-repair). Every uploaded damage photo must carry a visible GPS information card burned into the image and the same GPS fields persisted in panel_photos for audit and reporting.

The current mobile AutoDoc implementation only covers job card listing and simple status updates. Stage-wise panel photo capture, panel workflows, document flows, and estimate workflows are not yet implemented in mobile parity.

**Risk Level:** MEDIUM  
**Estimated Duration:** 5-8 development days + 1-2 QA days  
**Rollback Strategy:** Feature-flag mobile GPS-stamped flow; keep existing web flow unchanged; disable strict GPS enforcement temporarily if critical production blocker appears.

### Alignment with Existing Mobile Program (MOBILE-001 / MOBILE-002)

- This plan is an execution extension of MOBILE-001 parity goals and MOBILE-002 Phase 5.3 AutoDoc tasks.
- It must preserve mobile-centric UI while keeping shared business logic in the existing monorepo approach.
- It contributes directly to MOBILE-002 sequence item: Extend AutoDoc workflows (panels/photos/documents/estimates).

Program-level constraints inherited from existing plans:
- Code reuse first: prefer existing shared API modules and shared types.
- Keep behavior consistent with Supabase auth, dealer scoping, and RLS assumptions.
- Use Expo-managed workflow and follow native readiness gates before production APK/IPA rollout.

---

## Objectives

1. Build mobile AutoDoc screens to match core web workflow parity.
2. Make GPS stamping mandatory for all stage-wise damage photo uploads.
3. Store GPS metadata in panel_photos (gps_lat, gps_lng, gps_city, captured_at).
4. Ensure uploaded final file is stamped image only (no unstamped image persisted as final artifact).
5. Add operational validations and QA gates before production rollout.

---

## Execution Order (Mandatory)

This plan follows strict sequencing to protect parity and reduce rework:

1. Implement web version GPS workflow first.
2. Complete web testing and signoff (functional + regression).
3. Freeze shared contract and acceptance criteria.
4. Start mobile implementation only after web signoff is complete.

Mobile work in this plan is blocked until web-first signoff checklist is marked complete.

---

## Current State (As-Is)

### Mobile currently available
- AutoDoc list screen: mobile/src/app/(tabs)/autodoc.tsx
- Job card detail screen with status actions: mobile/src/app/job-cards/[id].tsx

### Gaps
- No mobile stage-wise damage photo workflow parity.
- No mandatory GPS capture in current mobile photo pipeline.
- API insert currently does not pass gps_lat, gps_lng, gps_city, captured_at in createPanelPhoto payload.
- No mobile UI for panel-wise pre/under/post repair photo mandates.

### Backend readiness already present
- panel_photos schema already has gps_lat, gps_lng, gps_city, captured_at.
- repair_stage already supported.

---

## Scope

### In Scope
- Mobile AutoDoc parity for panel and stage photo workflow.
- Mandatory location permission and live location collection at upload-time.
- GPS card overlay burned into image before final upload.
- Persist matching GPS metadata in panel_photos.
- Replace/remove flows must preserve the same enforcement.
- QA matrix for permission denied, low accuracy, offline, timeout, retry.

### Out of Scope
- Changing web AutoDoc upload UX.
- Database schema changes (not required for this objective).
- Historical unstamped photo backfill.

### Cross-Plan Dependencies
- Depends on MOBILE-002 route-validation baseline being stable.
- Depends on existing mobile auth/session guards already completed in MOBILE-002.
- Assumes mobile API layer remains compatible with shared web/mobile contracts from MOBILE-001.
- Depends on web GPS stamping implementation and QA signoff being completed first.

---

## Program Gating (Copied from MOBILE-002 Context)

This plan should not be shipped directly to production without passing the following project-level gates.

### Pre-Execution Requirements
- [ ] Expo account and EAS credentials available to implementation owner.
- [ ] Node.js >= 20.19.0 and npm >= 10.x available locally.
- [ ] Mobile environment variables validated for Supabase URL and anon key.

### Native Readiness Gate (Before APK/IPA Build)
- [ ] Camera capability available in current binary.
- [ ] Media library capability available in current binary.
- [ ] Location capability available in current binary.
- [ ] app.json permission strings are present for camera/photos/location.
- [ ] Expo plugin entries remain valid for expo-camera, expo-image-picker, expo-location.

### Build Gate Commands (Run in Order)

```bash
cd mobile
npx expo config --type public
npx tsc --noEmit -p tsconfig.json
npx expo-doctor
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

### OTA vs Rebuild Rulebook
- OTA-safe: JS/TS logic updates, UI changes, workflow validation updates.
- Rebuild required: adding/changing native dependency or plugin, native permission changes, app.json native config changes.
- If this plan introduces any new native dependency for stamping or media processing, do one fresh APK build before relying on OTA updates.

### Web-First Gate (Must Pass Before Mobile Start)

- [ ] Web image upload path stamps GPS card before upload.
- [ ] Web non-image upload path stores GPS metadata in DB/audit fields.
- [ ] Web API payload for GPS metadata is finalized and backward-compatible.
- [ ] Web regression tests pass for upload, replace, remove flows.
- [ ] Product + QA sign off web behavior as parity source of truth.

---

## Target User Flow (To-Be)

1. User opens Mobile AutoDoc job card.
2. User selects panel and stage (pre-repair / under-repair / post-repair).
3. User taps Capture Photo (camera-first flow).
4. App requests location permission and fetches live GPS.
5. App generates stamped image with bottom info card:
   - City/address line
   - Latitude/Longitude
   - Local date-time and timezone
   - Stage + panel label
6. App uploads stamped file to storage.
7. App creates panel_photo row with same GPS fields.
8. UI shows success only after both storage upload and DB insert pass.

Failure behaviors:
- Permission denied: block upload with clear remediation steps.
- GPS timeout: allow retry; do not upload unstamped file.
- Reverse geocode failure: continue with lat/lng + time, set city as null or fallback text.

---

## Technical Design

### Architecture Notes from MOBILE-001

- Monorepo pattern stays unchanged: mobile app under mobile, shared business logic under src/lib.
- Prefer shared API modules for data write/read contracts; avoid duplicating domain logic in screen components.
- Keep mobile-only concerns in mobile/src/hooks and mobile/src/components.
- Preserve typed contract boundaries using existing database-generated types and API result wrappers.

### Shared-Code Strategy for This Plan

- API contract changes should be backward-compatible (optional new fields at input boundary where possible).
- Mobile workflow orchestration should be centralized in a dedicated hook/service to prevent alternate unstamped upload paths.
- If code is shared between web and mobile, verify no web regression in panel photo create/list flows.

## 1) Mobile Screen Parity Workstream

Create/extend mobile AutoDoc modules:
- Screen A: Job card detail with panel selection and stage sections.
- Screen B: Stage-wise photo grid per selected panel (pre/under/post).
- Screen C: Capture and review step before upload.
- Screen D: Replace/remove actions for existing stage photos.

Suggested file additions:
- mobile/src/app/job-cards/[id]/photos.tsx
- mobile/src/components/autodoc/StagePhotoSection.tsx
- mobile/src/components/autodoc/PanelSelector.tsx
- mobile/src/components/autodoc/DamagePhotoGrid.tsx
- mobile/src/hooks/useDamagePhotoUpload.ts

Suggested parity links to existing MOBILE-002 AutoDoc tasks:
- JobCardList / JobCardDetail should remain compatible with current route flow.
- New photo workflow should plug into existing job card detail route without breaking current status actions.

## 2) GPS Data Capture Workstream

Use expo-location for:
- Foreground permission request.
- Current position retrieval with high accuracy and timeout.
- Reverse geocode for city/address best-effort.

Recommended capture policy:
- maxAge: 10-20 seconds
- timeout: 12-15 seconds
- accuracy: high/best

Metadata object shape:
- lat: number
- lng: number
- city: string | null
- addressLine: string | null
- capturedAtIso: string
- timezone: string
- stage: pre-repair | under-repair | post-repair
- panelName: string

## 3) Image Stamping Workstream

Requirement: final uploaded artifact must already include visible GPS card.

Recommended implementation for Expo-managed app:
- Compose a hidden React Native view with:
  - original image
  - dark semi-transparent bottom card
  - text rows for location, coords, timestamp, stage/panel
- Capture composed view to file via react-native-view-shot.
- Upload captured stamped file only.

Dependency note:
- If react-native-view-shot is not already included, add it and treat as a native dependency change requiring fresh build validation.

Why this recommendation:
- Reliable visible watermark-like stamp.
- Works for camera and gallery sources.
- Avoids depending on EXIF retention across compress/share pipelines.

Stamping rules:
- Card position: bottom area, full width with safe margin.
- Ensure readability on bright images.
- Include lat/lng to 5-6 decimals.
- Include app/device local timezone.
- Include stage and panel for forensic context.

## 4) Upload and Persistence Workstream

Storage path pattern:
- dealerCode/jobCardId/panelId/{photoType}_{timestamp}_{rand}.jpg

Flow order:
1. Capture source image.
2. Fetch live location.
3. Generate stamped image file.
4. Upload stamped file to storage.
5. Insert panel_photos row with repair_stage + gps_* + captured_at.
6. Trigger existing offload flow (if configured in API).

Mandatory API update:
- Extend createPanelPhoto input and payload to include:
  - gpsLat
  - gpsLng
  - gpsCity
  - capturedAt

Primary files to update:
- mobile/src/lib/api/photos.ts
- src/lib/api/photos.ts (if shared path is used by mobile build/runtime)
- mobile/src/lib/api/types.ts (if needed for type aliases)

## 5) Enforcement and Guardrails

Client-side hard gate:
- Do not call storage upload if stamped file is not generated.
- Do not call createPanelPhoto if gpsLat/gpsLng missing.

Server-side recommended guard (optional but strongly advised):
- Add RPC or insert policy validation to reject panel_photos insert with null gps_lat/gps_lng for damage photo types.
- If policy tightening is deferred, enforce in app first and log violations.

---

## Data Contract Changes

No schema migration required (fields already exist).

Application contract change required:
- createPanelPhoto(input) must accept and persist:
  - gpsLat -> gps_lat
  - gpsLng -> gps_lng
  - gpsCity -> gps_city
  - capturedAt -> captured_at

Validation:
- gpsLat in [-90, 90]
- gpsLng in [-180, 180]
- capturedAt valid ISO timestamp

Compatibility requirement:
- Keep createPanelPhoto contract safe for existing non-mobile callers while mobile rollout is in progress.

---

## UX and Permission Rules

1. First-time location permission prompt before first stage-photo upload.
2. If denied, show blocking modal with:
   - Why location is mandatory.
   - Open settings action.
   - Retry action.
3. If location weak/timeout:
   - Show retry with spinner.
   - Keep image in local temp state, not uploaded.
4. Capture mode:
   - Camera-first for compliance.
   - Gallery optional by policy; if allowed, still apply live upload-time location stamp.

---

## Security and Compliance Notes

- Never log full precise address in verbose logs unless needed.
- Persist required GPS fields in DB for audit.
- Do not store raw unstamped artifact as final business record.
- If temporary unstamped local file exists during processing, delete after upload success/failure cleanup.

---

## Implementation Phases and Checklist

## Phase 0: Prep and Decisions (0.5 day)
- [ ] Confirm compliance policy: camera-only or camera+gallery.
- [ ] Confirm whether strict block is required when GPS unavailable.
- [ ] Confirm stamp text format and language.
- [ ] Add feature flag: MOBILE_AUTODOC_GPS_STAMP_REQUIRED.
- [ ] Define acceptance owner for this plan (Product + QA + Mobile Dev).

## Phase 1: Mobile AutoDoc UI Parity Skeleton (1-2 days)
- [ ] Add photo workflow route(s) under job card detail.
- [ ] Build panel selector and stage sections.
- [ ] Build stage-wise photo list grid with replace/remove actions.
- [ ] Wire loading/error/empty states for each stage.

Acceptance for Phase 1:
- [ ] Route entry from existing job-card detail is stable.
- [ ] No regression in current mobile job card list/detail/status flows.

## Phase 2: Location Service and Metadata (1 day)
- [ ] Implement location permission/request helper.
- [ ] Implement current location fetch with timeout + retry.
- [ ] Implement reverse geocode helper with graceful fallback.
- [ ] Define typed metadata object consumed by stamper and uploader.

Acceptance for Phase 2:
- [ ] Permission allow/deny paths fully handled.
- [ ] Timeout and retry behavior demonstrable on device.

## Phase 3: Stamping Engine (1-2 days)
- [ ] Add stamped image composer component.
- [ ] Capture composed image to temp file.
- [ ] Validate output quality and file size targets.
- [ ] Add cleanup for temp files.

Acceptance for Phase 3:
- [ ] Stamped artifact consistently shows required fields on real devices.
- [ ] Temp-file cleanup verified for success and failure paths.

## Phase 4: Upload + DB Persistence (1 day)
- [ ] Update createPanelPhoto signature to include gps fields.
- [ ] Pass repair_stage + gps fields + captured_at in insert payload.
- [ ] Ensure only stamped file is uploaded.
- [ ] Keep existing remove/replace behavior intact.

Acceptance for Phase 4:
- [ ] panel_photos insert persists repair_stage + gps metadata.
- [ ] No unstamped final artifact is reachable in normal workflow.

## Phase 5: Enforcement and Error Handling (0.5-1 day)
- [ ] Block upload if permission denied.
- [ ] Block upload if gps or stamp missing.
- [ ] Add retry flows for timeout/geocode failure.
- [ ] Add user-visible error copy for each failure reason.

Acceptance for Phase 5:
- [ ] Block behavior is deterministic for all mandatory-failure conditions.
- [ ] Error copy is actionable and consistent.

## Phase 6: QA and Rollout (1-2 days)
- [ ] Execute test matrix below on Android.
- [ ] Execute smoke test on iOS (if available).
- [ ] Run regression for existing status update and job card navigation.
- [ ] Enable feature flag for pilot users.
- [ ] Production rollout after pilot signoff.

Acceptance for Phase 6:
- [ ] tsc --noEmit passes in mobile project.
- [ ] Route and upload regression checks signed off.
- [ ] Pilot feedback has no P0/P1 blockers.

---

## Route Validation Addendum (MOBILE-002 Section 4.9 Alignment)

Add these checks to current route validation matrix before marking AutoDoc parity complete:

- [ ] /(tabs)/autodoc opens /job-cards/[id] for valid rows without navigation error.
- [ ] /job-cards/[id] opens stage-photo workflow route and returns reliably.
- [ ] Status update actions continue to persist after photo workflow integration.
- [ ] Back navigation from photo workflow does not lose unsaved state unexpectedly.
- [ ] Error/loading/empty states in photo workflow render without runtime crashes.

---

## QA Matrix (Mandatory)

Functional:
- [ ] Pre-repair upload stamps and persists GPS fields.
- [ ] Under-repair upload stamps and persists GPS fields.
- [ ] Post-repair upload stamps and persists GPS fields.
- [ ] Replace photo keeps same enforcement.
- [ ] Remove photo works without affecting other stages.

Permission/Location:
- [ ] Location allowed first attempt.
- [ ] Location denied then enabled from Settings.
- [ ] GPS timeout then retry success.
- [ ] Reverse geocode fail but upload with lat/lng still succeeds (if policy allows).

Data integrity:
- [ ] DB row has repair_stage, gps_lat, gps_lng, gps_city, captured_at.
- [ ] Uploaded file is stamped artifact.
- [ ] No final unstamped file remains in business-accessible storage path.

Performance:
- [ ] Time from capture to upload completion under acceptable target on 4G.
- [ ] Image quality acceptable for claims review.
- [ ] App memory remains stable for repeated captures.

Engineering quality gates:
- [ ] npx tsc --noEmit -p tsconfig.json passes.
- [ ] npx expo-doctor passes without new critical issues.
- [ ] No new lint/type errors introduced in changed modules.

---

## Suggested File-Level Task Map

Core parity and screens:
- mobile/src/app/(tabs)/autodoc.tsx
- mobile/src/app/job-cards/[id].tsx
- mobile/src/app/job-cards/[id]/photos.tsx (new)
- mobile/src/components/autodoc/* (new)

Hooks/services:
- mobile/src/hooks/useDamagePhotoUpload.ts (new)
- mobile/src/utils/location/* (new)
- mobile/src/utils/photoStamp/* (new)

API layer:
- mobile/src/lib/api/photos.ts
- src/lib/api/photos.ts
- mobile/src/lib/api/types.ts (if needed)
- src/lib/api/types.ts (if needed)

---

## Operational Telemetry (Recommended)

Track counters/events:
- photo_upload_attempt
- gps_permission_denied
- gps_fetch_timeout
- stamp_generation_failed
- stamped_upload_success
- db_insert_failed_after_upload

Recommended metadata:
- job_card_id
- panel_id
- repair_stage
- duration_ms
- error_code

---

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Location permission denial blocks users | Medium | High | Clear UX copy, settings deep-link, supervisor SOP |
| Stamp generation quality/performance issues | Medium | Medium | Test on low-end Android, compress targets, retry path |
| Shared API change impacts web behavior | Low | Medium | Keep backward-compatible optional fields; add tests |
| Reverse geocode instability | Medium | Low | Treat city as best-effort; lat/lng remains mandatory |
| Upload retries create duplicates | Medium | Medium | Use idempotency key or client-side upload lock per panel/stage |

---

## Definition of Done

- [ ] Mobile AutoDoc supports stage-wise panel photo workflow with practical parity.
- [ ] Every uploaded damage photo is visibly GPS-stamped.
- [ ] panel_photos rows persist gps_lat/gps_lng/gps_city/captured_at correctly.
- [ ] Upload is blocked when mandatory GPS requirements are not met.
- [ ] QA matrix completed and signed off.
- [ ] Pilot rollout completed without blocker issues.

---

## Day-by-Day Execution Suggestion

Day 1:
- Phase 0 + Phase 1 skeleton and navigation wiring.

Day 2:
- Complete Phase 1 UI interactions and state management.

Day 3:
- Phase 2 location service + permission UX.

Day 4:
- Phase 3 stamping engine integration.

Day 5:
- Phase 4 API contract update + end-to-end upload flow.

Day 6:
- Phase 5 hardening + error/retry handling.

Day 7:
- Phase 6 QA matrix + pilot readiness.

Day 8 (buffer, if needed):
- Native rebuild verification and release checklist completion.

---

## Activity Tracker

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase W - Web-First Baseline (Mandatory Before Mobile)

```
⏳ W.1 | Finalize web image stamping behavior | Web Dev | - | - | Browser geolocation + canvas stamped blob
⏳ W.2 | Finalize web non-image GPS metadata behavior | Web Dev | - | - | PDF/Excel/ZIP metadata-only path
⏳ W.3 | Freeze shared API contract for gps fields | Web Dev + Mobile Dev | - | - | Backward-compatible contract
⏳ W.4 | Complete web regression and QA signoff | QA + Product | - | - | Upload/replace/remove validated
⏳ W.5 | Approve mobile start gate | Product + QA + Eng Lead | - | - | Required before Phase 0 starts
```

### Phase 0 - Prep and Decisions

```
⏳ 0.1 | Confirm camera-only vs camera+gallery policy | Product + Ops | - | - | Starts only after Phase W.5
⏳ 0.2 | Confirm strict GPS block behavior | Product + Ops | - | - | Denied/timeout policy
⏳ 0.3 | Finalize stamp text format and language | Product + UX | - | - | Include stage/panel/timestamp standards
⏳ 0.4 | Add MOBILE_AUTODOC_GPS_STAMP_REQUIRED flag | Mobile Dev | - | - | Default off for pilot rollout
⏳ 0.5 | Assign acceptance owners | Product + QA + Mobile Dev | - | - | Required before implementation start
```

### Phase 1 - UI Parity Skeleton

```
⏳ 1.1 | Add job-card photo workflow route | Mobile Dev | - | - | Entry from existing detail screen
⏳ 1.2 | Build panel selector + stage sections | Mobile Dev | - | - | Pre/under/post sections
⏳ 1.3 | Build stage-wise photo grid and actions | Mobile Dev | - | - | Replace/remove included
⏳ 1.4 | Implement loading/error/empty states | Mobile Dev | - | - | All stage views covered
⏳ 1.5 | Validate no regression in status actions | QA + Mobile Dev | - | - | Existing flow intact
```

### Phase 2 - Location Metadata

```
⏳ 2.1 | Implement permission helper | Mobile Dev | - | - | Foreground permission flow
⏳ 2.2 | Implement GPS fetch with retry/timeout | Mobile Dev | - | - | Device validation required
⏳ 2.3 | Implement reverse geocode fallback path | Mobile Dev | - | - | City nullable allowed
⏳ 2.4 | Standardize metadata object contract | Mobile Dev | - | - | Shared across stamp/upload
```

### Phase 3 - Stamping Engine

```
⏳ 3.1 | Build stamped image composer | Mobile Dev | - | - | Bottom card readability focus
⏳ 3.2 | Capture composed image to temp file | Mobile Dev | - | - | Deterministic output required
⏳ 3.3 | Validate output quality and size | QA + Mobile Dev | - | - | Claims readability baseline
⏳ 3.4 | Add temp cleanup for all outcomes | Mobile Dev | - | - | Success/failure cleanup
```

### Phase 4 - Upload and DB Persistence

```
⏳ 4.1 | Extend createPanelPhoto input for gps fields | Mobile Dev | - | - | Backward compatible change
⏳ 4.2 | Persist repair_stage + gps + captured_at | Mobile Dev | - | - | Validate with DB reads
⏳ 4.3 | Ensure only stamped file uploads | Mobile Dev | - | - | No unstamped final artifact
⏳ 4.4 | Keep replace/remove behavior stable | Mobile Dev + QA | - | - | Stage integrity checks
```

### Phase 5 - Enforcement and Hardening

```
⏳ 5.1 | Block upload on permission denial | Mobile Dev | - | - | Actionable UX copy
⏳ 5.2 | Block upload on missing gps/stamp | Mobile Dev | - | - | Hard gate before upload
⏳ 5.3 | Add retry/error UX states | Mobile Dev + UX | - | - | Timeout/geocode failures
⏳ 5.4 | Add telemetry for failure/success events | Mobile Dev | - | - | Operational diagnostics
```

### Phase 6 - QA and Rollout

```
⏳ 6.1 | Run Android QA matrix end-to-end | QA | - | - | Mandatory execution gate
⏳ 6.2 | Run iOS smoke checks | QA | - | - | If iOS test setup available
⏳ 6.3 | Verify typecheck and expo-doctor gates | Mobile Dev | - | - | Release readiness
⏳ 6.4 | Enable pilot rollout via feature flag | Product + Ops | - | - | Controlled user group
⏳ 6.5 | Complete production sign-off | Product + QA + Ops | - | - | No P0/P1 blockers
```

### Phase 7 - Web and Mobile Parity Audit

```
⏳ 7.1 | Verify mobile matches signed-off web behavior | QA + Product | - | - | Web remains source of truth
⏳ 7.2 | Run cross-platform parity checklist | QA | - | - | Web/mobile outputs and metadata match
⏳ 7.3 | Publish final parity signoff | Product + QA + Eng Lead | - | - | Completion gate for rollout closure
```

---

## Web Version Baseline (Must Be Completed First)

This is a mandatory precondition for mobile execution in this plan.

Caveat and policy baseline:

- Image files: feasible and straightforward for web. Use browser geolocation + canvas stamp + upload stamped blob + save GPS fields.
- Any uploaded file type: not always feasible in the same way. Non-image files (PDF/Excel/ZIP) cannot get an in-image GPS card; for those, store GPS metadata in DB/audit fields instead.

Web implementation recommendation:
- Treat image and non-image flows as separate execution paths.
- Enforce mandatory GPS metadata for both paths.
- Enforce mandatory visible GPS card only for image paths.

Suggested web target areas:
- src/pages/AutoDocPage.tsx
- src/pages/JobCardPage.tsx
- src/lib/api/photos.ts

Web-first completion checklist:
- [ ] Image uploads are stamped before storage upload.
- [ ] Non-image uploads save GPS metadata without attempting visual stamp.
- [ ] No regression in existing upload/replace/remove UX.
- [ ] DB/audit fields are populated per policy.
- [ ] Product + QA web signoff is recorded before mobile Phase 0 starts.

---

## Implementation Notes for the Team

- Keep the enforcement logic centralized in one upload orchestration hook to avoid bypass paths.
- Ensure replace and bulk upload paths both call the same stamped upload function.
- Preserve existing storage path conventions and existing Drive offload trigger path.
- Keep app behavior deterministic: either fully stamped-and-saved, or fail with no partial success state.

---

## Related Docs

- docs/Implementation_plans/MOBILE-002_EXECUTION_CHECKLIST.md
- docs/Implementation_plans/MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md
- docs/Implementation_plans/MOBILE-003_ARCHITECTURE.md
- docs/Implementation_plans/MOBILE-004_FEATURE_MAPPING.md
- docs/Implementation_plans/AUTODOC_EXECUTION_STATUS_2026-05-22.md

---

**Last Updated:** 2026-05-28 by GitHub Copilot  
**Status:** PENDING
