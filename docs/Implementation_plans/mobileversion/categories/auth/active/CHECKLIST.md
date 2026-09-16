# MOBILE-011 — Implementation Execution Checklist

**Project:** One Expo app — Login as Customer / Login as Staff  
**Plan:** [MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md](MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)  
**Created:** 2026-09-15  
**Last Updated:** 2026-09-16 — bodyshop visual/workflow lock; Phase 3 screens coded in Expo  
**Status:** In Progress  

Legend: `[ ]` pending · `[x]` done · `N/A` skipped with note

---

## PHASE 0: REMOVE CLIENT `service_role`

- [x] **0.1** N/A — Do not rotate Supabase `service_role` in the dashboard (product decision 2026-09-16)
- [x] **0.2** N/A — Do not require the old JWT to be rejected in dashboard
- [x] **0.3** Remove hardcoded key + `VITE_SUPABASE_SERVICE_KEY` from `bodyshop/src/lib/supabase.ts` (done 2026-09-16)
- [x] **0.3b** Remove service-role values from tracked `bodyshop/.env` (done 2026-09-16; anon key left empty)
- [x] **0.4** Repo grep: no `SERVICE_KEY` / `service_role` JWT in `bodyshop/`, `mobile/src`, `src/lib/supabase.ts` (2026-09-16)
- [x] **0.5** `mobile/src/lib/supabase.ts` and `src/lib/supabase.ts` remain anon-only
- [ ] **0.6** Optional evidence note (no rotation report)

---

## PHASE 1: DATABASE + WEB CUTOVER

### Pre-flight
- [x] **1.0** Re-grep dump: no `customer_profiles`, `customer_sessions`, `CREATE FUNCTION public.customer_` (2026-09-16)
- [x] **1.0b** Confirm `users_role_check` still `admin|manager|staff|viewer|driver`
- [x] **1.0c** Confirm reception/vehicles/bodyshop staff RLS is `TO authenticated`; drop the 2026-09-15 anon public-select policy in this migration

### Schema
- [x] **1.1** Migration `customer_profiles` (phone unique, 10-digit check, nullable `auth_user_id`)
- [x] **1.2** Migration `customer_sessions` (token_hash, expiry, revoke)
- [x] **1.3** RLS enabled; no table GRANT to `anon`

### RPCs
- [x] **1.4** `customer_start_session` written in `20260916120000_mobile_011_customer_sessions.sql`
- [x] **1.4b** `customer_list_my_vehicles`
- [x] **1.5** `customer_end_session`
- [x] **1.6** `customer_get_active_job`
- [x] **1.7** `customer_get_service_history`
- [x] **1.8** `customer_submit_complaint` / `customer_submit_feedback` (`customer_portal_concern` / `customer_portal_feedback`)
- [x] **1.9** `customer_list_estimates` / `customer_set_estimate_decision`
- [x] **1.10** `customer_get_gate_pass` — null if not issued
- [ ] **1.10b** Apply `20260916123000`: `customer_get_settlement`, `customer_submit_booking`, `customer_get_repair_card`, complaint KM write-back
- [x] **1.11** GRANT EXECUTE to `anon` on session RPCs; 10 attempts / 15 min per phone key
- [x] **1.12** Staff JWT rejected via `customer_reject_staff_jwt`

### Web cutover
- [x] **1.13** `authenticateCustomer` calls `customer_start_session`
- [x] **1.14** LoginPage customer mode: both fields mobile
- [x] **1.15** Removed `?reg=` / `?phone=` auto-login

### Verify
- [x] **1.16** Applied in SQL editor 2026-09-16 (`20260916120000` + helper revoke `20260916121500`)
- [ ] **1.17** Refresh `supabase/backups/full_metadata.sql`
- [x] **1.18** Started `../evidence/MOBILE-011_TEST_MATRIX.md`
- [ ] **1.19** Evidence: `../evidence/MOBILE-011_PHASE1_RPCS.md`

---

## PHASE 2: EXPO SHELL

- [x] **2.1** `(audience)/index.tsx` — Login as Customer / Login as Staff
- [x] **2.2** `(customer-auth)/login.tsx` — username=mobile, password=mobile → `customer_start_session`
- [x] **2.3** `(customer)/_layout.tsx` — requires customer session
- [x] **2.4** `mobile/src/app/index.tsx` routes by audience
- [x] **2.5** Staff `(auth)/_layout.tsx` does not send customer sessions to `/(tabs)/home`
- [x] **2.6** Staff `(tabs)/_layout.tsx` rejects missing staff session
- [x] **2.7** `CustomerSessionContext` + SecureStore for token
- [x] **2.8** Hide or invite-gate `signup.tsx`; customer path has no staff sign-up
- [ ] **2.9** Device/sim: C-04, C-05, C-10
- [ ] **2.10** Staff email login regression
- [ ] **2.11** Evidence: `../evidence/MOBILE-011_PHASE2_SHELL.md`

---

## PHASE 3: CUSTOMER SCREENS (BODYSHOP PARITY)

- [x] **3.1** `mobile/src/lib/api/customerPortal.ts` wrappers only (no `.from(workshop_table)` in screens)
- [x] **3.2** Dashboard from `customer_list_my_vehicles` + `customer_get_active_job` (hero, action tiles, workshop record, advisor card)
- [x] **3.3** Complaint — multi-problem + KM + notes
- [x] **3.4** Estimate — table/totals/approve-reject when RPC returns real rows; empty if none
- [x] **3.5** Invoices / bills — settlement math on workshop figures only
- [x] **3.6** Gate pass — pending if null; QR only if workshop `qr_token`; no security-mode fake exit
- [x] **3.7** Feedback — stars + tags
- [x] **3.8** Multi-vehicle picker
- [x] **3.8b** Book service (`booking.tsx`) + repair tracker (`tracker.tsx`) from dashboard (hidden tabs)
- [x] **3.9** Do not copy `bodyshop/src` DOM, sandbox credentials, `parts_pricing.json`, or client-made QR
- [ ] **3.10** C-08, C-09, C-09b, C-09c, C-13–C-16 on device
- [ ] **3.11** Browser/web portal still works via same login RPCs
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
