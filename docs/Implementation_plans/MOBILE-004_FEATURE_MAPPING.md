# Techwheels Mobile - Feature Mapping & Requirements

**Document Type**: Product Requirements  
**Target Audience**: Developers, QA, Product Managers  
**Last Updated**: 2026-05-27

---

## Executive Summary

| Aspect | Details |
|--------|---------|
| **Project** | Techwheels Service Mobile (Expo) |
| **Scope** | 100% feature parity with web v1.0 |
| **Timeline** | 7-10 days for implementation |
| **Target Platforms** | Android (primary) + iOS (secondary) |
| **Package Manager** | npm with pre-bundled dependencies |
| **Architecture** | Monorepo with symlinked shared code |
| **UI Framework** | React Native + NativeWind (Tailwind) |
| **Navigation** | Expo Router (file-based routing) |
| **Database** | Supabase (same as web) |
| **Build Tool** | EAS Build (managed Expo service) |

---

## Feature Mapping: Web → Mobile

### 1. Authentication Domain

#### Web Implementation
| Screen | Technology | Features |
|--------|-----------|----------|
| Login | React + Tailwind | Email/password input, form validation, error messaging |
| Sign Up | React + Tailwind | Email/password/confirm, form validation, email verification |
| Password Reset | React + Tailwind | Email input, reset link handling |
| Auth Callback | React Router | Deep link handling for email verification |

#### Mobile Implementation (Equivalent)
| Screen | Technology | Features |
|--------|-----------|----------|
| Login | React Native + NativeWind | Email/password input, form validation, error messaging |
| Sign Up | React Native + NativeWind | Email/password/confirm, form validation, email verification |
| Password Reset | React Native + NativeWind | Email input, reset link handling |
| Auth Callback | Expo Router | Deep link handling for email verification |

#### Parity Checklist
- ✅ Same authentication logic (Supabase.auth)
- ✅ Same validation rules (email format, password strength)
- ✅ Same error messages
- ✅ Same token persistence (AsyncStorage vs localStorage)
- ⚠️ UI/UX: Mobile-optimized form layouts (larger touch targets, full-width inputs)
- ⚠️ Mobile: Consider biometric login (fingerprint/face recognition) — optional but recommended

---

### 2. Import Domain

#### Web Implementation
| Component | Technology | Features |
|-----------|-----------|----------|
| Import Page | React + Tailwind | File upload, format selector, mapping UI |
| Column Mapper | React custom UI | Drag-drop column mapping, preview |
| Duplicate Handler | React modal | Show duplicates, allow override |
| Progress Indicator | React state | Upload progress bar |
| Conflict Resolution | React form | Manual conflict resolution for each row |

#### Web Data Flow
```
CSV File → PapaParse → Column Mapper → Validation → Duplicate Check → Conflict UI → Insert to DB
```

#### Mobile Implementation (Equivalent)
| Component | Technology | Features |
|-----------|-----------|----------|
| Import Screen | React Native + Expo | File picker, format selector, mapping UI |
| Column Mapper | React Native custom UI | Tap-to-map column mapping, preview |
| Duplicate Handler | React Native modal | Show duplicates, allow override |
| Progress Indicator | React Native | Upload progress bar with Reanimated |
| Conflict Resolution | React Native form | Inline conflict resolution for each row |

#### Mobile Data Flow
```
Mobile Storage → Expo FilePicker → PapaParse → Column Mapper → Validation → Duplicate Check → Conflict UI → Insert to DB
```

#### Import Type Support (Shared Mappers)

