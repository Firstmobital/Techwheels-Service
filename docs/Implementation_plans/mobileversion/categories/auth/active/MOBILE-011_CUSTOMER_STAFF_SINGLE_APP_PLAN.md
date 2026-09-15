# MOBILE-011 — Customer + Staff Single Expo App

**Plan ID:** MOBILE-011  
**Date Created:** 2026-09-15  
**Last Updated:** 2026-09-15  
**Status:** Not Started  
**Owner:** Mobile + Platform  
**Platform:** mobile (Expo binary) • shared Supabase • web customer login cutover to same RPCs  
**Category:** auth  
**Database Dump Reference:** `supabase/backups/full_metadata.sql`  
**Pre-plan audit:** [MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_AUDIT_2026-09-15.md](../../program/evidence/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_AUDIT_2026-09-15.md)  
**Risk Level:** High (secrets, RLS, store listing, identity split)  
**Estimated Duration:** ~5–7 weeks across 6 phases (0–5)

---

## 1) Executive Summary

Keep **one** native app in `mobile/` (`com.techwheels.service`, APK + iOS already built). Add a login-home audience picker: **Login as Customer** / **Login as Staff**. After login, each audience gets a **separate Expo shell**. Do not ship `bodyshop/` (`com.techwheels.bodyshop`) and do not wrap Capacitor inside Expo.

Customers are **not** staff. DB truth has no customer role. Customer screens must not query workshop tables with the anon key. Serve them only through `SECURITY DEFINER` RPCs that return that phone’s rows.

### Measurable outcomes
- One store binary. Customer and staff both install `com.techwheels.service`.
- First screen is an audience picker; customer cannot open `/(tabs)/admin` (or any staff module); staff cannot open `/(customer)`.
- No `service_role` key in any client (`bodyshop/src/lib/supabase.ts` included). Key rotated.
- No `'customer'` value added to `public.users.role`.
- Customer data access uses RPCs only; workshop table grants stay `authenticated` + `service_role` (staff RLS unchanged).
- Staff self-signup is invite-only before the dual-audience build is public.
- Customer UX is ported from **web** `CustomerPortalPage`, not from the Capacitor prototype.

---

## 2) Classification Record

- **State:** implementation plan (active)
- **Scope:** shared backend (customer identity + RPCs) + Expo routing/shell + customer screens + web customer-login cutover
- **Intent:** active plan
- **Parity reference:** web `LoginPage` Staff/Customer tabs (UX only); web `CustomerPortalPage` (behavior to port)

---

## 3) Scope

### In scope
- Rotate leaked service-role key; remove it from all clients
- `customer_profiles` + `customer_sessions` (Phase 1); OTP + `auth.users` `app_metadata.audience = 'customer'` (Phase 4)
- SECURITY DEFINER RPCs for customer lookup, active job, history, complaint, feedback, estimate view/approve, gate pass
- Expo audience picker + customer auth screens + customer tab shell
- Lock staff signup (`mobile/src/app/(auth)/signup.tsx`)
- Route `src/app/index.tsx` / auth layout / tabs layout by **audience**, not only by “session present”
- Port customer screens from `src/pages/CustomerPortalPage.tsx`
- Point web `authenticateCustomer` / `LoginPage` customer mode at the same RPCs (stop direct table reads)
- OTA to existing EAS project; archive `bodyshop/` after customer shell ships
- Runtime-gate camera / background location so customer mode does not request staff-only permissions

### Out of scope
- A second APK / iOS app / Play or App Store listing
- WebView of `bodyshop/` or the web portal inside Expo
- Copying React DOM from `bodyshop/` into React Native
- Adding `'customer'` to `public.users.role` or linking customers via `user_employee_links`
- Opening `service_reception_entries` / `vehicles` / `bodyshop_repair_cards` / `all_service_data` to `anon`
- Inventing warranty / AMC / billed amounts / QR tokens on the client
- Mobile staff-module redesign (owned by MOBILE-009 / MOBILE-BP-RD)
- Full customer payments / UPI checkout (show status only unless a later plan owns payments)
- New first-class `customer_estimates` table in Phase 1 (read existing reception/accounts/estimate columns via RPC; add a table only if Phase 3 evidence proves it is required)

---

## 4) Authority Sources & Pre-Implementation Audit

Locked by the 2026-09-15 audit against `full_metadata.sql`. Do not re-litigate without a new dump grep.

### 4.1 Present in DB truth

