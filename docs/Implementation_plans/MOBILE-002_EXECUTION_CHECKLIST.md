# Techwheels Mobile - Detailed Execution Checklist

**Status**: Ready for Phase 1 Execution  
**Target**: 7-10 days for full implementation  
**Platform**: Expo (iOS + Android)

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
[ ] Test signup with valid email
[ ] Test login with correct credentials
[ ] Test login with wrong credentials
[ ] Test password reset flow
[ ] Verify token refresh on session expiry
[ ] Clear auth state on logout
```

**Phase 3 Deliverable**: ✅ Full auth flow end-to-end

---

## PHASE 4: Main Navigation (Checklist)

### 4.1 Create Tabs Layout
```
[ ] Create mobile/app/(tabs)/_layout.tsx
[ ] Configure BottomTabNavigator
[ ] Add 5 tabs: Import, Reports, AutoDoc, Settings, Admin
[ ] Style tab icons and labels
[ ] Add active/inactive color theming
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
[ ] Create mobile/app/(tabs)/import/index.tsx
[ ] Display import type selector (job cards, invoices, parts)
[ ] Implement file picker
[ ] Show upload progress
[ ] Handle duplicate detection
[ ] Show success/error messages
```

### 4.4 Create Reports Tab
```
[ ] Create mobile/app/(tabs)/reports/index.tsx
[ ] Display report categories
[ ] Implement report drill-down navigation
[ ] Create report detail screens
[ ] Integrate Victory Native charts
```

### 4.5 Create AutoDoc Tab
```
[ ] Create mobile/app/(tabs)/autodoc/index.tsx
[ ] Display job card list (infinite scroll)
[ ] Implement search/filter UI
[ ] Add "New Job Card" button
[ ] Navigate to job card detail on tap
```

### 4.6 Create Settings Tab
```
[ ] Create mobile/app/(tabs)/settings/index.tsx
[ ] Display employee list
[ ] Add search functionality
[ ] Show user profile section
[ ] Add logout button
```

### 4.7 Create Admin Tab
```
[ ] Create mobile/app/(tabs)/admin/index.tsx
[ ] Check admin permissions
[ ] Display admin dashboard
[ ] Add user management link
[ ] Add module permissions link
```

### 4.8 Test Navigation
```
[ ] Test tab switching
[ ] Test nested navigation (reports → detail)
[ ] Test back navigation
[ ] Verify permissions gating (Admin tab only for admins)
```

**Phase 4 Deliverable**: ✅ Main navigation + 5 core screens working

---

## PHASE 5: Feature Implementation (Checklist)

### 5.1 Import Feature
```
[ ] Create mobile/components/import/ImportTypeSelector.tsx
[ ] Create mobile/components/import/FileUploadCard.tsx
[ ] Create mobile/components/import/ProgressIndicator.tsx
[ ] Implement CSV parsing with PapaParse
[ ] Apply column mappers per import type
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
| 1 | App runs in Expo Go locally | 🟡 Pending |
| 2 | Symlinks work, shared code accessible | 🟡 Pending |
| 3 | Login → Dashboard navigation works | 🟡 Pending |
| 4 | All 5 tabs functional with screen transitions | 🟡 Pending |
| 5 | All features end-to-end tested | 🟡 Pending |
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

## Next Milestone: Credential Collection

Before starting Phase 1, please provide:

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

**Document Status**: DRAFT - READY FOR EXECUTION  
**Last Updated**: 2026-05-27  
**Estimated Timeline**: 7-10 days total  
**Next Step**: Collect Expo credentials and start Phase 1
