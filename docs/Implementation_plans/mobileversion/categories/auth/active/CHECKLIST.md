# MOBILE-011 — Implementation Execution Checklist

**Project:** One Expo app — Login as Customer / Login as Staff  
**Plan:** [MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md](MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)  
**Created:** 2026-09-15  
**Status:** Not Started  

Legend: `[ ]` pending · `[x]` done · `N/A` skipped with note

---

## PHASE 0: SECRET ROTATION

- [ ] **0.1** Rotate Supabase `service_role` in dashboard; store new key only in server secrets
- [ ] **0.2** Verify previous JWT is rejected (REST 401 / JWT invalid)
- [ ] **0.3** Remove hardcoded key + `VITE_SUPABASE_SERVICE_KEY` from `bodyshop/src/lib/supabase.ts`
- [ ] **0.4** Repo grep: `service_role`, `SERVICE_KEY`, `eyJ` fallbacks in `bodyshop/`, `mobile/`, `src/` client files
- [ ] **0.5** Confirm `mobile/src/lib/supabase.ts` and `src/lib/supabase.ts` remain anon-only
- [ ] **0.6** Evidence note: `../evidence/MOBILE-011_PHASE0_SECRET_ROTATION.md`

---

## PHASE 1: DATABASE + WEB CUTOVER

### Pre-flight
- [ ] **1.0** Re-grep dump: no `customer_profiles`, `customer_sessions`, `CREATE FUNCTION public.customer_`
- [ ] **1.0b** Confirm `users_role_check` still `admin|manager|staff|viewer|driver`
- [ ] **1.0c** Confirm reception/vehicles/bodyshop RLS is `TO authenticated` only (no anon policies to copy)

### Schema
- [ ] **1.1** Migration `customer_profiles` (phone unique, 10-digit check, nullable `auth_user_id`)
- [ ] **1.2** Migration `customer_sessions` (token_hash, expiry, revoke)
- [ ] **1.3** RLS enabled; no table GRANT to `anon`

### RPCs
- [ ] **1.4** `customer_start_session` — both username and phone required; match same row; hashed token; generic error
- [ ] **1.5** `customer_end_session`
- [ ] **1.6** `customer_get_active_job` — no invented warranty/AMC/prices
- [ ] **1.7** `customer_get_service_history`
- [ ] **1.8** `customer_submit_complaint` / `customer_submit_feedback` (explicit `mode`; do not silently overwrite CRE bot rows)
- [ ] **1.9** `customer_list_estimates` / `customer_set_estimate_decision`
- [ ] **1.10** `customer_get_gate_pass` — null if not issued
- [ ] **1.11** GRANT EXECUTE as per plan §7; rate-limit start-session
- [ ] **1.12** Staff JWT rejected by customer RPCs

### Web cutover
- [ ] **1.13** `src/lib/api/customer.ts` uses RPCs (no privileged client, no passwordless success-on-any-hit)
- [ ] **1.14** `src/pages/LoginPage.tsx` customer mode uses the same RPC
- [ ] **1.15** Remove or gate `src/App.tsx` `?reg=` / `?phone=` auto-login

### Verify
- [ ] **1.16** Apply migrations; run sql-checks
- [ ] **1.17** Refresh `supabase/backups/full_metadata.sql`
- [ ] **1.18** Start `../evidence/MOBILE-011_TEST_MATRIX.md` (C-01, C-02, C-03, C-06, C-07, C-11)
- [ ] **1.19** Evidence: `../evidence/MOBILE-011_PHASE1_RPCS.md`

---

## PHASE 2: EXPO SHELL

- [ ] **2.1** `(audience)/index.tsx` — Login as Customer / Login as Staff
- [ ] **2.2** `(customer-auth)/login.tsx` — calls `customer_start_session`
- [ ] **2.3** `(customer)/_layout.tsx` — requires customer session
- [ ] **2.4** `mobile/src/app/index.tsx` routes by audience
- [ ] **2.5** Staff `(auth)/_layout.tsx` does not send customer sessions to `/(tabs)/home`
- [ ] **2.6** Staff `(tabs)/_layout.tsx` rejects missing staff session
- [ ] **2.7** `CustomerSessionContext` + SecureStore for token
- [ ] **2.8** Hide or invite-gate `signup.tsx`; customer path has no staff sign-up
- [ ] **2.9** Device/sim: C-04, C-05, C-10
- [ ] **2.10** Staff email login regression
- [ ] **2.11** Evidence: `../evidence/MOBILE-011_PHASE2_SHELL.md`

---

## PHASE 3: CUSTOMER SCREENS

- [ ] **3.1** `mobile/src/lib/api/customerPortal.ts` wrappers only (no `.from(workshop_table)` in screens)
- [ ] **3.2** Dashboard from `customer_get_active_job`
- [ ] **3.3** Complaint
- [ ] **3.4** Estimate (empty state if none)
- [ ] **3.5** Invoices / bills
- [ ] **3.6** Gate pass (hidden/disabled if null)
- [ ] **3.7** Feedback
- [ ] **3.8** Multi-vehicle picker
- [ ] **3.9** Do not copy `bodyshop/src/pages/*` or sandbox quick-test credentials onto production UI
- [ ] **3.10** C-08, C-09
- [ ] **3.11** Browser/web portal still works via same RPCs
- [ ] **3.12** Evidence: `../evidence/MOBILE-011_PHASE3_SCREENS.md`

---

## PHASE 4: OTP

- [ ] **4.1** `customer_request_otp` / `customer_verify_otp`
- [ ] **4.2** Server sets `app_metadata.audience = 'customer'`
- [ ] **4.3** Link `customer_profiles.auth_user_id`; **no** `public.users` insert
- [ ] **4.4** Customer RPCs accept customer JWT; reject staff JWT
- [ ] **4.5** Wire SMS or WhatsApp
- [ ] **4.6** C-12
- [ ] **4.7** Refresh `full_metadata.sql`
- [ ] **4.8** Evidence: `../evidence/MOBILE-011_PHASE4_OTP.md`

---

## PHASE 5: RELEASE

- [ ] **5.1** Store listing copy: customers and authorised workshop staff
- [ ] **5.2** Customer mode never requests background location
- [ ] **5.3** EAS OTA (and native build if required)
- [ ] **5.4** Device smoke: both audiences on one install
- [ ] **5.5** Mark `bodyshop/` do-not-ship; do not submit `com.techwheels.bodyshop`
- [ ] **5.6** Confirm no `service_role` in client bundles
- [ ] **5.7** Update mobile INDEX + IMPLEMENTATION_TRACKER + MOBILE-010 when verified Done
- [ ] **5.8** Evidence: `../evidence/MOBILE-011_PHASE5_RELEASE.md`

---

## CLOSEOUT

- [ ] Plan §13 success criteria all true
- [ ] Durable rules promoted to `docs/mobile/` or `docs/shared/` only after archive