| Object | Status | Notes |
|---|---|---|
| `auth.users` | Present | Staff login today |
| `public.users` | Present | `role` CHECK = `admin\|manager\|staff\|viewer\|driver` only |
| `user_employee_links` | Present | Staff `user_id` → `employee_code` + `dealer_code` |
| `employee_master.role` | Present | Operational CSV (SA, TECHNICIAN, …) — not customers |
| `user_module_permissions` / `modules` / `get_all_my_permissions()` | Present | Staff module grid |
| `service_reception_entries` | Present | `owner_phone` `^[0-9]{10}$`; staff RLS only |
| `vehicles` | Present | `owner_phone`, `reg_number`; dealer-scoped staff RLS |
| `bodyshop_repair_cards` | Present | `customer_phone`; staff RLS |
| `all_service_data` | Present | `contact_phones`, `last_service_customer_mobile_no` |
| `post_feedback_bot_data` | Present | Misused as estimate/gate-pass/complaint dump; admin policy only in dump |
| Customer tables / RPCs | **Absent** | No `customer_profiles`, `customer_sessions`, `customer_*` functions |
| `customer_estimates` / issued gate-pass table | **Absent** | Do not pretend they exist |

### 4.2 Present in apps (wrong vs keep)

| Surface | Keep / wrong |
|---|---|
| `mobile/` Expo, EAS, `com.techwheels.service`, ASC `6774519420` | **Keep** — only native binary |
| `mobile/src/lib/supabase.ts` anon key | **Keep** |
| `bodyshop/` Capacitor, Android only, `com.techwheels.bodyshop` | **Wrong as a shipped app** — archive after Phase 5 |
| `bodyshop/src/lib/supabase.ts` hardcoded `service_role` | **Critical wrong** — rotate + remove in Phase 0 |
| Web `LoginPage` Staff/Customer tabs | **Keep UX**; replace customer handler with RPCs |
| Web `CustomerPortalPage` | **Keep as port source** for Expo customer shell |
| Web `authenticateCustomer` (lookup-without-proof) and `?reg=` auto-login | **Wrong** — cut over in Phase 1 |
| `mobile` open signup | **Wrong** once customers can download the app |

### 4.3 Locked identity rules

1. Staff path unchanged: `auth.users` → `public.users` → `user_employee_links` → `employee_master`.
2. Customer path **never** writes `public.users` or `user_employee_links`.
3. Customer phone is `^[0-9]{10}$`, same as `service_reception_entries.owner_phone`.
4. Workshop RLS policies are not weakened. Customer access is RPC-only.
5. Port customer **behavior** from web, not from `bodyshop/`.

---

## 5) Architecture

```
App open (com.techwheels.service)
        │
        ▼
┌──────────────────── Audience picker ────────────────────┐
│  Login as Customer          │  Login as Staff            │
└─────────────┬───────────────┴────────────┬───────────────┘
              │                            │
              ▼                            ▼
   customer_start_session          supabase.auth
   (Phase 1 token)                 signInWithPassword
   customer_verify_otp             → public.users
   (Phase 4 JWT audience=          → user_employee_links
    customer)                      → (tabs) staff shell
              │
              ▼
   (customer) shell
   dashboard · problem · estimate · bills · gate pass · feedback
              │
              ▼
   SECURITY DEFINER RPCs only
   (scoped to session phone / JWT phone)
              │
              ▼
   service_reception_entries / vehicles / bodyshop_repair_cards
   / all_service_data  — staff RLS unchanged; RPCs run as definer
```

### 5.1 Expo routes (proposed)

| Screen | Path | Audience |
|---|---|---|
| Chooser | `mobile/src/app/(audience)/index.tsx` | none |
| Customer login | `mobile/src/app/(customer-auth)/login.tsx` | customer |
| Customer tabs layout | `mobile/src/app/(customer)/_layout.tsx` | customer |
| Dashboard | `mobile/src/app/(customer)/index.tsx` | customer |
| Problem | `mobile/src/app/(customer)/complaint.tsx` | customer |
| Estimate | `mobile/src/app/(customer)/estimate.tsx` | customer |
| Bills | `mobile/src/app/(customer)/invoices.tsx` | customer |
| Gate pass | `mobile/src/app/(customer)/gatepass.tsx` | customer |
| Feedback | `mobile/src/app/(customer)/feedback.tsx` | customer |
| Staff login | existing `mobile/src/app/(auth)/login.tsx` | staff |
| Staff tabs | existing `mobile/src/app/(tabs)/…` | staff |

`mobile/src/app/index.tsx` must branch:

1. Customer session/token → `/(customer)`
2. Staff `supabase.auth` session → `/(tabs)/home`
3. Else → `/(audience)` chooser

Staff `(auth)/_layout.tsx` must **not** redirect a customer session into `/(tabs)/home`.

### 5.2 API layer (mobile)

Create (do not share DOM from `bodyshop/`):

