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
    "build:prod:apk": "eas build -p android --profile production",
    "build:preview:apk": "eas build -p android --profile preview",
    "ota:prod": "CI=1 eas update --branch production --platform android --message",
    "ota:preview": "CI=1 eas update --branch preview --platform android --message"
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

### Phase 7: APK Bundling & Deployment (2-3 days)

#### 7.1 OTA Release Guide (Reference Project Pattern)
Create `mobile/OTA_RELEASE_GUIDE.md` (from ref project):

**Rule**: 
- OTA update when: Only JS/TS/UI changed
- Fresh APK when: Native layer or plugins changed

**Daily OTA Commands**:
```bash
# Android production
npm run ota:prod -- --message "Fix import duplicate"

# Android preview (QA)
npm run ota:preview -- --message "Test new charts"

# iOS
npm run ota:prod:ios -- --message "Fix import duplicate"

# User instruction: Close app → Reopen with internet → Update on next launch
```

#### 7.2 Pre-Bundling Dependencies (COMPREHENSIVE - ALL modules included by default)
Ensure `package.json` includes **ALL required modules by default** (no selective bundling):

```json
{
  "name": "techwheels-service-mobile",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "build:prod:apk": "eas build -p android --profile production",
    "build:preview:apk": "eas build -p android --profile preview",
    "ota:prod": "CI=1 eas update --branch production --platform android",
    "ota:preview": "CI=1 eas update --branch preview --platform android"
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
  }
}
```

**Coverage Analysis**:
- ✅ **Web Business Logic**: Supabase, ExcelJS, PapaParse, XLSX, jsPDF (report export)
- ✅ **Mobile File Ops**: Expo File System, Document Picker, Image Picker, Camera
- ✅ **Authentication**: AsyncStorage (session), Secure Store (credentials), Supabase Auth
- ✅ **State Management**: Zustand (with persist)
- ✅ **Styling**: TailwindCSS + NativeWind
- ✅ **UI Components**: React Native core + gesture handlers
- ✅ **Data Processing**: CSV Parse, PapaParse, XLSX, date-fns
- ✅ **Utilities**: Zod (validation), classnames, qrcode, Lucide icons
- ✅ **Notifications**: Expo Notifications, Location, Local Auth
- ✅ **Development**: TypeScript, Babel, ESLint, patch-package

**Bundle Size**: ~150 MB compressed (all dependencies included)  
**OTA Updates**: Only app code changes (~50-200 KB per update)

#### 7.2 Create EAS Configuration
Create `eas.json` (proven from ref project):
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
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": { "production": {} }
}
```

**Profiles**:
- **development**: Local testing with development client
- **preview**: Internal QA builds, APK for testing
- **production**: App store submissions

#### 7.3 Configure Expo Project
```bash
eas init
eas build --platform android --profile preview  # Build APK
eas build --platform ios --profile preview       # Build iOS
```

#### 7.4 Over-the-Air Updates
Configure `app.json` for EAS Updates:
```json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/<PROJECT_ID>",
      "fallbackToCacheTimeout": 0,
      "codegenMode": "partial"
    }
  }
}
```

#### 7.5 Deployment
- Build APK via EAS Build
- Deploy via Expo Go (for internal testing)
- Submit to Google Play & Apple App Store (optional)

**Deliverable**: APK ready for production deployment

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
| 4 | Main navigation + 5 core screens functioning | 🟠 In Progress |
| 5 | All features working (import, reports, autodoc, admin, settings) | 🟠 In Progress |
| 6 | 100% test coverage for shared logic, E2E tests passing | 🟡 Pending |
| 7 | APK built & deployable via EAS, OTA updates configured | 🟡 Pending |

### Feature Parity Checklist

- 🟢 **Authentication**: Login/signup/password reset wired to Supabase, session restore and route guards active
- 🟠 **Import**: Live job card list integrated; advanced file import flows pending
- 🟠 **Reports**: Screen scaffold exists; live report queries and exports pending
- 🟠 **AutoDoc**: Live list, detail route, and status updates working; panel/photo/document workflows pending
- 🟠 **Admin**: Basic screen and gating in place; full CRUD workflows pending
- 🟠 **Settings**: Screen and logout flow working; full settings coverage pending
- 🟡 **Offline Support**: Framework exists; type/runtime stabilization and sync validation pending
- 🟢 **Access Control**: Auth group and tabs group redirect guards active

### Performance Targets

- APK size: < 150 MB (compressed)
- App startup time: < 3 seconds
- Report load time: < 2 seconds
- Photo upload: < 10 seconds (with compression)
- OTA update size: < 10 MB

---

## Next Steps

1. **Phase 4 completion pass**: Validate all tab routes, headers, empty/error/loading states, and back navigation consistency.
2. **Import module completion**: Implement device file picker flows (CSV), mapper binding, duplicate/conflict handling, and success/failure UX.
3. **AutoDoc module completion**: Add panel selection, photo/document capture/upload, and estimate row workflows beyond status transitions.
4. **Reports module completion**: Connect report query hooks, add mobile chart components, and implement export behavior for mobile.
5. **Stabilize offline stack**: Resolve existing offline/logger/background-sync type issues, then run end-to-end offline/online sync validation.
6. **Phase 6 test gate**: Execute auth, import, autodoc, reports, admin, and settings validation checklist on real devices.
7. **Phase 7 delivery prep**: Finalize EAS preview/production profiles and produce installable preview builds.

---

## Appendix: Expo Go Credentials Setup

### Prerequisites
- Expo account: https://expo.dev
- EAS CLI: `npm install -g eas-cli`
- Existing project with Android & iOS published (reference)

### Create New Expo Project
```bash
eas init --id techwheels-service  # Use your organization slug
```

### Configure EAS Build
```bash
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

### Test on Device
```bash
expo start
# Scan QR code with Expo Go app
```

---

**Document Status**: IN PROGRESS  
**Last Updated**: 2026-05-27  
**Next Review**: After Phase 4 completion
