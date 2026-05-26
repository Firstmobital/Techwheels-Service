# RC Lookup Edge Function (invoke-ocean025) - AutoDoc Integration Plan

## Objective

For AutoDoc Vehicle Lookup in this project:

1. First try local vehicle master (`public.vehicles`) by registration number.
2. If not found, call the local RC lookup edge function (`invoke-ocean025`) in this same project.
3. Use the edge function output / persisted `public.rto_cache` row fields to prefill AutoDoc intake form fields wherever a valid mapping exists.

## Scope Implemented In This Repo

1. Frontend fallback logic in AutoDoc lookup flow.
2. Frontend RC lookup API helper for local function invocation.
3. Updated migration for `public.rto_cache` with project-appropriate policies/grants.
4. New edge function `supabase/functions/invoke-ocean025/index.ts` with cache-first behavior.

## Runtime Configuration

Set these function secrets in this project Supabase Edge Function config:

1. `INVINCIBLE_OCEAN_CLIENT_ID` — required
2. `INVINCIBLE_OCEAN_SECRET_KEY` — required
3. `INVINCIBLE_OCEAN_BASE_URL` (optional, default: `https://api.invincibleocean.com/invincible`)

Frontend config:

1. `VITE_RC_LOOKUP_FUNCTION_NAME` (optional, default: `invoke-ocean025`)

## Lookup Flow (AutoDoc)

1. User clicks Fetch from DB.
2. App resolves registration reference.
3. App queries local `public.vehicles`.
4. If local vehicle exists: prefill from local vehicle master.
5. If local vehicle does not exist: call local edge function `invoke-ocean025` with:
   - `vehicleNumber`: normalized registration number
   - `consent`: `Y`
6. Edge function behavior:
   - check `public.rto_cache` first
   - if cache miss/expired, call provider API
   - persist/refresh row in `public.rto_cache`
7. If RC lookup returns data: prefill mapped fields from RTO cache shape.
8. If RC lookup returns no data: keep manual entry path.

## Field Mapping Audit (RTO Cache -> AutoDoc Form)

Applied mappings:

1. `registration_no` / `api_rc_reg_no` / `api_rc_vehicle_number` -> Registration No
2. `api_rc_chassis` / `api_rc_chassis_number` -> VIN / Chassis No
3. `api_rc_model` / `api_rc_vehicle_class` / `api_rc_vehicle_manufacturer_name` -> Model
4. `api_rc_vehicle_manufacturing_month_year` / `api_rc_reg_date` -> Year (extract first 4-digit year)
5. `api_rc_vehicle_colour` -> Colour
6. `api_rc_owner` -> Owner Name
7. `api_rc_mobile_number` -> Owner Phone (digits only, max 10)
8. `api_rc_reg_authority` -> Dealer City (best-effort)
9. `api_rc_reg_date` -> Date of Sale (normalized to `YYYY-MM-DD` when parseable)

No reliable mapping currently available:

1. Paint Type
2. B&P City Category
3. Dealer Code

## Migration Reference

Migration file:

1. `supabase/migrations/20260526140500_create_rto_cache_for_rc_lookup.sql`

The table shape is compatible with RC lookup response persistence while tightening baseline access posture for this project.

## Validation Checklist

1. Local vehicle exists: prefill from `vehicles` without RC call.
2. Local vehicle missing + RC hit: form prefills from mapped RTO cache fields.
3. Local vehicle missing + RC miss: user sees manual-entry path.
4. RC function error: surfaced as lookup error in UI.
5. `public.rto_cache` has unique normalized registration behavior and required indexes.

---

## ✅ Progress Tracker

### Completed ✓

| Component | Status | Notes |
|-----------|--------|-------|
| **Edge Function** (`invoke-ocean025`) | ✅ Deployed | supabase/functions/invoke-ocean025/index.ts — fully implemented with cache-first logic, TTL, stale-fallback, robust payload parsing |
| **Secrets Configuration** | ✅ Set | INVINCIBLE_OCEAN_CLIENT_ID, INVINCIBLE_OCEAN_SECRET_KEY, INVINCIBLE_OCEAN_BASE_URL, INVINCIBLE_OCEAN_RC_PATH, RTO_CACHE_TTL_HOURS=48 |
| **RC Lookup API Helper** | ✅ Created | src/lib/api/rcLookup.ts — fetchVehicleFromRcLookup() with type-safe ApiResult<RtoCacheLookupRow \| null> |
| **RC Lookup Export** | ✅ Exported | src/lib/api/index.ts — barrel export for rcLookup module |
| **AutoDoc Form Fallback** | ✅ Integrated | src/pages/AutoDocPage.tsx — handleVehicleLookup() with 9 audited field mappings + normalization |
| **RTO Cache Table Migration** | ✅ Applied | supabase/migrations/20260526140500_create_rto_cache_for_rc_lookup.sql — table, indexes, RLS policies, triggers created |
| **Documentation** | ✅ Updated | docs/Implementation_plans/RC_LOOKUP_EDGE_FUNCTION_IMPLEMENTATION_PLAN.md — rewritten for local in-project context |
| **Type Validation** | ✅ Passed | No TypeScript errors on rcLookup.ts or AutoDocPage.tsx |
| **Function Deployment** | ✅ Verified | Curl test confirms function is callable and properly routes requests |
| **Provider Connectivity** | ✅ Verified | Endpoint `/vehicleRcV6` confirmed working; tested with RJ14CR1912 registration; full vehicle data returned |

### Pending ⏳

| Item | Dependency | Next Step |
|------|-----------|-----------|
| **End-to-End UI Testing** | Function deployed, provider verified | Test full flow in AutoDoc with vehicle not in local DB; verify form prefills correctly and RC toast displays |
| **Cache Hit Scenario** | Provider connectivity confirmed ✅ | Test cache expiry behavior (first call hits provider API, second call within TTL returns from rto_cache) |
| **Error Handling Validation** | UI test in progress | Test edge cases: malformed input, provider timeout, stale cache fallback |

### Known Issues / Notes

- **Schema Authority**: full_database.sql is authoritative; migration file created with IF NOT EXISTS safety check.
- **RBAC Module**: Policies reference `'autodoc'` module with `has_rbac_right()` checks; verify your RBAC role matrix includes autodoc module grants.
- **Provider Endpoint**: Uses `/vehicleRcV6` (not `/all-rto-data`). Headers: `secretKey` and `clientId` (not `x-client-id`/`x-secret-key`).
- **Provider Status**: ✅ Verified working — tested 2026-05-26 with RJ14CR1912, returned full vehicle data.

---