- `mobile/src/lib/api/customerAuth.ts` — start/end session, later OTP
- `mobile/src/lib/api/customerPortal.ts` — job, history, complaint, feedback, estimate, gate pass
- `mobile/src/context/CustomerSessionContext.tsx` — token in SecureStore, never AsyncStorage for the token

Web: replace `src/lib/api/customer.ts` `authenticateCustomer` with the same RPC wrappers so web and mobile cannot drift.

---

## 6) Data Model (proposed — grep dump before apply)

Greenfield. Confirmed absent in `full_metadata.sql` on 2026-09-15. Re-grep immediately before writing migrations.

### 6.1 `public.customer_profiles`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `auth_user_id` | uuid NULL UNIQUE | FK `auth.users(id)`; NULL until Phase 4 OTP |
| `phone` | text NOT NULL UNIQUE | CHECK `^[0-9]{10}$` |
| `created_at` / `updated_at` | timestamptz | `now()` |
| `last_login_at` | timestamptz NULL | |

No `employee_code`. No `dealer_code` ACL column. No `role`.

### 6.2 `public.customer_sessions` (Phase 1; retired after Phase 4 JWT is default)

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid NOT NULL | FK `customer_profiles(id)` |
| `token_hash` | text NOT NULL UNIQUE | store hash only |
| `expires_at` | timestamptz NOT NULL | short TTL (e.g. 12h) |
| `created_at` | timestamptz | |
| `revoked_at` | timestamptz NULL | |

### 6.3 What we will **not** change

- `public.users_role_check` — do not add `customer`
- Staff RLS on reception / vehicles / bodyshop / modules
- `GRANT` of those tables to `anon`

### 6.4 Phase 4 auth metadata

On customer OTP success:

- Create or reuse `auth.users` with phone
- Set `app_metadata.audience = 'customer'` (service-role **server** only — never from the app)
- Set `customer_profiles.auth_user_id`
- Subsequent RPCs prefer `auth.uid()`; reject if `audience` is not `customer`
- A staff JWT must be rejected by every `customer_*` RPC

---

## 7) RPC Contract (Phase 1 names locked)

All `SECURITY DEFINER`, `REVOKE ALL` from `PUBLIC` / `anon` on tables, `GRANT EXECUTE` on RPCs to `anon` **only** for `customer_start_session` (and Phase 4 OTP request/verify). Session-scoped RPCs: `GRANT EXECUTE` to `anon` **or** `authenticated` as required by the token design, but they must no-op without a valid session/JWT.

Match phone + identifier to the **same** row. Username may be reg number or 10-digit phone. Both inputs required. No `endsWith` fuzzy match. No success if lookup finds a different phone’s vehicle.

| Function | Input | Output | Purpose |
|---|---|---|---|
| `customer_start_session` | `p_username text`, `p_phone text` | `session_token`, `vehicles[]` (scoped) | Prove phone owns the lookup; mint hashed session |
| `customer_end_session` | `p_session_token text` | void | Revoke |
| `customer_get_active_job` | `p_session_token text` | one active job card/reception/bodyshop view | No invented warranty/AMC/prices |
| `customer_get_service_history` | `p_session_token text` | history rows from `all_service_data` / closed JC | Lifetime visits |
| `customer_submit_complaint` | token + payload | id | Do **not** stuff into `post_feedback_bot_data` if a dedicated write path exists; if Phase 1 must reuse that table, set a distinct `mode` and plan a later table |
| `customer_submit_feedback` | token + payload | id | Same rule |
| `customer_list_estimates` | token | estimates from real columns/files | Empty list if none — never synthesise from `parts_pricing.json` |
| `customer_set_estimate_decision` | token + estimate id + approve/reject + reason | updated row | Only the owning phone |
| `customer_get_gate_pass` | token | gate pass if workshop issued | Null if not issued — never mint a client QR |

Phase 4 additions: `customer_request_otp`, `customer_verify_otp`. After verify, session RPCs accept customer JWT and ignore the Phase 1 token.

**Rate limit** `customer_start_session` / OTP (per phone + IP) in the function or an edge wrapper. Log failures without returning whether the reg exists independently of the phone (same generic error).

---

## 8) Business Rules

1. One binary, two shells. No mixed navigation.
2. Customer sees only vehicles whose `owner_phone` / `customer_phone` equals the session phone.
3. Missing KM / invoice / estimate / gate pass renders as pending — never a fake number.
4. Staff modules remain behind `get_all_my_permissions()`; customer JWT has zero module rows and must not be inserted into `public.users`.
5. Open staff signup is forbidden on the public dual-audience build.
6. `bodyshop/` is not a release vehicle after Phase 0 (secret removal). Archive when Phase 5 customer shell is on the staff binary.
7. Web and mobile customer login call the same RPCs.
8. Background location / job-card camera are staff-only runtime permissions.

---

