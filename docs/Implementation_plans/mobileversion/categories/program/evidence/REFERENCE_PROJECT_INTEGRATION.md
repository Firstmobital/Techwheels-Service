# Reference Project Integration - Key Insights & Updates

**Date**: May 27, 2026  
**Reference Project**: TECHWHEELS-WEB-(OtherProject)  
**Status**: ✅ Integrated into mobile implementation docs

---

## 🎯 Reference Project Overview

The reference project (OtherProject) is an **existing, production-deployed Techwheels mobile + web hybrid** that provides real-world patterns and proven configurations we can directly apply.

### Reference Project Architecture
- ✅ **Monorepo**: Web + `/mobile` subfolder (same pattern)
- ✅ **Expo Deployed**: Currently running on Android & iOS
- ✅ **State Management**: Zustand with persist middleware
- ✅ **Supabase Backend**: Same architecture as current project
- ✅ **Google Drive Integration**: Document offload pattern
- ✅ **EAS Build**: Automated APK/IPA builds with OTA updates

---

## 📊 Key Insights Integrated into Your Plan

### 1. **Proven Tech Stack** ✅
**What was updated:**
- Expo version: `54.0.33` (stable, proven in production)
- Expo Router: `6.0.23` (supports grouped routes)
- React Native: `0.81.5` (latest stable)
- Zustand: `^5.0.8` (state management, not Redux)

**Where integrated:**
- MOBILE-001: Phase 1.4 (Core Dependencies section)
- MOBILE-002: Phase 1.3 (Installation checklist)

**Benefit**: Using battle-tested versions reduces compatibility issues

---

### 2. **Zustand State Management** ✅
**Pattern from reference project:**
```ts
// store/jobCardStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const useJobCardStore = create<JobCardState>(
  persist((set) => ({...}), {
    name: 'job-card-store',
    storage: AsyncStorage,
  })
)
```

**Why this matters:**
- ✅ Lighter than Redux
- ✅ Better TypeScript support
- ✅ Persist middleware survives app restarts
- ✅ Proven in production (ref project)

**Where integrated:**
- MOBILE-001: Phase 2.4 (State Management Layer)
- MOBILE-002: Phase 2.3 (Zustand checklist)

---

### 3. **Dynamic Configuration (app.config.js)** ✅
**From reference project pattern:**
```js
// app.config.js - NOT static app.json
const envValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

module.exports = ({ config }) => ({
  ...config,
  name: 'Techwheels',
  extra: {
    supabaseUrl: envValue('EXPO_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: envValue('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  },
})
```

**Why this matters:**
- ✅ Environment variables loaded at build time (secure)
- ✅ Different configs for dev/preview/prod
- ✅ No hardcoding credentials
- ✅ Works with CI/CD pipelines

**Where integrated:**
- MOBILE-001: Phase 1.7 (Dynamic Configuration)

---

### 4. **OTA Release Commands** ✅
**From reference project (proven workflow):**
```bash
npm run ota:prod -- --message "Fix import bug"
npm run ota:preview -- --message "Testing new charts"
npm run build:prod:apk  # Fresh APK
npm run build:preview:apk  # QA builds
```

**Reference Project npm scripts:**
```json
{
  "ota:prod": "CI=1 eas update --branch production --platform android",
  "ota:preview": "CI=1 eas update --branch preview --platform android",
  "build:prod:apk": "eas build -p android --profile production"
}
```

**Where integrated:**
- MOBILE-001: Phase 7 (APK Bundling & Deployment)
- MOBILE-002: Phase 7 (EAS commands checklist)

**Benefit**: Ready-to-copy commands for daily releases

---

### 5. **Metro Config Optimization** ✅
**From reference project:**
```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const config = getDefaultConfig(__dirname)
config.transformer.minifierConfig = {
  compress: { passes: 2 },
  mangle: true,
}
module.exports = config
```

**Benefit**: Smaller APK, faster metro bundler

---