| Import Type | Mapper File | Table | Features |
|------------|------------|-------|----------|
| Job Cards | `openJobCardsColumnMapper.ts` | `job_cards` | Full CRUD, status tracking |
| Cancelled JCs | `cancelJobCardColumnMapper.ts` | `job_cards` | Status transition to cancelled |
| Closed/Not Invoiced | `closedButNotInvoicedColumnMapper.ts` | `job_cards` | Report reconciliation |
| Invoices | `invoiceColumnMapper.ts` | `invoices` | Invoice line items |
| Parts Orders | `partsOrderColumnMapper.ts` | `parts_orders` | PO creation + tracking |
| Parts Consumption | `partsConsumptionColumnMapper.ts` | `parts_consumption` | Parts usage tracking |
| Parts Stock | `partsStockColumnMapper.ts` | `parts_inventory` | Inventory levels |
| VAS (Value Added Service) | `vasColumnMapper.ts` | `vas_items` | Service line items |

#### Parity Checklist
- ✅ All 8 import types supported
- ✅ Same column mapping logic (symlinked)
- ✅ Same validation rules
- ✅ Same duplicate detection
- ✅ Same conflict resolution workflow
- ⚠️ UI/UX: Mobile file picker from device storage
- ⚠️ Mobile: Handle large CSV files (>50MB) with streaming

---

### 3. Reports Domain

#### Web Implementation
| Report Category | Report Type | Query | Visualization |
|----------------|------------|-------|----------------|
| Labour | Employee wise, Department wise | `reportQueries.ts` | Recharts (bar/pie/line) |
| Revenue | Dealer wise, Branch wise | `reportQueries.ts` | Recharts |
| Performance | On-time %, completion %, efficiency % | `reportQueries.ts` | Recharts |
| Parts | Stock levels, consumption, orders | `partsReportQueries.ts` | Recharts |

#### Web Data Flow
```
Report Category Selected → Execute Query → Generate Chart (Recharts) → Export (Excel/PPT)
```

#### Mobile Implementation (Equivalent)

| Report Category | Query | Visualization | Export |
|----------------|-------|----------------|--------|
| Labour | `reportQueries.ts` (symlinked) | Victory Native | PDF |
| Revenue | `reportQueries.ts` (symlinked) | Victory Native | PDF |
| Performance | `reportQueries.ts` (symlinked) | Victory Native | PDF |
| Parts | `partsReportQueries.ts` (symlinked) | Victory Native | PDF |

#### Mobile Data Flow
```
Report Category → Execute Query (shared) → Victory Native Charts → Export to PDF
```

#### Report Filters (Shared UI)
- Date range (start date, end date)
- Branch selection (multi-select)
- Department (optional)
- Employee (optional)
- Metric type (optional per report)

#### Parity Checklist
- ✅ Same queries (reportQueries.ts symlinked)
- ✅ Same data calculations
- ✅ Same filters available
- ⚠️ Chart rendering: Use Victory Native instead of Recharts
- ⚠️ Export format: PDF instead of Excel/PPT (mobile-friendly)
- ⚠️ Mobile: Responsive chart sizing for portrait mode
- ⚠️ Mobile: Swipe to see different chart types

---

### 4. AutoDoc Domain (Core Feature)

#### Web Implementation
| Feature | Component | Technology | Capabilities |
|---------|-----------|-----------|--------------|
| Job Card List | AutoDocPage | React Table | List, filter, search, pagination |
| Job Card Detail | JobCardPage | React forms | Full CRUD, nested edit |
| Panels | JobCardPage subsection | React components | Add/remove/edit panels |
| Photos | JobCardPage subsection | Dropzone | Upload from file system |
| Documents | JobCardPage subsection | File upload | Upload from file system |
| Estimates | JobCardPage subsection | React forms | Create, edit, approve |
| Activity Log | JobCardPage subsection | React table | View audit trail |
| Status Transitions | JobCardPage header | React buttons | Change status with permission check |

#### Web Data Flow
```
Job Card List (API call) → Filter/Search → Select JC → Load detail → Edit subsystems (Panels/Photos/Docs/Estimate) → Save → Update activity log
```

#### Mobile Implementation (Equivalent)

