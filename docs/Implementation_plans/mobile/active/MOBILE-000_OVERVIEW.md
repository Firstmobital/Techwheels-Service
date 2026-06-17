# Techwheels Mobile Implementation - COMPLETE OVERVIEW

**Project**: Techwheels Service - Mobile App via Expo  
**Status**: READY FOR EXECUTION  
**Date Created**: 2026-05-27  
**Timeline**: 7-10 days for full implementation  
**Target Platforms**: Android (primary), iOS (secondary)

## Program Authority (Effective 2026-06-17)

1. Master program tracker (single execution authority): `docs/Implementation_plans/mobile/active/MOBILE-010_MOBILE_PROGRAM_MASTER_TRACKER.md`
2. Strategy baseline: `docs/Implementation_plans/mobile/active/MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md`
3. This file is an overview and quick-start reference, not the cross-plan execution tracker.

---

## 📋 Quick Summary

You have a fully functional **Techwheels Service web application** (React + TypeScript + Vite) serving 5 core domains:
1. **Authentication** - Login/Signup/Password Reset
2. **Import** - CSV bulk data ingestion (8 types)
3. **Reports** - Analytics & dashboards (Labour, Revenue, Performance, Parts)
4. **AutoDoc** - Job card management with photos, documents, estimates
5. **Admin & Settings** - User/employee management

**Goal**: Create a **native mobile app (Expo)** with **identical business logic** but **mobile-centric UI/UX** instead of copying the web design.

---

## 📄 Documents Created

### 1. **MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md** (Strategy Baseline)
- **Purpose**: Detailed 7-phase implementation roadmap
- **Contents**:
  - Executive summary
  - Project audit (web stack analysis)
  - Phase-by-phase implementation steps
  - Shared code layer strategy
  - Module bundling approach
  - Risk mitigation
  - Success criteria

### 1A. **MOBILE-010_MOBILE_PROGRAM_MASTER_TRACKER.md** (Master Program Tracker)
- **Purpose**: Single source of truth for cross-plan status, sequencing, and execution governance
- **Contents**:
   - Authority model for MOBILE-000/001/005/006/007/008/009
   - Program-level tracker with priorities and dependencies
   - Child-tracker sync rules and restart protocol

### 2. **MOBILE-002_EXECUTION_CHECKLIST.md** (Day-to-Day)
- **Purpose**: Actionable task list for development team
- **Contents**:
  - Pre-execution requirements (credentials, tools)
  - Detailed checklist per phase (7 phases)
  - Quality gates at each phase
  - Common issues & solutions
  - Credential collection template

### 3. **MOBILE-003_ARCHITECTURE.md** (Technical Reference)
- **Purpose**: Architecture, code structure, data flows
- **Contents**:
  - Full directory structure (web + mobile)
  - Code sharing strategy (symlinks)
  - API layer specification (12 modules)
  - Component hierarchy
  - Data flow diagrams
  - Security considerations
  - Testing strategy
  - Deployment pipeline

### 4. **MOBILE-004_FEATURE_MAPPING.md** (Product Requirements)
- **Purpose**: Feature-by-feature mapping from web to mobile
- **Contents**:
  - Authentication (login/signup/reset)
  - Import (8 data types, column mapping, duplicate handling)
  - Reports (4 categories, queries, charts, export)
  - AutoDoc (job cards, panels, photos, documents, estimates)
  - Admin (user/permission management)
  - Settings (employee management)
  - User journey flows (detailed step-by-step)
  - Performance targets & offline support
  - Accessibility & success criteria

---

## 🏗️ Architecture at a Glance

