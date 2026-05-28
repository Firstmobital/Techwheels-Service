# Techwheels Mobile - Detailed Execution Checklist

**Status**: Phase 4/5 In Progress  
**Target**: 7-10 days for full implementation  
**Platform**: Expo (iOS + Android)

---

## Current Sprint Execution Board (Run This In Order)

### Sequence Tracker

- [x] 1) Stabilize offline/logger/background-sync TypeScript issues
- [ ] 2) Complete Phase 4 route validation matrix (Section 4.9)
- [ ] 3) Build Import file picker + CSV + conflict-resolution flow
- [ ] 4) Extend AutoDoc workflows (panels/photos/documents/estimates)
- [ ] 5) Wire Reports live queries/charts/exports

### Acceptance Rules (Before Moving To Next Item)

- [x] Item 1 acceptance: `tsc --noEmit` passes in mobile project
- [ ] Item 2 acceptance: all 10 checks in Section 4.9 marked pass/fail with notes
- [x] Item 3 acceptance: import file flow processes CSV with duplicate/conflict handling
- [ ] Item 4 acceptance: AutoDoc supports panel/photo/document/estimate user flow
- [ ] Item 5 acceptance: reports tab pulls live data and supports chart + export actions

### Pre-Mobile Parity Baseline Update (2026-05-28)

- [x] Web AutoDoc baseline validated on production web: `https://techwheels-service.vercel.app/autodoc`
- [x] `car_image` upload path verified end-to-end on web after backend function rollout
- [x] Supabase functions deployed to project `jmdndcphkmaljhwgzqxq`:
   - [x] `universal-drive-upload`
   - [x] `document-link-upsert`
- [x] Known stale-backend signature documented: `file_type must be a valid document type`

### Mobile vs Web AutoDoc Parity Audit (2026-05-28)

Authority used for audit:
- Web parity source: `https://techwheels-service.vercel.app/autodoc`
- DB source of truth: `local_folder/backups/full_database.sql` (authority never downgrades)

Root-cause findings for parity gap:
- [x] Mobile AutoDoc tab was using a simplified list/status flow, while web derives workflow stages from `job_cards + panels + panel_photos + estimate_rows`.
- [x] Mobile capture screen had placeholder upload behavior (no real Storage + DB persistence).
- [x] Mobile panel photo remove/replace flow was incomplete (remove TODO and stale screen state after return).
- [x] Mobile panel selector did not surface panel-wise photo counts.
- [x] DB truth confirms `panel_photos.repair_stage` supports `pre-repair`, `under-repair`, `post-repair`; mismatch was frontend implementation, not schema.

Code fixes executed in this cycle:
- [x] AutoDoc workflow-stage parity logic added to mobile list screen (same derivation model as web dashboard cards).
- [x] Mobile AutoDoc tab now has stage filters, KPI strip, and stage-aware quick actions.
- [x] Camera/gallery capture now performs real upload to Supabase Storage + `panel_photos` insert with GPS metadata.
- [x] Replace/remove photo actions implemented in panel photo screen, with reload on screen focus.
- [x] Panel selector now computes and shows per-panel photo counts.

Remaining parity backlog (must complete for full closure):
- [x] Mobile New Job Card full creation/edit workflow (create route + edit route + navigation wiring completed).
- [x] Mobile estimate editor parity with web validation rules (`action/defect/part_number` completeness and per-panel readiness UI).
- [ ] Mobile document workflow parity (`service_history`, `walkaround`, `car_image`, `delivery`, `ppt_pre`, `ppt_post`, `excel_estimate`, claim-email flow).
- [ ] Mobile workflow actions parity (`Compose and Send`, `Submit Claim`, and document readiness gating).
- [ ] Full Section 4.9 route matrix re-run after parity merge and record pass/fail evidence.

Execution order for docs (start here and proceed):
- [x] 1) `docs/Implementation_plans/MOBILE-002_EXECUTION_CHECKLIST.md` (daily command sheet and acceptance gates)
- [ ] 2) `docs/Implementation_plans/MOBILE-005_AUTODOC_GPS_STAMP_PARITY_PLAN.md` (AutoDoc deep parity execution)
- [ ] 3) `docs/Implementation_plans/DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md` (Drive/link-offload edge behavior validation)
### Backend Function Deployment Gate (Before Mobile QA)

Run when AutoDoc upload contracts, file type validation, or Drive offload behavior changes.