| Feature | Component | Technology | Capabilities |
|---------|-----------|-----------|--------------|
| Job Card List | autodoc/index.tsx | React Native FlatList | List, filter, search, infinite scroll |
| Job Card Detail | autodoc/[id]/index.tsx | React Native forms | Full CRUD, swipeable subsystems |
| Panels | autodoc/[id]/panels.tsx | React Native carousel | Add/remove/edit with swipe |
| Photos | autodoc/[id]/photos.tsx | Expo Camera + ImagePicker | Capture from camera OR pick from gallery |
| Documents | autodoc/[id]/documents.tsx | Expo DocumentPicker | Pick PDF/images from storage |
| Estimates | autodoc/[id]/estimate.tsx | React Native forms | Create, edit, approve |
| Activity Log | autodoc/[id]/activity.tsx | React Native FlatList | View audit trail |
| Status Transitions | autodoc/[id]/index.tsx header | React Native buttons | Change status with permission check |

#### Mobile Data Flow
```
Job Card List (API call) → Infinite scroll / Filter/Search → Tap JC → Load detail → Tab through subsystems (or swipe) → Photo from camera/gallery → Save → Update activity log
```

#### AutoDoc API Integration (Shared Layer)

| Operation | API Endpoint | Method | Purpose |
|-----------|-------------|--------|---------|
| Get job cards | `GET /job_cards` | jobCards.getJobCards() | List with filters |
| Get job card | `GET /job_cards/{id}` | jobCards.getJobCard(id) | Load detail |
| Create job card | `POST /job_cards` | jobCards.createJobCard() | New JC |
| Update job card | `PUT /job_cards/{id}` | jobCards.updateJobCard() | Edit JC |
| Transition status | `PUT /job_cards/{id}/status` | jobCards.transitionStatus() | Change status |
| Get panels | `GET /panels?job_card_id={id}` | panels.getPanels() | List panels |
| Add panel | `POST /panels` | panels.addPanel() | Add panel |
| Remove panel | `DELETE /panels/{id}` | panels.removePanel() | Remove panel |
| Upload photo | `POST /photos` | photos.uploadPhoto() | Store photo |
| Get photos | `GET /photos?job_card_id={id}` | photos.getPhotos() | List photos |
| Upload document | `POST /documents` | documents.uploadDocument() | Store doc |
| Get documents | `GET /documents?job_card_id={id}` | documents.getDocuments() | List docs |
| Create estimate | `POST /estimates` | estimate.createEstimate() | New estimate |
| Get estimate | `GET /estimates?job_card_id={id}` | estimate.getEstimate() | Load estimate |
| Activity log | `GET /activity?entity_id={id}` | activityLog.getActivityLog() | Audit trail |

#### Photo Handling Details

**Web**:
- User selects file from file explorer
- Dropzone component shows preview
- File uploaded to Supabase Storage
- Reference stored in `documents` table
- Size: Up to 50 MB per file

**Mobile**:
- User chooses: Camera OR Gallery
- If Camera: Expo Camera captures photo
- If Gallery: Expo ImagePicker selects image
- **Image Compression**: Resize to max 2000x2000px, quality 80% (mobile optimization)
- File uploaded to Supabase Storage
- Reference stored in `documents` table
- Size: Compressed typically 200-500 KB per photo

**Compression Logic** (new for mobile):
```ts
import * as ImageManipulator from 'expo-image-manipulator'

export async function compressImage(uri: string) {
  const compressed = await ImageManipulator.manipulateAsync(uri, [
    { resize: { width: 2000, height: 2000 } }
  ], { compress: 0.8, format: 'jpeg' })
  return compressed.uri
}
```

#### Parity Checklist
- ✅ Same API calls (symlinked)
- ✅ Same data models
- ✅ Same validation rules
- ✅ Same permission checks
- ✅ Same activity logging
- ⚠️ UI/UX: Bottom-sheet based navigation vs tabs
- ⚠️ Mobile: Camera integration (critical feature)
- ⚠️ Mobile: Image compression before upload
- ⚠️ Mobile: Swipeable panels (gesture-based UI)
- ⚠️ Mobile: Infinite scroll instead of pagination

