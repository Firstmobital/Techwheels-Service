# MOBILE-011 — Phase Tracking

**Implementation Plan:** MOBILE-011  
**Last Updated:** 2026-09-15  
**Total Phases:** 6 (0–5)  
**Current Progress:** 0/6 (0%)  
**Status:** Not Started  

Authority: [MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md](MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)  
Execution checklist: [CHECKLIST.md](CHECKLIST.md)  
Pre-plan audit: [MOBILE-011 audit](../../program/evidence/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_AUDIT_2026-09-15.md)

---

## Phase Overview

| Phase | Name | Duration | Status | Completion % |
|-------|------|----------|--------|--------------|
| 0 | Secret rotation | 0.5 day | ⏳ Not Started | 0% |
| 1 | Customer RPCs + web cutover | ~1 week | ⏳ Not Started | 0% |
| 2 | Expo audience shell + staff signup lock | ~1 week | ⏳ Not Started | 0% |
| 3 | Customer screens (port web portal) | ~1.5–2 weeks | ⏳ Not Started | 0% |
| 4 | Phone OTP | ~1 week | ⏳ Not Started | 0% |
| 5 | Release, OTA, archive `bodyshop/` | ~3–5 days | ⏳ Not Started | 0% |

**Overall Progress: 0%**

---

## Phase 0: Secret Rotation

**Goal:** Remove the leaked privileged key from every client. Customer prototype must not be installable with it.

### Deliverables
- [ ] Rotate Supabase `service_role` in the project dashboard
- [ ] Confirm the old JWT is rejected
- [ ] Delete hardcoded key and `VITE_SUPABASE_SERVICE_KEY` usage from `bodyshop/src/lib/supabase.ts`
- [ ] Grep repo for other client-side `service_role` / service-key fallbacks (`bodyshop/`, `mobile/`, `src/`)
- [ ] `bodyshop` uses anon key only, or is marked do-not-run until archive

### Success Criteria
- [ ] No `service_role` JWT in any client source
- [ ] Staff Expo still signs in with anon key
- [ ] Evidence note in `../evidence/` (create folder with first evidence file)

### Dependencies
- None. Production blocker. May run during MOBILE-BP-RD work.

---

## Phase 1: Customer RPCs + Web Cutover

**Goal:** Database can prove a phone owns a vehicle and return only that customer’s payload. Web customer login stops direct table reads.

### Deliverables
- [ ] Re-grep `full_metadata.sql` for `customer_profiles` / `customer_sessions` / `customer_*` functions (must still be absent)
- [ ] Migration: `customer_profiles`, `customer_sessions`, indexes, RLS enabled, no `anon` table GRANT
- [ ] RPCs per plan §7 (`customer_start_session` … `customer_get_gate_pass`)
- [ ] Generic error on mismatch; exact 10-digit phone; no `endsWith`
- [ ] Rate limit on start-session
- [ ] Web `src/lib/api/customer.ts` + `LoginPage` customer mode call RPCs
- [ ] Remove `?reg=` auto-login in `src/App.tsx` (or require RPC session)
- [ ] Apply to target DB; refresh `supabase/backups/full_metadata.sql`
- [ ] Test matrix file started: `../evidence/MOBILE-011_TEST_MATRIX.md`

### Success Criteria
- [ ] C-01, C-02, C-03, C-06, C-07, C-11 pass
- [ ] `public.users_role_check` unchanged
- [ ] Staff reception RLS still denies a customer token doing `.from('service_reception_entries').select()`

### Dependencies
- Phase 0 complete (do not build customer UI on a leaked key)

---

## Phase 2: Expo Audience Shell + Staff Signup Lock

**Goal:** One binary, two doors. Routing by audience.

### Deliverables
- [ ] `(audience)/index.tsx` chooser: Login as Customer / Login as Staff
- [ ] `(customer-auth)/login.tsx` (reg + phone → `customer_start_session`)
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

**Goal:** Port web `CustomerPortalPage` behavior into Expo. RPC-only. No invented fields.

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

## Phase 4: Phone OTP

**Goal:** Replace phone-as-secret with proof the customer received a code on `owner_phone`.

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