```
┌─────────────────────────────────────────────────┐
│           Techwheels Service Project             │
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌────────────────────┐  ┌────────────────────┐ │
│  │   WEB APP          │  │   MOBILE APP       │ │
│  │  (React + Vite)    │  │  (Expo/RN)         │ │
│  │                    │  │                    │ │
│  │ - Pages (8)        │  │ - Screens (15+)    │ │
│  │ - React Router     │  │ - Expo Router      │ │
│  │ - TailwindCSS      │  │ - NativeWind       │ │
│  └────────────┬───────┘  └────────────┬───────┘ │
│               │                       │         │
│               └───────────┬───────────┘         │
│                           │                     │
│               ┌───────────▼─────────────┐       │
│               │  SHARED BUSINESS LOGIC  │       │
│               │  (via Symlinks)         │       │
│               │                         │       │
│               │ - 12 API Modules        │       │
│               │ - 8 Column Mappers      │       │
│               │ - Report Queries        │       │
│               │ - Database Types        │       │
│               │ - Utilities             │       │
│               └───────────┬─────────────┘       │
│                           │                     │
│               ┌───────────▼─────────────┐       │
│               │  SUPABASE BACKEND       │       │
│               │                         │       │
│               │ - PostgreSQL (Auth)     │       │
│               │ - JWT + RLS Policies    │       │
│               │ - Cloud Storage         │       │
│               └─────────────────────────┘       │
│                                                   │
└─────────────────────────────────────────────────┘
```

---

## 🔑 Key Implementation Details

### Technology Stack

| Layer | Web | Mobile |
|-------|-----|--------|
| **Framework** | React 19 | React Native (Expo 52) |
| **Language** | TypeScript | TypeScript |
| **Build Tool** | Vite | EAS Build |
| **Routing** | React Router v7 | Expo Router v3 |
| **Styling** | TailwindCSS | NativeWind + TailwindCSS |
| **Charts** | Recharts | Victory Native |
| **Export** | Excel/PPT | PDF |
| **Storage** | localStorage | AsyncStorage |
| **Auth** | Supabase JWT | Supabase JWT |
| **Database** | PostgreSQL | PostgreSQL (same) |
| **Permissions** | RLS + module matrix | RLS + module matrix |

### Code Sharing Strategy

**Symlink Approach** (Recommended):
```bash
mobile/lib/api → ../src/lib/api              # All 12 API modules
mobile/lib/*ColumnMapper.ts → ../src/lib/    # All 8 mappers
mobile/lib/reportQueries.ts → ../src/lib/    # Query builders
mobile/lib/database.types.ts → ../src/lib/   # TS types
```

**Benefit**: Zero duplication, automatic sync when web code updates