### 6. **Utils Layer Pattern** ✅
**From reference project structure:**
```
src/utils/
├── insurance.js (calculations)
├── pricing.js (pricing logic)
├── pdf.js (PDF export)
├── uploadToDrive.js (Google Drive integration)
└── csv.js (CSV import/export)

mobile/lib/utils/
├── insuranceCalculations.ts (SAME as web)
├── pricingHelpers.ts (SAME as web)
├── uploadToGoogleDrive.ts (Mobile-specific Edge Function call)
└── (other utilities - SHARED)
```

**Why this matters:**
- ✅ Business logic reused between web/mobile
- ✅ Easy to maintain calculations
- ✅ No duplication

**Where integrated:**
- MOBILE-001: Phase 2.4 (Utils Layer)
- MOBILE-002: Phase 2.6 (Utils checklist)

---

### 7. **Google Drive Document Offload** ✅
**From reference project (production proven):**

**Flow:**
1. User captures photo via Expo Camera
2. **Upload to Supabase Storage** (temporary)
3. **Trigger Edge Function**: `universal-document-upload`
4. Edge Function:
   - Downloads from Supabase
   - Uploads to **Google Drive** (permanent)
   - Returns Google Drive URL
   - Updates database with URL
   - Cleans up Supabase Storage
5. **Mobile database** has Google Drive links (matches web format)

**SQL (Edge Function stores):**
```sql
UPDATE documents 
SET drive_url = $1, storage_path = $2 
WHERE id = $3
```

**Benefit:**
- ✅ Supabase Storage quota preserved
- ✅ Unlimited Google Drive storage
- ✅ Documents accessible from web console
- ✅ Automatic backup

**Where integrated:**
- MOBILE-004: Photo Handling Details (updated)
- MOBILE-003: Documentation mentions Edge Functions

---

### 8. **Grouped Routes Pattern** ✅
**From reference project app structure:**
```
app/
├── (auth)/  ← Auth flows (login, signup, reset)
│   ├── _layout.tsx (Stack navigation)
│   ├── login.tsx
│   ├── signup.tsx
│   └── reset-password.tsx
├── (main)/  ← Authenticated screens (with tabs)
│   ├── _layout.tsx (Bottom tab navigation)
│   ├── index.tsx (Dashboard)
│   ├── import/index.tsx
│   ├── reports/[id].tsx
│   ├── autodoc/[id].tsx
│   └── settings/index.tsx
└── _layout.tsx (Root)
```

