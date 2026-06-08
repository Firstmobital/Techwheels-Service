# P1-01: Connection Pooling Audit Report

**Date**: 2026-06-08  
**Status**: Complete  
**Objective**: Identify all runtime DB connection consumers and determine pooler URL migration needs

---

## 1) Summary

**Finding**: Application uses REST API only; no direct postgres:// connections in production code.

- **Web app** (src/): Uses Supabase REST API via `VITE_SUPABASE_URL`
- **Mobile app** (mobile/src/): Uses Supabase REST API via `EXPO_PUBLIC_SUPABASE_URL`
- **Edge Functions** (supabase/functions/): All use Supabase SDK (createClient), not direct postgres
- **Scripts** (scripts/): One legacy script `deploy_phase1_migrations.sh` has hardcoded direct postgres URL (port 5432)

**Recommendation**: No urgent pooler migration needed for runtime. Optional: Update deploy script to use pooler URL (port 6543) if script runs frequently.

---

## 2) Connection Points Audit

### 2.1 Web Application (src/)

**Files scanned**: 
- `src/lib/supabase.ts` — Main Supabase client initialization
- `src/lib/api/documents.ts` — Document service API calls
- `src/lib/generators/generatePPT.ts` — PPT generation using Edge Functions
- `src/pages/AutoDocPage.tsx` — Auto-doc page with Supabase integration
- `src/pages/JobCardPage.tsx` — Job card page with Supabase integration
- `src/App.tsx` — Main app configuration

**Connection Method**: Supabase JavaScript SDK via REST API  
**Env Var**: `VITE_SUPABASE_URL`  
**Type**: Client-side (REST/PostgREST)  
**Pooler Status**: ✅ Not applicable — REST API handles pooling server-side

**Key Code**:
```typescript
// src/lib/supabase.ts
const supabaseUrl = viteEnv.VITE_SUPABASE_URL ?? processEnv.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseKey = viteEnv.VITE_SUPABASE_ANON_KEY ?? processEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

const supabase = createClient(supabaseUrl, supabaseKey)
```

---

### 2.2 Mobile Application (mobile/src/)

**Files scanned**:
- `mobile/src/lib/supabase.ts` — Supabase client setup
- `mobile/src/lib/env.ts` — Environment variable reading

**Connection Method**: Supabase JavaScript SDK (Expo-compatible) via REST API  
**Env Var**: `EXPO_PUBLIC_SUPABASE_URL`  
**Type**: Client-side (REST/PostgREST)  
**Pooler Status**: ✅ Not applicable — REST API handles pooling server-side

**Key Code**:
```typescript
// mobile/src/lib/supabase.ts
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)
export const SUPABASE_URL = hasSupabaseEnv ? supabaseUrl : FALLBACK_SUPABASE_URL
```

---

### 2.3 Edge Functions (supabase/functions/)

**Files scanned**:
- `supabase/functions/estimate-export-data/index.ts`
- `supabase/functions/document-link-upsert/index.ts`
- `supabase/functions/drive-file-export/index.ts`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/invoke-ocean025/index.ts`
- `supabase/functions/_shared/audit.ts`
- `supabase/functions/autodoc-sync-panels/index.ts`
- `supabase/functions/universal-drive-upload/index.ts`
- `supabase/functions/estimate-rows-insert/index.ts`

**Connection Method**: Supabase SDK createClient (9 functions, all REST API based)  
**Env Vars**: `SUPABASE_URL`, `SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`)  
**Type**: Server-side (Edge Function) via REST API  
**Pooler Status**: ✅ Not applicable — REST API handles pooling server-side

**Pattern**:
```typescript
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
// Then use REST API for data operations
```

---

### 2.4 Scripts (scripts/)

**Direct Postgres Connection Found** ⚠️:

**File**: `scripts/deploy_phase1_migrations.sh`  
**Connection String**: 
```
postgresql://postgres:Y00786%40supabase@db.tnakgaoqyumgfxklkujl.supabase.co:5432/postgres
```

**Current**: Direct mode (port 5432)  
**Pooler Alternative**: Port 6543 with pgBouncer  
**Status**: Legacy script, not used in production CI/CD  
**Impact**: Low — only used for manual one-time deployments

**Recommendation**:
- If this script is run frequently/repeatedly: Switch to pooler URL (port 6543)
- If this script is one-time only: No change needed

---

## 3) Port Reference

| Mode | Port | Use Case |
|------|------|----------|
| Direct | 5432 | One-off scripts, migrations, admin tasks |
| Pooler | 6543 | Long-running apps with many concurrent connections |

**Techwheels-Services Status**:
- Production apps: REST API (no direct connections)
- Scripts: Direct mode acceptable for low-frequency use

---

## 4) Action Items

### For Web/Mobile Apps: ✅ No Action Required
- Apps use REST API through Supabase SDK
- Pooling is handled by Supabase infrastructure
- No code changes needed

### For Edge Functions: ✅ No Action Required
- All edge functions use REST API (Supabase SDK)
- Pooling is handled server-side
- No code changes needed

### For Scripts (Optional): ⚠️ Optional Update
**If deploy script is used frequently:**
```bash
# Change port from 5432 to 6543
postgresql://postgres:Y00786%40supabase@db.tnakgaoqyumgfxklkujl.supabase.co:6543/postgres
```

**Status**: Recommend documenting pooler URL availability, but not urgent since script is rarely used.

---

## 5) Conclusion

**P1-01 Finding**: No critical pooler migration needed.

- ✅ Web app: REST API only (pooling built-in)
- ✅ Mobile app: REST API only (pooling built-in)  
- ✅ Edge Functions: REST API only (pooling built-in)
- ⚠️ Scripts: Direct connection available but low-usage (optional pooler update)

**Next Step**: Move to P1-03 (query performance analysis) as direct connection pooling is not a bottleneck.