```bash
supabase functions deploy universal-drive-upload --project-ref jmdndcphkmaljhwgzqxq
supabase functions deploy document-link-upsert --project-ref jmdndcphkmaljhwgzqxq
```

Pass criteria:
- Target function code includes `car_image` in allowed document types.
- Mobile/web frontend QA starts only after successful function deploy.

---

## Pre-Execution Requirements

- [ ] **Expo Account Created**: https://expo.dev/signup
- [ ] **Expo CLI Installed**: `npm install -g eas-cli expo-cli`
- [ ] **Expo Credentials Collected**:
  - [ ] Expo username
  - [ ] Expo password / API token
  - [ ] Google Cloud project (for Android)
  - [ ] Apple Developer account (for iOS) — optional for initial APK
- [ ] **New Expo Project Slug**: `techwheels-service`
- [ ] **Node.js 20.19.0+** installed locally

---

## Pre-APK/IPA Native Readiness Gate (Mandatory)

Use this section right before running any Android APK or iOS IPA build. The goal is to include all planned native capabilities in the binary once, so future functional changes can go through OTA updates.

### A) Future-Safe Native Modules Included In Base Binary

- [x] Camera capability included
- [x] Media/photo library capability included
- [x] Location (foreground + background) capability included
- [x] Notifications capability included
- [x] Biometric capability included
- [x] Document picker capability included
- [x] Background fetch/task-manager capability included

### B) app.json Native Hardening Verification

- [x] iOS permission strings configured for camera/photos/location/Face ID
- [x] Android permissions explicitly configured for camera/media/location/notifications/biometric
- [x] Expo plugins configured for `expo-camera`, `expo-image-picker`, `expo-location`, `expo-notifications`, `expo-local-authentication`, `expo-document-picker`
- [x] iOS bundle identifier set
- [x] Android package name set

### C) Push Notification Native Prerequisites (Before First Build With Push)

- [ ] `mobile/google-services.json` present and valid
- [ ] `mobile/GoogleService-Info.plist` present and valid (if iOS push is enabled)
- [ ] `npx expo config --type public` shows expected push-related native config

### D) Build Gate Commands (Run In Order)

