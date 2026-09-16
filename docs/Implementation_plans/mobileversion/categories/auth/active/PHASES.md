# MOBILE-011 — Phase Tracking

**Implementation Plan:** MOBILE-011  
**Last Updated:** 2026-09-16  
**Total Phases:** 6 (0–5)  
**Current Progress:** 1/6 phases complete; 1–3 coded, awaiting DB apply + device smoke  
**Status:** In Progress  

Authority: [MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md](MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)  
Execution checklist: [CHECKLIST.md](CHECKLIST.md)  
Pre-plan audit: [MOBILE-011 audit](../../program/evidence/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_AUDIT_2026-09-15.md)

---

## Phase Overview

| Phase | Name | Duration | Status | Completion % |
|-------|------|----------|--------|--------------|
| 0 | Remove client `service_role` | 0.5 day | ✅ Done | 100% |
| 1 | Customer RPCs + web cutover | ~1 week | 🟡 In Progress | 80% |
| 2 | Expo audience shell + staff signup lock | ~1 week | 🟡 In Progress | 80% |
| 3 | Customer screens (port web portal) | ~1.5–2 weeks | 🟡 In Progress | 80% |
| 4 | Phone OTP (optional step-up) | ~1 week | ⏳ Not Started | 0% |
| 5 | Release, OTA, archive `bodyshop/` | ~3–5 days | ⏳ Not Started | 0% |

**Overall Progress: 0%**

---

## Phase 0: Remove client `service_role`

**Goal:** Delete the privileged key from the bodyshop client. Do **not** rotate the Supabase dashboard key.

### Deliverables
- [x] N/A — Do not rotate Supabase `service_role` in the dashboard (product decision 2026-09-16)
- [x] Delete hardcoded key and `VITE_SUPABASE_SERVICE_KEY` from `bodyshop/src/lib/supabase.ts` (done 2026-09-16)
- [x] Remove service-role values from tracked `bodyshop/.env` (done 2026-09-16; `VITE_SUPABASE_ANON_KEY` left empty)
- [x] Grep repo: no client `SERVICE_KEY` / `service_role` JWT in `bodyshop/`, `mobile/src`, `src/lib/supabase.ts` (2026-09-16)
- [x] `bodyshop` client is anon-only (env); no service-role fallback

### Success Criteria
- [x] No `service_role` JWT in `bodyshop/` source or `.env`
- [x] Staff Expo / web clients remain anon-only
- [ ] Evidence note in `../evidence/` (optional)

### Dependencies
- None. Dashboard key rotation is out of scope.

---

## Phase 1: Customer RPCs + Web Cutover

**Goal:** Phone=phone login RPC. Web `authenticateCustomer` replaced. Customer data is only that phone’s vehicles.

### Deliverables
- [ ] Re-grep `full_metadata.sql` for `customer_profiles` / `customer_sessions` / `customer_*` functions (must still be absent)
- [ ] Migration: `customer_profiles`, `customer_sessions`, indexes, RLS enabled, no `anon` table GRANT
- [ ] `customer_start_session(username, password)`: both must be the same 10-digit mobile; return **all** vehicles for that phone
- [ ] `customer_list_my_vehicles` + job/history/complaint/estimate/gate-pass RPCs scoped to session phone
- [ ] Generic error on mismatch / unknown phone; no fake vehicle; no `endsWith`
- [ ] Rate limit on start-session
- [ ] Replace `src/lib/api/customer.ts` `authenticateCustomer` with the RPC (same rule on web LoginPage)
- [ ] Remove `?reg=` auto-login in `src/App.tsx`
- [ ] Apply to target DB; refresh `supabase/backups/full_metadata.sql`
- [ ] Test matrix: C-01, C-02, C-02b, C-02c, C-03, C-03b, C-06, C-07, C-11