**Alternative**: npm workspace (if symlinks don't work on Windows)

### Feature Parity

| Domain | Web Features | Mobile Features | Status |
|--------|-------------|-----------------|--------|
| **Auth** | Login, Signup, Password Reset | Same (mobile UI) | ✅ Full Parity |
| **Import** | 8 data types, CSV, column mapping | 8 data types, CSV, column mapping | ✅ Full Parity |
| **Reports** | 4 categories, Recharts, Excel/PPT | 4 categories, Victory Native, PDF | ✅ Full Parity |
| **AutoDoc** | Job cards, panels, photos, docs, estimates | Job cards, panels, camera photos, docs, estimates | ✅ Full Parity |
| **Admin** | User/module/permission CRUD | User/module/permission CRUD | ✅ Full Parity |
| **Settings** | Employee management, user profile | Employee management, user profile | ✅ Full Parity |
| **Offline** | Not applicable | Draft job cards, sync queue | ✅ Added Feature |

---

## 📅 7-Phase Timeline

| Phase | Duration | Deliverable | Status |
|-------|----------|------------|--------|
| **Phase 1: Setup** | 1-2 days | Expo project running locally | 🟡 Pending |
| **Phase 2: Shared Code** | 1-2 days | Symlinks working, shared layer accessible | 🟡 Pending |
| **Phase 3: Auth** | 1-2 days | Login → Dashboard navigation | 🟡 Pending |
| **Phase 4: Navigation** | 2-3 days | 5 core tabs + screens working | 🟡 Pending |
| **Phase 5: Features** | 3-5 days | All features end-to-end tested | 🟡 Pending |
| **Phase 6: Testing** | 2-3 days | Tests passing, optimized for mobile | 🟡 Pending |
| **Phase 7: Deployment** | 2-3 days | APK built, EAS configured, OTA ready | 🟡 Pending |
| | **7-10 days total** | **Production-ready APK** | 🟡 Pending |

---

## 🛠️ Technology Decisions

### Why Expo?
✅ **Managed workflow** - No native code needed  
✅ **OTA updates** - Push fixes without app store  
✅ **Same JS stack** - Reuse React code  
✅ **Production-ready** - Used by major companies  
✅ **Easy deployment** - EAS Build + Submit  

### Why Symlinks for Shared Code?
✅ **Zero duplication** - Single source of truth  
✅ **Automatic sync** - Updates propagate instantly  
✅ **No build step** - Works as-is with Expo Metro  
⚠️ **Windows limitation** - Use npm workspace alternative if needed  

### Why NativeWind instead of StyleSheet?
✅ **Same Tailwind skillset** - Team knows TailwindCSS  
✅ **Faster development** - Familiar class-based styling  
✅ **Consistency** - Mobile UI matches web design language  
✅ **Easy to maintain** - Less custom CSS needed  

### Why Victory Native instead of Recharts?
✅ **React Native compatible** - Works on mobile  
✅ **Lightweight** - Smaller bundle than Recharts  
✅ **Responsive** - Built for mobile screens  
✅ **Good enough** - Supports all needed chart types  

---

## 📦 Dependencies (Pre-bundled in APK)

### Core Web Packages (All Included)
```json
{
  "@supabase/supabase-js": "^2.103.3",
  "exceljs": "^4.4.0",
  "papaparse": "^5.5.3",
  "pptxgenjs": "^4.0.1",
  "react": "^19.2.5",
  "react-router-dom": "^7.14.1",
  "recharts": "^3.8.1",
  "xlsx": "^0.18.5"
}
```

### Mobile-Specific Packages
```json
{
  "expo": "^52.0.0",
  "expo-router": "^3.x",
  "expo-camera": "^15.x",
  "expo-image-picker": "^15.x",
  "expo-document-picker": "^12.x",
  "react-native": "0.76.x",
  "react-native-gesture-handler": "^2.x",
  "react-native-reanimated": "^3.x",
  "nativewind": "^4.x",
  "victory-native": "^38.x"
}
```

### Result
- **APK size**: ~100-150 MB (compressed)
- **No dependency downloads on install** - Everything pre-bundled
- **OTA updates** - Only app code changes, not dependencies

---

## 🔐 Security Model (Inherited from Web)

### Authentication
✅ Supabase JWT stored in AsyncStorage (mobile-specific)  
✅ Token auto-refresh on expiry  
✅ Same login/signup flow as web  

### Authorization
✅ RLS policies enforce dealer scoping  
✅ Module permissions checked at UI + API layer  
✅ Role-based access (admin, manager, staff, viewer)  

### Data Protection
✅ HTTPS for all API calls  
✅ Supabase Storage encryption  
✅ Sensitive data never logged  

---

## 📊 Performance Targets

| Metric | Target | Strategy |
|--------|--------|----------|
| Startup Time | < 3 seconds | Cached session, lazy loading |
| Report Load | < 2 seconds | Async queries, pagination |
| Photo Upload | < 10 seconds | Image compression |
| APK Size | < 150 MB | Bundled dependencies, ProGuard |
| Crash Rate | < 0.5% | Comprehensive testing |
| Test Coverage | 85%+ | Unit + E2E tests |

---

## 🎯 Next Steps (To Get Started)

### Step 1: Collect Credentials
Before starting Phase 1, provide:
- [ ] Expo account username
- [ ] Expo API token (optional for CI/CD)
- [ ] Supabase URL & Anon Key (if not already available)

### Step 2: Execute Phase 1 (Setup)
```bash
cd mobile
npx create-expo-app@latest techwheels-service
npm install [all dependencies]
expo start
```

### Step 3: Execute Phase 2 (Shared Code)
```bash
cd mobile/lib
ln -s ../../src/lib/api ./api
ln -s ../../src/lib/*ColumnMapper.ts .
# ... (rest of symlinks)
```

### Step 4: Execute Phases 3-7
Follow the detailed checklist in **MOBILE-002_EXECUTION_CHECKLIST.md**

---

## 📞 Key Decision Points

### 1. Monorepo Structure
✅ **Decision**: Create `mobile/` folder in same repo as web  
**Rationale**: Easier to keep shared code in sync with symlinks

### 2. File-Based Routing
✅ **Decision**: Use Expo Router (like Next.js) instead of React Router  
**Rationale**: Better for mobile navigation patterns, native feel

### 3. Charting Library
✅ **Decision**: Victory Native (not Recharts)  
**Rationale**: Optimized for React Native, smaller bundle

### 4. Export Format
✅ **Decision**: PDF (not Excel/PPT) for mobile reports  
**Rationale**: Better UX for mobile sharing/viewing

### 5. Photo Handling
✅ **Decision**: Integrate camera (Expo Camera) + gallery picker  
**Rationale**: Mobile-first UX (don't make users pick files)

### 6. Offline Support
✅ **Decision**: Optional but recommended for Job Cards (Phase 5+)  
**Rationale**: Essential for field technicians

---

## 🚀 Deployment Path

### Development → Testing → Production

```
1. Local Development
   └─> expo start (hot reload in Expo Go)

2. Testing (Preview Build)
   └─> eas build --platform android --profile preview
   └─> Download APK, distribute internally

3. Quality Assurance
   └─> Test on Android emulator + real devices
   └─> Test on iOS simulator (if available)
   └─> Run E2E tests

4. Production Build
   └─> eas build --platform android --profile production
   └─> Download APK for internal distribution
   └─> (Optional) eas submit to Google Play Store

5. Post-Launch
   └─> Monitor crash reports
   └─> Plan OTA updates via EAS Updates
   └─> Minor version updates (1.0.1, 1.0.2, etc.)
```

---

## 📈 Success Metrics

### Phase Gates (Must Pass)
- ✅ Phase 1: App runs in Expo Go locally
- ✅ Phase 2: Symlinks work, no TypeScript errors
- ✅ Phase 3: Full auth flow end-to-end
- ✅ Phase 4: All 5 tabs navigate without crashes
- ✅ Phase 5: All features tested, 80%+ coverage
- ✅ Phase 6: Performance targets met, tests passing
- ✅ Phase 7: APK deployed, OTA updates working

### Feature Metrics (100% Parity)
- ✅ All 8 import types supported
- ✅ All 4 report categories working
- ✅ Job card CRUD with camera photos
- ✅ Admin & permission management
- ✅ Employee management in settings
- ✅ Module permissions enforced

### Quality Metrics
- ✅ < 150 MB APK size
- ✅ < 3 second startup
- ✅ < 0.5% crash rate
- ✅ 85%+ test coverage

---

## 🔗 Document Cross-References

| Question | See Document |
|----------|--------------|
| How do I implement phase-by-phase? | MOBILE-001 (Plan) |
| What exact tasks do I need to complete? | MOBILE-002 (Checklist) |
| What's the code structure? | MOBILE-003 (Architecture) |
| How do features map? | MOBILE-004 (Feature Mapping) |
| What are the APIs? | MOBILE-003 (API section) |
| What's the tech stack? | This document (Overview) |
| How do I test? | MOBILE-003 (Testing section) |
| How do I deploy? | MOBILE-003 (Deployment section) |

---

## 💡 Key Insights

1. **Code Reuse via Symlinks**
   - Business logic (API, mappers, queries) is 100% shared
   - Only UI layer differs (React vs React Native)
   - Updates to web business logic automatically sync to mobile

2. **Mobile-First UI, Not Web Copy**
   - Use React Native components (not web HTML)
   - Mobile navigation patterns (tabs, bottom sheets, gestures)
   - Photos via camera, not file explorer
   - Responsive layouts for portrait mode

3. **Pre-Bundled Dependencies**
   - All npm packages included in APK by default
   - OTA updates only push app code changes
   - Minimizes dependency download issues on weak networks

4. **Authentication Parity**
   - Same Supabase JWT, RLS policies, module permissions
   - Session stored in AsyncStorage (mobile) vs localStorage (web)
   - Auto-token refresh works identically

5. **Offline-First Architecture (Optional)**
   - Draft job cards stored locally
   - Sync queue for pending uploads
   - Reconnect handler for conflict resolution

---

## ⚠️ Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Symlinks break on Windows | Blocked development | Use npm workspace alternative |
| APK too large | Installation issues | Enable ProGuard, code splitting |
| RLS policy misalignment | Unauthorized access | Test each API with test credentials |
| Session expiry mid-task | User frustration | Implement auto-refresh + local cache |
| Photo compression issues | Poor quality | Test compression ratios on real devices |
| Chart rendering slow | Poor UX on older devices | Pre-render or use simpler charts |

---

## 📚 References

- **Expo Docs**: https://docs.expo.dev
- **React Native Docs**: https://reactnative.dev
- **NativeWind**: https://www.nativewind.dev
- **Victory Native**: https://formidable.com/open-source/victory/docs/victory-native
- **Supabase Docs**: https://supabase.com/docs
- **EAS Build**: https://docs.expo.dev/build/introduction

---

## 🎓 Learning Resources

For team members new to mobile development:

1. **React Native Basics** (2 hours)
   - Components (View, Text, TextInput, FlatList, etc.)
   - Styling with StyleSheet or NativeWind
   - Navigation patterns (Expo Router)

2. **Expo-Specific** (1 hour)
   - File system (expo-file-system)
   - Media (expo-camera, expo-image-picker)
   - Permissions model

3. **Mobile UX Patterns** (1 hour)
   - Bottom sheet navigation
   - Gesture-based interactions (swipe, tap, long press)
   - Touch target sizing (48dp minimum)
   - Safe area handling (notches, status bars)

---

## 👥 Team Roles & Responsibilities

| Role | Responsibility |
|------|-----------------|
| **Lead Developer** | Oversee architecture, Phase 1-2 setup, code review |
| **Mobile Developer (1-2)** | Implement screens, features, components |
| **Backend Developer** | Ensure API compatibility, RLS policies |
| **QA Engineer** | Testing phases 3-7, device testing |
| **DevOps/Release** | EAS Build setup, deployment pipeline |

---

## 📝 Documentation Index

```
docs/Implementation_plans/
├── MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md   ← Start here (7-phase plan)
├── MOBILE-002_EXECUTION_CHECKLIST.md        ← Use daily (actionable tasks)
├── MOBILE-003_ARCHITECTURE.md               ← Reference (code structure)
├── MOBILE-004_FEATURE_MAPPING.md            ← Reference (feature details)
└── MOBILE-000_OVERVIEW.md                   ← This file (quick start)
```

---

## ✅ Approval Checklist

Before starting Phase 1, confirm:

- [ ] All team members have read this overview
- [ ] Expo account created and credentials collected
- [ ] Supabase environment variables available
- [ ] Project leader assigned
- [ ] Development timeline approved (7-10 days)
- [ ] Testing resources allocated
- [ ] Deployment infrastructure ready (EAS account linked)
- [ ] Go/No-Go decision made

---

## 🎉 Ready to Launch!

You have everything needed to build a **production-ready mobile app** that matches your web application's functionality while delivering a **native mobile experience**.

**Next Step**: Provide Expo credentials → Start Phase 1 → Follow the execution checklist

---

**Document Status**: ✅ COMPLETE & READY FOR EXECUTION  
**Created**: 2026-05-27  
**Version**: 1.0  

**Questions?** Refer to the detailed documents (MOBILE-001 through MOBILE-004) or contact the development lead.

---

**End of Overview**