---

### 5. Admin Domain

#### Web Implementation
| Feature | Component | Technology | Capabilities |
|---------|-----------|-----------|--------------|
| User Management | AdminPage | React Table + Modal | Create, activate, deactivate users |
| Dealer Assignment | AdminPage | React forms | Assign dealers to users |
| Module Permissions | AdminPage | React checklist | Grant/revoke module access |
| Permission Matrix | AdminPage table | React components | View/edit all permissions |

#### Mobile Implementation (Equivalent)
| Feature | Component | Technology | Capabilities |
|---------|-----------|-----------|--------------|
| User Management | admin/index.tsx | React Native List | Create, activate, deactivate users |
| Dealer Assignment | admin/[id]/dealers.tsx | React Native Picker | Assign dealers to users |
| Module Permissions | admin/[id]/permissions.tsx | React Native Checkbox list | Grant/revoke module access |
| Permission Matrix | admin/index.tsx subsection | React Native Grid | View/edit all permissions |

#### Admin API Integration (Shared Layer)

| Operation | API Endpoint | Method |
|-----------|-------------|--------|
| Get users | `GET /users` | auth.getUsers() |
| Create user | `POST /users` | auth.createUser() |
| Update user | `PUT /users/{id}` | auth.updateUser() |
| Activate user | `PUT /users/{id}/activate` | auth.activateUser() |
| Deactivate user | `PUT /users/{id}/deactivate` | auth.deactivateUser() |
| Get modules | `GET /modules` | modules.getModules() |
| Update permissions | `PUT /permissions` | permissions.updatePermissions() |

#### Parity Checklist
- ✅ Same admin operations (CRUD)
- ✅ Same permission model
- ✅ Same validation rules
- ⚠️ Mobile: Simplified UI (pagination, less complex tables)
- ⚠️ Mobile: Consider delegating complex admin tasks to web (optional)

---

### 6. Settings Domain

#### Web Implementation
| Feature | Component | Technology | Capabilities |
|---------|-----------|-----------|--------------|
| Employee List | SettingsPage | React Table | View all employees |
| Employee Search | SettingsPage | React input | Filter by name/code |
| Employee Detail | SettingsPage modal | React form | View/edit employee details |
| User Profile | SettingsPage section | React form | View/edit current user profile |
| Logout | SettingsPage button | React router | Clear session |

#### Mobile Implementation (Equivalent)
| Feature | Component | Technology | Capabilities |
|---------|-----------|-----------|--------------|
| Employee List | settings/index.tsx | React Native FlatList | View all employees with search |
| Employee Search | settings/index.tsx header | React Native TextInput | Real-time filter by name/code |
| Employee Detail | settings/[id].tsx | React Native form | View/edit employee details |
| User Profile | settings/profile.tsx | React Native form | View/edit current user profile |
| Logout | settings/index.tsx button | Expo Router | Clear session + navigate to login |

#### Parity Checklist
- ✅ Same employee data (from database)
- ✅ Same search logic
- ✅ Same update operations
- ⚠️ Mobile: Search-first UI pattern
- ⚠️ Mobile: Infinite scroll for large employee lists

---

## User Journey Flows

### Web Flow: User logs in → Views report → Exports Excel

```
1. User navigates to / (default route)
2. App checks auth state (React Router wrapper)
3. If not logged in: Navigate to /login
4. User enters email + password
5. Supabase authenticates, returns JWT
6. Navigate to /reports
7. User selects report category (labour/revenue/performance/parts)
8. Report queries execute (reportQueries.ts)
9. Recharts renders visualization
10. User clicks "Export to Excel"
11. generateExcel.ts creates .xlsx file
12. Browser downloads file
```

### Mobile Flow: User logs in → Views report → Exports PDF (Equivalent)