## 9) Phase Plan (summary)

Detail and checkboxes live in [PHASES.md](PHASES.md) and [CHECKLIST.md](CHECKLIST.md).

| Phase | Name | Depends on | Outcome |
|---|---|---|---|
| 0 | Secret rotation | none (start immediately) | Service-role key rotated; removed from `bodyshop` client |
| 1 | Customer RPCs + web cutover | Phase 0 | DB objects applied; web customer login uses RPCs; dump refreshed |
| 2 | Expo audience shell + staff signup lock | Phase 1 | Chooser + routing; staff cannot land in customer shell and vice versa |
| 3 | Customer screens | Phase 2 | Portal features on Expo via RPCs only |
| 4 | Phone OTP | Phase 3 | Real customer `auth.users`; retire phone-as-secret |
| 5 | Release + archive | Phase 3 minimum; Phase 4 preferred | OTA, store copy, archive `bodyshop/`, evidence |

Phase 0 is a **production security blocker**. It may run in parallel with Body & Paint redesign (MOBILE-BP-RD) and does not wait for customer UI.

---

## 10) Explicitly Wrong Approaches (do not implement)

| Approach | Why forbidden |
|---|---|
| Ship two store apps | User requirement; Capacitor customer has no iOS |
| WebView `bodyshop/` inside Expo | Keeps service-role risk and a second stack |
| Copy `bodyshop/src` DOM into RN | Wrong renderer |
| Add `'customer'` to `users.role` | Breaks staff RBAC CHECK and admin |
| `GRANT` workshop tables to `anon` | Destroys dealer/SA RLS |
| Port vehicle+mobile “password” as the long-term login | Phone is printed on job cards; web version does not even check it |
| Client-generated estimates / gate-pass QR | Not DB truth |
| Leave `signup.tsx` public | Customers will create workshop accounts |

---

## 11) Test Matrix (Phase evidence)

Create `docs/Implementation_plans/mobileversion/categories/auth/evidence/MOBILE-011_TEST_MATRIX.md` during Phase 1. Minimum cases:

| ID | Case | Expected |
|---|---|---|
| C-01 | Customer phone+reg match same reception row | Session + that vehicle only |
| C-02 | Right reg, wrong phone | Generic failure; no row leak |
| C-03 | Customer token calls staff table directly | RLS deny / empty |
| C-04 | Customer deep-link `/(tabs)/admin` | Redirect / denied |
| C-05 | Staff session opens `/(customer)` | Redirect to staff home |
| C-06 | Anon `customer_get_active_job` without token | Fail |
| C-07 | Staff JWT calls `customer_*` RPC | Fail |
| C-08 | Estimate missing in DB | Empty / pending — no synthetic lines |
| C-09 | Gate pass not issued | Null — no client QR |
| C-10 | Staff signup without invite | Blocked |
| C-11 | Web and mobile same phone/reg | Same vehicle set from same RPC |
| C-12 | Phase 4: OTP to `owner_phone` only | JWT `audience=customer`; no `public.users` row |

---

## 12) Risks

| Risk | Mitigation |
|---|---|
| Leaked service-role still valid | Phase 0 rotate first; confirm old JWT 401s |
| Customer RPC over-returns other dealers’ jobs for same phone | Scope to matched `reg_number` + phone; list only that customer’s regs |
| Store review (background location) | Customer mode never requests it; listing names both audiences |
| OTP vendor not ready | Phase 3 can ship with Phase 1 session **only if** Phase 0+1+2+C-02/C-03 pass; Phase 4 remains required before calling the login a real password |
| `post_feedback_bot_data` as write sink | Distinct `mode`; follow-up plan for a real complaint/estimate table if Phase 3 needs it |
| Dual login confuses staff in field | Default last-used audience; staff bookmark still works |

---

## 13) Success Criteria (plan done)

1. Phase 0–5 checklists complete with evidence notes.
2. `full_metadata.sql` refreshed after Phase 1 and Phase 4 migrations.
3. Production APK/iOS (or OTA on existing runtime) shows audience picker; both paths verified on device.
4. `bodyshop/` not in any store listing; folder archived or marked do-not-ship in this plan’s Phase 5 evidence.
5. No `service_role` string in `bodyshop/`, `mobile/`, or `src/` client bundles.
6. `public.users_role_check` still excludes `customer`.

---

## 14) Resume Protocol

1. Read this file + [PHASES.md](PHASES.md) + [CHECKLIST.md](CHECKLIST.md).
2. Confirm dump path: `supabase/backups/full_metadata.sql`.
3. Continue the first unchecked CHECKLIST item in the current phase.
4. Do not start Phase 2 UI against direct table reads.
5. Update MOBILE-010 and the mobile tracker/index when phase status changes.