**Benefit:**
- ✅ Clean layout nesting (auth screens don't show tabs)
- ✅ Authenticated screens all show tabs
- ✅ Easy to add/remove screens
- ✅ Matches reference project pattern

**Where integrated:**
- MOBILE-003: Component Hierarchy section
- MOBILE-001: Phase 4 (Navigation structure)

---

### 9. **Pre-APK Checklist (Web/Mobile Parity)** ✅
**From reference project doc: `PRE_APK_CHECKLIST.md`**

**Pattern:**
| Feature | Web | Mobile | Status |
|---------|-----|--------|--------|
| Quote Save | RPC `create_quote` | Same RPC | ✅ Aligned |
| Document Upload | Supabase + Edge Fn | Same flow | ✅ Aligned |
| Payment | Razorpay SDK | Native SDK | ⚠️ Different approach |

**Application to your project:**
| Feature | Web | Mobile | Status |
|---------|-----|--------|--------|
| Job Card Create | Supabase RPC | Same RPC | ✅ Aligned |
| Photo Upload | Supabase + Edge Fn | Same flow (Drive offload) | ✅ Aligned |
| Report Export | Excel/PPT | PDF | ✅ Aligned |

**Where integrated:**
- MOBILE-004: Feature Mapping section
- MOBILE-002: Phase 6 (Quality gates)

---

### 10. **Environment Management** ✅
**From reference project `.env` pattern:**
```
EXPO_PUBLIC_SUPABASE_URL=https://...supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
EXPO_PUBLIC_ADMIN_WEB_URL=https://admin.techwheels.in
EXPO_PUBLIC_AWS_REGION=ap-south-1
EXPO_PUBLIC_AWS_ACCESS_KEY_ID=AKIA...
```

**Where integrated:**
- MOBILE-001: Phase 1.6 (.env setup)
- MOBILE-002: Phase 1.6 (Environment checklist)

---

### 11. **Patch-Package for node_modules** ✅
**From reference project:**
```json
{
  "devDependencies": {
    "patch-package": "^8.0.1"
  }
}
```

**Usage:**
```bash
npm install package-name-with-issue
# Make fixes in node_modules/package-name
npm install -g patch-package
patch-package package-name
git add patches/
```

**Where integrated:**
- MOBILE-002: Phase 1.3 (Dependencies)

---

### 12. **Logging Infrastructure** ✅
**From reference project structure:**
```
mobile/
├── mobile_logs/  ← Log files stored here
├── scripts/
│   └── sync_logs.js  ← Sync logs to backend
```

**npm script:**
```json
{
  "sync:logs": "node scripts/sync_logs.js"
}
```

**Benefit**: Track app events, crashes, user flows

---

## 📝 Summary of Changes

### Documents Updated
1. ✅ **MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md**
   - Phase 1.4: Proven tech stack with versions
   - Phase 1.7: Dynamic configuration (app.config.js)
   - Phase 2.4: Zustand state management
   - Phase 2.4: Utils layer pattern
   - Phase 7: OTA release commands

2. ✅ **MOBILE-002_EXECUTION_CHECKLIST.md**
   - Phase 1.3: Proven dependencies with versions
   - Phase 1.5: Dynamic configuration checklist
   - Phase 2.1-2.7: Zustand, utils, utils pattern
   - Phase 7: EAS commands

3. ✅ **MOBILE-003_ARCHITECTURE.md**
   - State management: Added Zustand pattern
   - Component Hierarchy: Updated with grouped routes
   - Data flow: Mentioned Edge Functions

4. ✅ **MOBILE-004_FEATURE_MAPPING.md**
   - Photo Handling: Added Google Drive offload pattern
   - Document flow: Updated with Edge Function details

---

## 🚀 How to Use Reference Project Insights

### 1. **Copy Reference Project Files** (Optional)
If you need exact patterns, you can reference:
- `/local_folder/Reference/OtherGithubRepo/TECHWHEELS-WEB-(OtherProject)/mobile/app.config.js`
- `/local_folder/Reference/OtherGithubRepo/TECHWHEELS-WEB-(OtherProject)/eas.json`
- `/local_folder/Reference/OtherGithubRepo/TECHWHEELS-WEB-(OtherProject)/mobile/OTA_RELEASE_GUIDE.md`

### 2. **Follow the Proven Patterns**
- Use Zustand for state management (tested)
- Use dynamic app.config.js (secure, flexible)
- Use Google Drive for document offload (scalable)
- Use grouped routes (clean architecture)

### 3. **Adapt for Your Techwheels Service Needs**
- Reference project: Quote configurator + booking
- Your project: Job cards + import + reports + AutoDoc
- Same patterns, different domains

---

## ✅ Integration Checklist

- [x] Analyzed reference project structure
- [x] Extracted best practices
- [x] Updated tech stack recommendations
- [x] Added Zustand state management
- [x] Added app.config.js pattern
- [x] Added OTA release commands
- [x] Added Google Drive integration details
- [x] Added grouped routes pattern
- [x] Updated all 4 main implementation docs
- [x] Created this integration summary

---

## 📌 Next Steps

1. **Review the updated documents** with your team
2. **Discuss tech choices** (Zustand, app.config.js, Google Drive)
3. **Adapt reference patterns** to your project needs
4. **Start Phase 1** with the proven tech stack
5. **Reference OTA_RELEASE_GUIDE.md** during deployment

---

## 🎯 Key Takeaway

Your reference project provides **real-world, production-deployed patterns** that have been tested with:
- ✅ Multiple mobile features
- ✅ Real users on Android & iOS
- ✅ Production deployment experience
- ✅ OTA update workflows
- ✅ Edge Function integrations

**Use these patterns to accelerate your Techwheels Service mobile implementation!**

---

**Integration Status**: ✅ COMPLETE  
**Documents Updated**: 4/6 main docs  
**Reference Project Insights**: 12 key patterns integrated  
**Ready to Execute**: Yes ✅