```
1. User opens app, sees splash screen
2. App checks AsyncStorage for auth token
3. If not logged in: Show (auth)/login screen
4. User enters email + password
5. Supabase authenticates, returns JWT → stored in AsyncStorage
6. Navigate to (tabs)/reports
7. User selects report category (labour/revenue/performance/parts)
8. Report queries execute (same reportQueries.ts symlinked)
9. Victory Native renders visualization
10. User taps "Export to PDF"
11. PDF generation (using expo-sharing or similar)
12. Share PDF via email/storage/messaging
```

### Web Flow: User imports CSV → Views dashboard

```
1. User navigates to /import
2. User selects import type (job cards / invoices / parts orders)
3. User clicks file upload, selects CSV
4. Client-side parsing with PapaParse
5. Column mapper UI shows inferred headers
6. User maps columns (drag-drop)
7. Preview rows in table
8. If duplicates detected: Show conflict resolution UI
9. User resolves conflicts
10. Click "Import" button
11. Data uploaded to Supabase
12. Toast notification "Import successful"
13. Navigate to /autodoc to see new job cards
```

### Mobile Flow: User imports CSV → Views dashboard (Equivalent)

```
1. User navigates to (tabs)/import
2. User selects import type (job cards / invoices / parts orders)
3. User taps "Select File", opens file picker
4. User navigates to Documents folder, selects CSV
5. Client-side parsing with PapaParse (same as web)
6. Column mapper UI shows inferred headers
7. User taps columns to map them (tap-to-select)
8. Preview rows in list
9. If duplicates detected: Show conflict resolution UI
10. User resolves conflicts inline
11. Tap "Import" button
12. Progress indicator shows upload progress
13. Toast notification "Import successful"
14. Navigate to (tabs)/autodoc to see new job cards
```

### Web Flow: User creates job card → Uploads photos → Generates estimate

```
1. User navigates to /autodoc
2. User clicks "New Job Card"
3. Form opens (vehicle lookup, customer info, status)
4. User selects vehicle (lookup via RC)
5. Submits form, job card created
6. Redirected to job card detail page
7. User navigates to "Panels" tab
8. Adds panels (affected areas)
9. User navigates to "Photos" tab
10. Drags-drops photos from file explorer
11. Photos upload to Supabase Storage
12. User navigates to "Estimate" tab
13. Fills estimate form (parts, labour, misc)
14. Clicks "Generate PPT"
15. generatePPT.ts creates PowerPoint presentation
16. Browser downloads .pptx file
```

### Mobile Flow: User creates job card → Uploads photos → Generates estimate (Equivalent)

```
1. User navigates to (tabs)/autodoc
2. User taps "+" FAB (floating action button)
3. Form opens (vehicle lookup, customer info, status)
4. User taps "Lookup Vehicle", enters RC number
5. Fetches vehicle data, shows in form
6. Submits form, job card created
7. Navigated to autodoc/[id] detail screen
8. User swipes to "Panels" tab
9. Taps "Add Panel", selects from vehicle structure
10. User swipes to "Photos" tab
11. Taps "Camera" button (or gallery)
12. Camera opens (Expo Camera)
13. Takes photo, preview shown
14. Compresses image, uploads to Supabase Storage
15. User swipes to "Estimate" tab
16. Fills estimate form (parts, labour, misc)
17. Taps "Save & Export"
18. Generates PDF (using react-native-pdf library)
19. Shares PDF via email/WhatsApp/storage
```

---

## Performance & Size Targets

### APK Size Breakdown
```
App Code:              ~10 MB
React Native Core:     ~20 MB
Dependencies:          ~40 MB (Supabase, Recharts, ExcelJS, etc.)
Native Modules:        ~30 MB (Camera, Image Processing, Storage)
Assets (Icons/Splash): ~2 MB
─────────────────────────────
Total (Compressed):    ~100 MB
Total (Uncompressed):  ~150 MB
```