### Success Criteria
- [ ] C-01, C-02, C-02b, C-02c, C-03, C-03b, C-06, C-07, C-11 pass
- [ ] `public.users_role_check` unchanged
- [ ] Staff reception RLS still denies a customer token doing `.from('service_reception_entries').select()`

### Dependencies
- Phase 0 client key removal (dashboard key is not rotated)

---

## Phase 2: Expo Audience Shell + Staff Signup Lock

**Goal:** One binary, two doors. Routing by audience.

### Deliverables
- [ ] `(audience)/index.tsx` chooser: Login as Customer / Login as Staff
- [ ] `(customer-auth)/login.tsx` (username=password=10-digit mobile → `customer_start_session`)
- [ ] `(customer)/_layout.tsx` empty shell (tabs ok, screens can be placeholders)
- [ ] `index.tsx` / staff auth layout / tabs layout branch on audience
- [ ] Staff `signup.tsx` invite-only or hidden; copy no longer “Join your dealership's service team” on the customer path
- [ ] Customer token stored in SecureStore
- [ ] Deep-link deny: customer ↛ staff tabs; staff ↛ customer

### Success Criteria
- [ ] C-04, C-05, C-10 pass on device or simulator
- [ ] Existing staff email login still reaches `/(tabs)/home`

### Dependencies
- Phase 1 RPCs live on the environment the app points at

---

## Phase 3: Customer Screens

**Goal:** Port web `CustomerPortalPage` behavior into Expo. RPC-only. Phone-scoped vehicle list on every screen.

### Deliverables
- [ ] Dashboard (reg, model, KM if present, service type, advisor, in-service vs delivered)
- [ ] Problem / complaint submit
- [ ] Estimate list + approve/reject when RPC returns real rows
- [ ] Bills / invoice links when paths exist
- [ ] Gate pass only if workshop issued
- [ ] Feedback submit
- [ ] Multi-vehicle picker when session returns more than one reg for that phone
- [ ] `mobile/src/lib/api/customerPortal.ts`
- [ ] Do not import `bodyshop/` pages or `parts_pricing.json` synthetic estimates

### Success Criteria
- [ ] C-08, C-09 pass
- [ ] Feature parity with web portal **data rules** (nulls stay null)
- [ ] Visual polish may follow MOBILE-009; function cannot wait on redesign

### Dependencies
- Phase 2 routing

---

## Phase 4: Phone OTP (optional step-up)

**Goal:** Extra proof the person has the phone. Does **not** change row visibility (still session phone). Not a ship gate for phone=phone login.

### Deliverables
- [ ] `customer_request_otp` / `customer_verify_otp`
- [ ] Create/link `auth.users`; `app_metadata.audience = 'customer'` set **server-side**
- [ ] `customer_profiles.auth_user_id` populated
- [ ] Customer RPCs accept customer JWT; reject staff JWT
- [ ] No insert into `public.users`
- [ ] WhatsApp or SMS vendor wiring (existing WA automations preferred)
- [ ] Refresh `full_metadata.sql`

### Success Criteria
- [ ] C-12 pass
- [ ] Phase 1 token still revocable; new installs use OTP

### Dependencies
- Phase 3 (or Phase 2 if OTP is pulled forward; screens can keep working)

---

## Phase 5: Release + Archive

**Goal:** Customers and staff use the existing EAS app. Capacitor app is not shipped.

### Deliverables
- [ ] Store listing text names both audiences
- [ ] Customer mode does not prompt background location
- [ ] `eas update` (and native build if new permissions/routes require it)
- [ ] `bodyshop/` archived or README do-not-ship; package not submitted
- [ ] Phase evidence + test matrix signed
- [ ] Update MOBILE-010, mobile INDEX, IMPLEMENTATION_TRACKER to Done when verified

### Success Criteria
- [ ] Plan §13 success criteria
- [ ] Device smoke: customer path + staff path on the same install

### Dependencies
- Phase 3 minimum; Phase 4 preferred before public customer marketing
