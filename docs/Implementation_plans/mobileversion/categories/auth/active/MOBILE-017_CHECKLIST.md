# MOBILE-017 — Implementation Execution Checklist

**Project:** Customer session & terms resilience (no OTP)  
**Plan:** [MOBILE-017_CUSTOMER_SESSION_TERMS_RESILIENCE_PLAN.md](MOBILE-017_CUSTOMER_SESSION_TERMS_RESILIENCE_PLAN.md)  
**Created:** 2026-10-31  
**Status:** In Progress (code + migration drafted 2026-10-31; DB apply + OTA pending)  

Legend: `[ ]` pending · `[x]` done · `N/A` skipped with note

---

## PRE-FLIGHT

- [ ] **0.1** Product sign-off on PD-1–PD-5 (sliding TTL, revoke siblings, returnTo terms)
- [ ] **0.2** Re-grep `full_metadata.sql`: `customer_start_session`, `customer_lookup_session_row`, `customer_accept_terms` match plan assumptions
- [ ] **0.3** Confirm no OTP / Auth customer work in scope (grep plan + migration for `otp`, `auth.users` customer audience)

---

## PHASE 1: DATABASE

- [x] **1.1** Add **DBL-0092** row to `docs/shared/reference/DB_CHANGE_LEDGER.md` (PROPOSED)
- [x] **1.2** Migration: `customer_touch_session(p_session_token)` — `20261031103000_customer_session_touch_mobile_017.sql`
- [x] **1.3** Migration: sliding `expires_at` update logic + 7-day cap (per PD-1)
- [x] **1.4** Migration: revoke sibling sessions in `customer_start_session` (PD-2)
- [x] **1.5** GRANT EXECUTE on `customer_touch_session` to `anon`, `authenticated`, `service_role`
- [x] **1.6** `supabase/sql_checks/20261031103000_customer_session_touch_checks.sql`
- [ ] **1.7** Apply on linked project; mark ledger APPLIED/VERIFIED
- [ ] **1.8** Refresh metadata backup (per team runbook)

---

## PHASE 2: MOBILE APP

- [x] **2.1** Add `mobile/src/lib/customer/customerSessionGuard.ts`
- [x] **2.2** `CustomerSessionContext`: `touchSession()`, `ensureActiveSession()`, touch after valid bootstrap
- [x] **2.3** AppState debounced `touchSession` when customer token present
- [x] **2.4** `acceptTerms`: touch → accept order
- [x] **2.5** `(customer-auth)/terms.tsx`: focus `ensureActiveSession`; guard on expired
- [x] **2.6** `(customer-auth)/login.tsx`: `returnTo=terms` query param
- [x] **2.7** `(customer)/register-vehicle.tsx`: session guard on focus/submit
- [x] **2.8** Centralize Session expired handling (`customerAuth`, `customerPortal`, `advisorChat`)
- [ ] **2.9** Manual smoke on dev client against linked Supabase

---

## PHASE 3: WEB (OPTIONAL / MINIMAL)

- [ ] **3.1** N/A if web has no terms screen — document “mobile-only terms gate” in plan evidence
- [ ] **3.2** If web adds terms later: reuse same RPCs + profile columns (no duplicate logic)

---

## PHASE 4: VERIFICATION & RELEASE

- [ ] **4.1** Create `evidence/MOBILE-017_TEST_MATRIX.md` from plan §9
- [ ] **4.2** Execute T-01–T-09; record pass/fail + dates
- [ ] **4.3** OTA or store build includes MOBILE-017 + terms expired redirect (≥ c72df0db)
- [ ] **4.4** Support runbook one-liner: “Session expired on terms → sign in again with mobile number; acceptance saves after successful Accept”

---

## OUT OF SCOPE CONFIRMATION

- [ ] **X.1** No `customer_request_otp` / `customer_verify_otp` / Supabase phone auth
- [ ] **X.2** No MOBILE-011 Phase 4 JWT customer migration in this checklist