### Network Performance
| Operation | Target | Strategy |
|-----------|--------|----------|
| Login | < 2s | Cached Supabase session |
| Load job card list | < 3s | Pagination + caching |
| Load report | < 2s | Async query execution |
| Upload photo | < 10s | Image compression + progress |
| Import CSV | < 30s (for 1000 rows) | Batch processing |

### Storage Performance
| Data | Storage | Size | Sync |
|------|---------|------|------|
| JWT token | AsyncStorage | < 1 KB | Auto on login |
| Job card drafts | AsyncStorage | < 100 KB | Manual upload queue |
| Cached reports | AsyncStorage | < 1 MB | Hourly refresh |
| Photo cache | Device storage | Configurable (1-100 MB) | On demand |

---

## Offline Support (Optional Feature)

### Offline-Capable Features
- ✅ View cached job cards
- ✅ Create job card drafts (stored locally)
- ✅ Take photos (stored locally)
- ✅ View offline mode indicator

### Sync on Reconnect
- ✅ Upload pending job cards
- ✅ Upload queued photos
- ✅ Conflict resolution if changes on server
- ✅ Activity log updates

### Implementation (Phase 5 Optional)
```ts
// hooks/useOfflineQueue.ts
export function useOfflineQueue() {
  const queue = useRef<PendingUpload[]>([])
  
  // Add to queue when offline
  const queueUpload = async (data: any) => {
    if (isOnline()) {
      await uploadDirectly(data)
    } else {
      queue.current.push(data)
      await saveQueueToStorage()
    }
  }
  
  // Sync on reconnect
  useEffect(() => {
    if (isOnline() && queue.current.length > 0) {
      syncQueue()
    }
  }, [isOnline()])
  
  return { queueUpload, pendingCount: queue.current.length }
}
```

---

## Accessibility & Inclusivity

### Mobile Accessibility Features
- ✅ Screen reader support (React Native Accessibility)
- ✅ High contrast mode (respect system settings)
- ✅ Large touch targets (48x48 dp minimum)
- ✅ Font size adjustable (respect system settings)
- ✅ Keyboard navigation (full support)

### Color Contrast
- Main text: WCAG AA (7:1 ratio)
- Interactive elements: WCAG AAA (7:1 ratio)
- Charts: Legend + accessible data table fallback

---

## Success Criteria Checklist

### Phase-Gate Criteria
- [ ] Phase 1: Expo project initializes, all dependencies install without errors
- [ ] Phase 2: Symlinks resolve correctly, shared code accessible, TypeScript compiles
- [ ] Phase 3: Auth flow works end-to-end (login → authenticated screen)
- [ ] Phase 4: 5 core tabs navigate smoothly, no crashes
- [ ] Phase 5: All features functional with 80%+ component coverage
- [ ] Phase 6: Tests pass with 80%+ coverage, app <3s startup time
- [ ] Phase 7: APK builds successfully, deploys via EAS, OTA updates work

### Feature Parity Criteria
- [ ] Authentication: Login, signup, password reset ✓
- [ ] Import: All 8 import types, column mapping, duplicate detection ✓
- [ ] Reports: All 4 categories, filters, charts, export ✓
- [ ] AutoDoc: Job card CRUD, panels, photos (camera), documents, estimates ✓
- [ ] Admin: User CRUD, module permissions ✓
- [ ] Settings: Employee list, search, user profile ✓
- [ ] Access Control: Module permissions enforced, RLS policies respected ✓

### Quality Criteria
- [ ] < 150 MB APK size
- [ ] < 3 second startup time
- [ ] < 0.5% crash rate
- [ ] 90%+ upload success rate
- [ ] < 2 second report load time
- [ ] 85%+ test coverage for shared logic

---

**Document Status**: DRAFT  
**Last Updated**: 2026-05-27  
**Next Review**: After Phase 1-2 completion