```bash
cd mobile
npx expo config --type public
npx tsc --noEmit -p tsconfig.json
npx expo-doctor
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

### E) OTA vs Rebuild Rulebook

- OTA-safe changes (no rebuild): JS/TS logic, UI, routing, business rules, API calls, report templates, validation rules.
- Rebuild required: adding new native library, changing native permissions, changing config plugins, changing bundle/package identifier, changing notification native setup/certificates.
- Rule: if `app.json` native sections or native dependency set changes, do at least one fresh APK/IPA build before relying on OTA updates.
- Important: Supabase Edge Function changes always require explicit function deployment; OTA updates do not deploy backend code.

---

## Current Execution Snapshot (2026-05-27)

- [x] AutoDoc mobile stage derivation aligned with web workflow model for dashboard filtering/KPIs
- [x] AutoDoc mobile capture flow writes real photo uploads to Storage + `panel_photos` with GPS fields
- [x] AutoDoc mobile panel photo replace/remove flow and focus-refresh behavior wired
- [x] AutoDoc mobile New Job Card create/edit flow implemented and linked from tab/detail
- [x] AutoDoc mobile estimate editor implemented with panel readiness and row-level validation parity
- [x] Expo mobile app initialized and running via Expo Router
- [x] Supabase auth wired (sign in/up/reset, session restore, sign out)
- [x] Auth route guards active for `(auth)` and `(tabs)` groups
- [x] NativeWind/Metro/Babel pipeline stabilized for current build
- [x] Expo iOS bundle currently compiling successfully in active session
- [x] Import tab switched from stub to live `listJobCardSummaries` data
- [x] AutoDoc live list + job-card detail route + status action connected
- [x] Offline/logger/background-sync TypeScript compilation blockers fixed
- [x] Import CSV/XLSX slot picker parity model implemented (branch slots per source table)
- [x] Import mapper + upload pipeline wired for core tables (PSF/Invoice/VAS)
- [x] Import duplicate/conflict handling + remaining parts tables (Increment 3)
- [ ] AutoDoc panel/photo/document/estimate workflows
- [ ] Reports live data, charts, and export implementation
- [ ] Offline stack runtime validation in Expo Go (post-compilation)

### Upload Verification Matrix (Mandatory for AutoDoc Parity)

- [ ] Panel photo upload: DB row created
- [ ] Panel photo upload: Drive fields populated (`drive_url`, `drive_file_id`)
- [ ] Panel photo upload: file appears in registration Drive folder
- [ ] Panel photo upload: source object removed from Supabase bucket (when delete flag enabled)
- [ ] Car image upload: DB row created (`doc_type=car_image`)
- [ ] Car image upload: Drive fields populated (`drive_url`, `drive_file_id`)
- [ ] Car image upload: file appears in registration Drive folder
- [ ] Car image upload: source object removed from Supabase bucket (when delete flag enabled)
- [ ] Failure mode: explicit user toast appears when Drive sync fails

---

## PHASE 1: Project Initialization (Checklist)

### 1.1 Create Directory Structure
```
[ ] mkdir mobile
[ ] cd mobile
[ ] npx create-expo-app@latest techwheels-service
```

### 1.2 Install Core Dependencies (Web + Mobile Essentials)
```
[ ] npm install @supabase/supabase-js@^2.103.3
[ ] npm install exceljs@^4.4.0 papaparse@^5.5.3 pptxgenjs@^4.0.1
[ ] npm install react@^19.2.5 react-dom@^19.2.5 react-native@0.81.5
[ ] npm install recharts@^3.8.1 xlsx@^0.18.5
[ ] npm install react-native-gesture-handler@2.28.0 react-native-reanimated@4.1.6
[ ] npm install react-native-safe-area-context@5.6.2 react-native-screens@4.16.0
```

### 1.3 Install Mobile-Specific Dependencies (UI/Storage/Auth)
```
[ ] npm install expo@~54.0.33 expo-router@~6.0.23
[ ] npm install expo-camera@~17.0.10 expo-image-picker@~17.0.10 expo-document-picker@14.0.8
[ ] npm install expo-sharing@~14.0.7 expo-print@~15.0.7
[ ] npm install expo-local-authentication@~17.0.8 expo-location@~19.0.8
[ ] npm install expo-notifications@~0.32.16 expo-background-fetch@~14.0.9
[ ] npm install expo-file-system@19.0.21 expo-constants@18.0.13 expo-device@~8.0.10
[ ] npm install @react-native-async-storage/async-storage@2.2.0
[ ] npm install @react-native-picker/picker@^2.11.1 @react-native-community/datetimepicker@8.4.4
[ ] npm install nativewind@^4.x tailwindcss@^4.1.13
[ ] npm install zustand@^5.0.8 dotenv@^17.3.1 patch-package@^8.0.1
[ ] npm install --save-dev typescript@~5.9.2 @types/react@~19.1.10 @types/react-native@^0.81.0
```

### 1.4 Install Utilities & Document Generation (Export/PDF/QR)
```
[ ] npm install jspdf@^2.5.1 jspdf-autotable@^3.8.2 html2canvas@^1.4.1
[ ] npm install qrcode@^1.5.4 classnames@^2.5.1
[ ] npm install date-fns@^4.1.0 zod@^3.23.8
[ ] npm install csv-parse@^6.1.0 iconv-lite@^0.7.0
[ ] npm install lucide-react@^0.544.0
[ ] npm install --save-dev @babel/core@^7.26.0 babel-plugin-module-resolver@^5.0.2
[ ] npm install --save-dev babel-plugin-transform-import-meta@^2.3.3 eslint@^8.57.0
```

### 1.5 Comprehensive Dependency List (FULL INSTALL)
**Alternative: Install ALL at once** (copy-paste the complete package.json from MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md Phase 1.3 and run):
```
[ ] npm install
```

**Verification**:
```
[ ] node_modules contains 500+ packages (from reference project pattern)
[ ] package-lock.json created
[ ] Zero critical peer dependency errors
[ ] ALL web + mobile dependencies bundled in APK
```

**Result**: ✅ ALL dependencies pre-bundled in APK (~150 MB compressed)
- No npm downloads on device
- OTA updates only push app code (~50-200 KB)
- First install is complete and self-contained

### 1.4 Initialize TypeScript
```
[ ] npx tsc --init
[ ] Create tsconfig.json with React Native targets
[ ] Create expo-env.d.ts for type safety
```

### 1.5 Configure Dynamic Environment & Tailwind
```
[ ] Create app.config.js (from reference project pattern)
[ ] Configure with EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
[ ] npx tailwindcss init
[ ] Configure tailwind.config.ts for mobile
[ ] Create babel.config.js with NativeWind plugin
[ ] Create metro.config.js for optimization
```

### 1.6 Create .env.local
```
[ ] EXPO_PUBLIC_SUPABASE_URL=<your_url>
[ ] EXPO_PUBLIC_SUPABASE_ANON_KEY=<your_key>
```

### 1.7 Initialize Expo Project
```
[ ] eas init --id techwheels-service
[ ] Create eas.json with build profiles
[ ] Configure app.json with splash screen, icon, version
```

### 1.8 Verify Build
```
[ ] npm run build  (if applicable)
[ ] expo start --clear
[ ] Scan QR code with Expo Go on Android/iOS
```

**Phase 1 Deliverable**: ✅ Expo project running locally

---

## PHASE 2: Shared Code Layer (Checklist)

### 2.1 Create Project Structure
```
[ ] mkdir -p mobile/{lib,store,hooks,utils,context,components}
[ ] mkdir -p mobile/lib/api  (for symlinks)
```

### 2.2 Create Symlinks (macOS/Linux)
```
[ ] cd mobile/lib
[ ] ln -s ../../src/lib/api ./api
[ ] ln -s ../../src/lib/supabase.ts ./supabase.ts.web
[ ] ln -s ../../src/lib/openJobCardsColumnMapper.ts .
[ ] ln -s ../../src/lib/cancelJobCardColumnMapper.ts .
[ ] ln -s ../../src/lib/closedButNotInvoicedColumnMapper.ts .
[ ] ln -s ../../src/lib/invoiceColumnMapper.ts .
[ ] ln -s ../../src/lib/partsConsumptionColumnMapper.ts .
[ ] ln -s ../../src/lib/partsOrderColumnMapper.ts .
[ ] ln -s ../../src/lib/partsStockColumnMapper.ts .
[ ] ln -s ../../src/lib/vasColumnMapper.ts .
[ ] ln -s ../../src/lib/reportQueries.ts .
[ ] ln -s ../../src/lib/partsReportQueries.ts .
[ ] ln -s ../../src/lib/database.types.ts .
[ ] ln -s ../../src/lib/columnMatcher.ts .
[ ] ln -s ../../src/lib/employeeMatcher.ts .
[ ] ln -s ../../src/lib/branches.ts .
[ ] ln -s ../../src/lib/getTableColumns.ts .
```

### 2.2 Create Mobile Supabase Client
```
[ ] Create mobile/lib/supabase.ts (AsyncStorage-based)
[ ] Create mobile/lib/autodocStorage.ts (AsyncStorage wrapper)
[ ] Export both from mobile/lib/index.ts
```

### 2.3 Create Zustand State Stores (Reference Project Pattern)
```
[ ] Create mobile/store/jobCardStore.ts  (with persist middleware)
[ ] Create mobile/store/authStore.ts  (session state)
[ ] Create mobile/store/index.ts (export all stores)
```

### 2.4 Create Shared Contexts
```
[ ] Copy src/context/DirtyContext.tsx → mobile/context/
[ ] Create mobile/context/AuthContext.tsx
[ ] Create mobile/context/PermissionContext.tsx  (from RBAC in ref project)
[ ] Create mobile/context/index.ts (export all contexts)
```

### 2.5 Create Custom Hooks
```
[ ] Create mobile/hooks/useCamera.ts
[ ] Create mobile/hooks/useMediaLibrary.ts
[ ] Create mobile/hooks/useDocumentPicker.ts
[ ] Create mobile/hooks/useReportData.ts (adapted from web)
[ ] Create mobile/hooks/useOnline.ts (adapted from web)
[ ] Create mobile/hooks/useLastUpdated.ts (adapted from web)
[ ] Create mobile/hooks/index.ts (export all hooks)
```

### 2.6 Create Utils Layer (Reference Project Pattern)
```
[ ] Create mobile/lib/utils/ folder
[ ] Copy web utils: insuranceCalculations.ts, pricingHelpers.ts, etc.
[ ] Create mobile-specific: uploadToGoogleDrive.ts (Edge Function integration)
[ ] Create mobile/lib/index.ts (export all utilities)
```

### 2.7 Verify Imports Work
```
[ ] Create test component importing from mobile/lib/api
[ ] Verify column mappers import correctly
[ ] Verify database types resolve
```

**Phase 2 Deliverable**: ✅ Shared code layer accessible, no duplication

---

## PHASE 3: Authentication (Checklist)

### 3.1 Create Auth Screens Folder Structure
```
[ ] mkdir -p mobile/app/(auth)
[ ] Create mobile/app/(auth)/_layout.tsx
[ ] Create mobile/app/(auth)/login.tsx
[ ] Create mobile/app/(auth)/signup.tsx
[ ] Create mobile/app/(auth)/password-reset.tsx
```

### 3.2 Implement Root Layout
```
[ ] Create mobile/app/_layout.tsx
[ ] Configure Stack navigation for (auth) and (tabs)
[ ] Set up AuthProvider as root wrapper
```

### 3.3 Implement Login Screen
```
[ ] Create form UI (email, password inputs)
[ ] Implement Supabase.auth.signInWithPassword()
[ ] Handle loading state
[ ] Navigate to (tabs) on success
[ ] Show error alert on failure
[ ] Add "Sign Up" link
```

### 3.4 Implement Sign Up Screen
```
[ ] Create form UI (email, password, confirm password)
[ ] Implement Supabase.auth.signUp()
[ ] Handle email verification flow
[ ] Navigate to login or dashboard on success
[ ] Show error messages
```

### 3.5 Implement Password Reset
```
[ ] Create form UI (email input)
[ ] Implement Supabase.auth.resetPasswordForEmail()
[ ] Show success message
[ ] Link back to login
```

### 3.6 Implement Auth Callback (if needed)
```
[ ] Create mobile/app/(auth)/callback.tsx
[ ] Handle deep links for password reset emails
```

### 3.7 Test Auth Flow
```
[x] Test signup with valid email
[x] Test login with correct credentials
[ ] Test login with wrong credentials
[x] Test password reset flow
[ ] Verify token refresh on session expiry
[x] Clear auth state on logout
```

**Phase 3 Deliverable**: ✅ Full auth flow end-to-end

---

## PHASE 4: Main Navigation (Checklist)

### 4.1 Create Tabs Layout
```
[x] Create mobile/app/(tabs)/_layout.tsx
[x] Configure BottomTabNavigator
[x] Add 5 tabs: Import, Reports, AutoDoc, Settings, Admin
[x] Style tab icons and labels
[x] Add active/inactive color theming
```

### 4.2 Create Tab Screens Structure
```
[ ] mkdir -p mobile/app/(tabs)/import
[ ] mkdir -p mobile/app/(tabs)/reports
[ ] mkdir -p mobile/app/(tabs)/autodoc
[ ] mkdir -p mobile/app/(tabs)/settings
[ ] mkdir -p mobile/app/(tabs)/admin
```

### 4.3 Create Import Tab
```
[x] Create mobile/app/(tabs)/import.tsx
[ ] Display import type selector (job cards, invoices, parts)
[ ] Implement file picker
[ ] Show upload progress
[ ] Handle duplicate detection
[x] Show success/error/loading states
```

### 4.4 Create Reports Tab
```
[x] Create mobile/app/(tabs)/reports.tsx
[x] Display report categories
[ ] Implement report drill-down navigation
[ ] Create report detail screens
[ ] Integrate Victory Native charts
```

### 4.5 Create AutoDoc Tab
```
[x] Create mobile/app/(tabs)/autodoc.tsx
[x] Display live job card list
[x] Implement search/filter UI
[x] Add "New Job Card" button
[x] Navigate to job card detail on tap
```

### 4.6 Create Settings Tab
```
[x] Create mobile/app/(tabs)/settings.tsx
[ ] Display employee list
[ ] Add search functionality
[x] Show user profile section
[x] Add logout button
```

### 4.7 Create Admin Tab
```
[x] Create mobile/app/(tabs)/admin.tsx
[x] Check admin permissions
[x] Display admin dashboard
[ ] Add user management link
[ ] Add module permissions link
```

### 4.8 Test Navigation
```
[x] Test tab switching
[ ] Test nested navigation (reports → detail)
[x] Test back navigation
[x] Verify permissions gating (Admin tab only for admins)
```

### 4.9 Phase 4 Route Validation Matrix (Current Sprint)
```
[ ] /(auth)/login loads with correct styling and no overlap on notch/status bar
[ ] /(auth)/signup navigates and returns to login correctly
[ ] /(auth)/password-reset submits and shows success/error handling
[ ] Session restore: app relaunch lands in /(tabs)/import when authenticated
[ ] Logout from /(tabs)/settings returns to /(auth)/login and blocks tabs
[ ] /(tabs)/import shows loading, error, empty, and populated states correctly
[ ] /(tabs)/autodoc opens /job-cards/[id] reliably for valid job_card_id rows
[ ] /job-cards/[id] status update persists and list reflects updated status on return
[ ] /(tabs)/reports renders scaffold without runtime errors
[ ] /(tabs)/admin access denied state appears for non-admin users
```

**Phase 4 Deliverable**: ✅ Main navigation + 5 core screens working

---

## PHASE 5: Feature Implementation (Checklist)

### 5.1 Import Feature
```
[x] Create mobile import card/slot workflow in tab screen
[x] Implement CSV/XLSX parsing and row readiness counts
[x] Apply shared mappers for core tables (job_card_closed_data, service_invoice_data, service_vas_jc_data)
[ ] Implement duplicate detection
[ ] Create conflict resolution UI
[ ] Test end-to-end import flow
```

### 5.2 Reports Feature
```
[ ] Create mobile/components/reports/ReportCard.tsx
[ ] Create mobile/components/reports/ChartComponent.tsx (Victory Native)
[ ] Implement report query execution
[ ] Create filter UI (date range, branch, etc.)
[ ] Implement PDF export
[ ] Create report detail screens for each category
[ ] Test chart rendering and export
```

### 5.3 AutoDoc Feature
```
[ ] Create mobile/components/autodoc/JobCardList.tsx
[ ] Create mobile/components/autodoc/JobCardDetail.tsx
[ ] Create mobile/components/autodoc/PanelCarousel.tsx (swipeable)
[ ] Create mobile/components/autodoc/PhotoUpload.tsx (camera + gallery)
[ ] Create mobile/components/autodoc/DocumentUpload.tsx
[ ] Create mobile/components/autodoc/EstimateForm.tsx
[ ] Create mobile/components/autodoc/ActivityLog.tsx
[ ] Implement status transitions with permission checks
[ ] Test job card CRUD operations
```

### 5.4 Settings Feature
```
[ ] Create mobile/components/settings/EmployeeList.tsx
[ ] Create mobile/components/settings/EmployeeSearch.tsx
[ ] Create mobile/components/settings/UserProfile.tsx
[ ] Implement pagination
[ ] Add logout functionality
[ ] Test employee data loading
```

### 5.5 Admin Feature
```
[ ] Create mobile/components/admin/UserManagement.tsx
[ ] Create mobile/components/admin/ModulePermissions.tsx
[ ] Create mobile/components/admin/DealerAssignment.tsx
[ ] Implement admin-only gating
[ ] Test CRUD operations
```

### 5.6 Offline Support (Optional but Recommended)
```
[ ] Implement AsyncStorage caching for job cards
[ ] Create sync queue for pending uploads
[ ] Implement conflict resolution on reconnect
[ ] Test offline → online transition
```

**Phase 5 Deliverable**: ✅ All features working with mobile-centric UI

---

## PHASE 6: Testing & Optimization (Checklist)

### 6.1 Unit Tests
```
[ ] Set up Jest testing framework
[ ] Create tests for column mappers
[ ] Create tests for report queries
[ ] Create tests for API helpers
[ ] Create tests for utility functions
[ ] Achieve 80%+ coverage on shared logic
```

### 6.2 Integration Tests
```
[ ] Test API calls with Supabase
[ ] Test authentication flow
[ ] Test data sync
[ ] Test error handling
```

### 6.3 E2E Tests
```
[ ] Test login → import → report flow
[ ] Test authdoc job card creation flow
[ ] Test offline → online transition
[ ] Test permission-based access
```

### 6.4 Device Testing
```
[ ] Test on Android emulator
[ ] Test on iOS simulator
[ ] Test on real Android device
[ ] Test on real iOS device (if available)
```

### 6.5 Performance Optimization
```
[ ] Compress images before upload
[ ] Implement lazy loading for lists
[ ] Memoize expensive calculations
[ ] Profile app startup time (target: < 3s)
[ ] Profile report load time (target: < 2s)
[ ] Profile photo upload (target: < 10s)
```

### 6.6 Accessibility Testing
```
[ ] Test screen reader compatibility
[ ] Test touch target sizes (48px minimum)
[ ] Test color contrast ratios
[ ] Test keyboard navigation
```

**Phase 6 Deliverable**: ✅ Tests passing, app optimized

---

## PHASE 7: APK Bundling & Deployment (Checklist)

### 7.1 Verify Dependencies in package.json
```
[ ] All 20+ core dependencies present
[ ] All mobile-specific dependencies present
[ ] No missing peer dependencies
[ ] Run npm install to verify
```

### 7.2 Configure EAS Build
```
[ ] Create eas.json with build profiles
[ ] Configure Android build profile
[ ] Configure iOS build profile
[ ] Set build cache settings
```

### 7.3 Build APK
```
[ ] eas build --platform android --profile preview
[ ] Wait for build completion
[ ] Download APK
[ ] Test APK on Android device
```

### 7.4 Build iOS IPA (Optional)
```
[ ] eas build --platform ios --profile preview
[ ] Wait for build completion
[ ] Test on iOS device or simulator
```

### 7.5 Configure OTA Updates
```
[ ] Enable EAS Updates in app.json
[ ] Set update frequency (ON_LOAD)
[ ] Test OTA update flow
[ ] Publish app code update (not dependencies)
```

### 7.6 Deployment Options
```
[ ] Option 1: Deploy APK via internal distribution
[ ] Option 2: Submit to Google Play Store (optional)
[ ] Option 3: Submit to Apple App Store (optional)
[ ] Create release notes
```

### 7.7 Post-Deployment
```
[ ] Monitor crash reports
[ ] Track app usage metrics
[ ] Plan for minor version updates (1.0.1, 1.0.2, etc.)
[ ] Document hotfix procedures
```

**Phase 7 Deliverable**: ✅ APK deployed, OTA updates configured

---

## Quality Gates

| Phase | Gate | Status |
|-------|------|--------|
| 1 | App runs in Expo Go locally | 🟢 Complete |
| 2 | Symlinks work, shared code accessible | 🟢 Complete |
| 3 | Login → Dashboard navigation works | 🟢 Complete |
| 4 | All 5 tabs functional with screen transitions | 🟠 In Progress |
| 5 | All features end-to-end tested | 🟠 In Progress |
| 6 | Tests passing, performance targets met | 🟡 Pending |
| 7 | APK deployed, OTA updates working | 🟡 Pending |

---

## Common Issues & Solutions

### Issue: Symlinks not working on Windows
**Solution**: Use npm workspace or manual copy script

### Issue: Module resolution errors
**Solution**: Clear metro cache: `watchman watch-del-all && npm start -- --reset-cache`

### Issue: Supabase session expires mid-session
**Solution**: Implement auto-refresh token in AuthProvider

### Issue: Images too large, slow upload
**Solution**: Compress using Expo ImageManipulator before upload

### Issue: Charts not rendering on mobile
**Solution**: Ensure Victory Native is installed, not Recharts

### Issue: APK too large (>150MB)
**Solution**: Enable ProGuard on Android, remove unused code, code splitting

---

## Next Milestone: Phase 4 Completion Gate

Before closing Phase 4, complete and record:

1. **Route Validation Matrix (Section 4.9)**:
   - Mark all 10 route checks pass/fail
   - Attach blocker notes for any failed checks

2. **Live Data Validation**:
   - Import live list loads from backend
   - AutoDoc detail/status update round-trip verified

3. **Auth Guard Validation**:
   - Authenticated redirect and unauthenticated redirect both verified

4. **Known Technical Debt Log**:
   - Keep offline/logger/background-sync issues isolated from Phase 4 closure

Reference fields (keep updated):

1. **Expo Credentials**:
   - Expo username: _______________
   - Expo account email: _______________
   - API token (if using CI/CD): _______________

2. **Google Play Credentials** (for Play Store, optional):
   - Google Cloud project ID: _______________
   - Service account JSON: _______________

3. **Apple Developer Credentials** (for App Store, optional):
   - Apple Developer account: _______________
   - Team ID: _______________

4. **Supabase Credentials** (already in .env?):
   - Supabase URL: _______________
   - Anon Key: _______________

---

**Document Status**: IN PROGRESS  
**Last Updated**: 2026-05-27  
**Estimated Timeline**: 7-10 days total  
**Next Step**: Execute Section 4.9 route validation and close Phase 4 gate
