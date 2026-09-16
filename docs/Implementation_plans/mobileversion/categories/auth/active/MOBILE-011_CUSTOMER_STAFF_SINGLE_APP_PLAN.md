# MOBILE-011 — Customer + Staff Single Expo App

**Plan ID:** MOBILE-011  
**Date Created:** 2026-09-15  
**Last Updated:** 2026-09-16 (implementation started: Phase 0 done; Phase 1–3 in progress for next prod APK/iOS)  
**Status:** In Progress  

### Product lock (2026-09-16)

Customer login is **10-digit mobile as username and the same 10-digit mobile as password**. Session identity is that phone. Every customer screen and RPC may see **all vehicles/jobs for that phone only** — never other customers’ rows. This replaces the earlier “username may be vehicle reg” draft.  
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

Customers are **not** staff. DB truth has no customer role. Customer screens must not query workshop tables with the anon key. Serve them only through `SECURITY DEFINER` RPCs that return **that session phone’s** rows (every vehicle registered to that mobile).

### Measurable outcomes
- One store binary. Customer and staff both install `com.techwheels.service`.
- First screen is an audience picker; customer cannot open `/(tabs)/admin` (or any staff module); staff cannot open `/(customer)`.
- No `service_role` key in any client (`bodyshop/src/lib/supabase.ts` and `bodyshop/.env` included). Dashboard key rotation is **out of scope** (product decision 2026-09-16).
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
- Remove `service_role` from `bodyshop/src/lib/supabase.ts` and tracked `bodyshop/.env` (do **not** rotate the dashboard key)
- `customer_profiles` + `customer_sessions` (Phase 1); OTP + `auth.users` `app_metadata.audience = 'customer'` (Phase 4)
- SECURITY DEFINER RPCs for customer lookup, active job, history, complaint, feedback, estimate view/approve, gate pass
- Expo audience picker + customer auth screens + customer tab shell
- Lock staff signup (`mobile/src/app/(auth)/signup.tsx`)
- Route `src/app/index.tsx` / auth layout / tabs layout by **audience**, not only by “session present”
- Port customer screens from `src/pages/CustomerPortalPage.tsx`
- Replace web `authenticateCustomer` with the same phone=phone RPC (stop direct table reads and lookup-without-match)
- OTA to existing EAS project; archive `bodyshop/` after customer shell ships
- Runtime-gate camera / background location so customer mode does not request staff-only permissions

### Out of scope
- A second APK / iOS app / Play or App Store listing
- WebView of `bodyshop/` or the web portal inside Expo
- Copying React DOM from `bodyshop/` into React Native
- Adding `'customer'` to `public.users.role` or linking customers via `user_employee_links`
- Opening `service_reception_entries` / `vehicles` / `bodyshop_repair_cards` to `anon`. Existing dump `GRANT ALL ON TABLE public.all_service_data TO anon` is left as-is (product decision 2026-09-16).
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
| `bodyshop/src/lib/supabase.ts` hardcoded `service_role` | **Critical wrong** — remove from client + `.env` in Phase 0 (no dashboard rotation) |
| Web `LoginPage` Staff/Customer tabs | **Keep UX**; replace customer handler with RPCs |
| Web `CustomerPortalPage` | **Keep as port source** for Expo customer shell |
| Web `authenticateCustomer` (lookup-without-proof) and `?reg=` auto-login | **Wrong** — cut over in Phase 1 |
| `mobile` open signup | **Wrong** once customers can download the app |

### 4.3 Locked identity rules

1. Staff path unchanged: `auth.users` → `public.users` → `user_employee_links` → `employee_master`.
2. Customer path **never** writes `public.users` or `user_employee_links`.
3. Customer login (Phase 1, web + Expo): **username = 10-digit mobile**, **password = the same 10-digit mobile**. Both fields required and must be identical after stripping to digits. Vehicle registration is **not** a login identifier.
4. Session identity is **phone**, not a single vehicle. After login the customer sees **all** vehicles whose phone matches that session (`owner_phone` / `customer_phone` / `last_service_customer_mobile_no` / `contact_phones` last-10). A vehicle picker is UI only; it does not widen access.
5. After login, RPCs take the phone from the **server session** (token / JWT). The client must not send a different phone to “switch customer.” Optional `p_reg_number` is allowed only if that reg belongs to the session phone.
6. Customer phone is `^[0-9]{10}$`, same as `service_reception_entries.owner_phone`. No `endsWith` / partial match.
7. Workshop RLS policies are not weakened. Customer access is RPC-only. **No `service_role` in any client.**
8. Port customer **behavior** from web, not from `bodyshop/`.

### 4.4 How the two defects are closed

| Defect | Close in | What we do | What we do not do |
|---|---|---|---|
| Hardcoded `service_role` in `bodyshop/` | **Phase 0** | Delete it from `bodyshop/src/lib/supabase.ts` and tracked `bodyshop/.env`. Anon key only. Do **not** rotate the Supabase dashboard key. | Do not keep service-role so customer `select('*')` “just works.” |
| Weak web `authenticateCustomer` | **Phase 1** | Delete lookup-without-proof and fake-vehicle fallback. Web and Expo call `customer_start_session(username, password)`. Success only if both are the same 10-digit mobile **and** at least one vehicle exists for that phone. Returns **that phone’s vehicle list**. Later screens call session-scoped RPCs only. | Do not `GRANT` workshop tables to `anon`. Do not succeed on any search hit. Do not invent a vehicle if the phone is unknown. |

**Why this still isolates rows without a real secret:** the phone is a weak password (it is printed on job cards). Isolation is **not** “the customer guessed a secret.” Isolation is: the database function binds a session to one phone and every later query is `WHERE phone = session.phone`. Other customers’ rows never leave the RPC. Phase 4 OTP can sit on top later; it is **not** required to ship this login UX.

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
   (username=password=             signInWithPassword
    10-digit mobile;               → public.users
    session bound to phone)        → user_employee_links
   optional Phase 4 OTP            → (tabs) staff shell
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

All `SECURITY DEFINER`. Workshop tables stay unggranted to `anon`. `GRANT EXECUTE` on `customer_start_session` to `anon`. Session RPCs execute only with a valid token (or later customer JWT); they **read phone from `customer_sessions`**, never from a client-supplied phone field.

**Login contract (locked 2026-09-16):**

1. Client sends username + password.
2. Server strips non-digits. Both must be exactly 10 digits and **equal**.
3. If not equal / not 10 digits → generic failure (`Invalid mobile number.`).
4. Find vehicles for that phone (exact last-10 match) in:
   - `service_reception_entries.owner_phone`
   - `vehicles.owner_phone`
   - `bodyshop_repair_cards.customer_phone`
   - `all_service_data.last_service_customer_mobile_no` and `contact_phones` (last-10 of each number in the list)
5. If **zero** vehicles → generic failure (`No vehicle found for this mobile number.`). Do not create a fake vehicle.
6. Upsert `customer_profiles` on `phone`. Mint hashed session bound to that **phone**.
7. Return `session_token` + **full vehicle list** for that phone (dedupe by `reg_number`).

No `endsWith` fuzzy match. No success if username is a vehicle reg and password is something else.

| Function | Input | Output | Visibility |
|---|---|---|---|
| `customer_start_session` | `p_username text`, `p_password text` | `session_token`, `vehicles[]` | All vehicles for that phone |
| `customer_end_session` | `p_session_token text` | void | — |
| `customer_list_my_vehicles` | `p_session_token text` | `vehicles[]` | Same list; source of truth for every screen |
| `customer_get_active_job` | token + optional `p_reg_number` | active job for one of **my** regs | Reject if `p_reg_number` is not in my list |
| `customer_get_service_history` | token + optional `p_reg_number` | history for my vehicle(s) | Phone-scoped; optional single-reg filter |
| `customer_submit_complaint` | token + payload (must include a my-reg) | id | Write only if reg ∈ session vehicles |
| `customer_submit_feedback` | token + payload | id | Same |
| `customer_list_estimates` | token + optional `p_reg_number` | estimates | Phone-scoped |
| `customer_set_estimate_decision` | token + estimate id + approve/reject + reason | updated row | Estimate’s vehicle must be in session vehicles |
| `customer_get_gate_pass` | token + optional `p_reg_number` | issued gate pass or null | Phone-scoped; never mint a client QR |

Phase 4 (optional step-up): `customer_request_otp` / `customer_verify_otp` still keyed to the same phone. Does not change row visibility.

**Rate limit** `customer_start_session` per phone + IP. Same generic error whether the phone is unknown or mistyped (do not leak “this mobile exists”).

---

## 8) Business Rules

1. One binary, two shells. No mixed navigation.
2. Customer sees **all** vehicles for the session phone, and **only** those vehicles. Screens (dashboard, problem, estimate, bills, gate pass, feedback) load from `customer_list_my_vehicles` / job RPCs. Selected vehicle is UI state; switching vehicle never loads another phone’s data.
3. Missing KM / invoice / estimate / gate pass renders as pending — never a fake number.
4. Staff modules remain behind `get_all_my_permissions()`; customer sessions must not be inserted into `public.users`.
5. Open staff signup is forbidden on the public dual-audience build.
6. `bodyshop/` is not a release vehicle after Phase 0 (secret removal). Archive when Phase 5 customer shell is on the staff binary.
7. Web and mobile customer login call the same RPCs with the same username=password=mobile rule.
8. Background location / job-card camera are staff-only runtime permissions.
9. Web `?reg=` / `?phone=` auto-login is removed. Deep links after login may select a **my** vehicle only.

---

## 9) Phase Plan (summary)

Detail and checkboxes live in [PHASES.md](PHASES.md) and [CHECKLIST.md](CHECKLIST.md).

| Phase | Name | Depends on | Outcome |
|---|---|---|---|
| 0 | Remove client `service_role` | none (start immediately) | Key deleted from `bodyshop` client + tracked `.env`; dashboard key left as-is |
| 1 | Customer RPCs + web cutover | Phase 0 | Phone=phone login RPC; web `authenticateCustomer` replaced; dump refreshed |
| 2 | Expo audience shell + staff signup lock | Phase 1 | Chooser + routing; staff cannot land in customer shell and vice versa |
| 3 | Customer screens | Phase 2 | Portal features on Expo via RPCs only; all screens use my-vehicles list |
| 4 | Phone OTP (optional step-up) | Phase 3 | Extra proof on the same phone; does not change row visibility |
| 5 | Release + archive | Phase 3 minimum | OTA, store copy, archive `bodyshop/`, evidence |

Phase 0 is client-only secret removal (no dashboard rotation). It may run in parallel with Body & Paint redesign (MOBILE-BP-RD).

---

## 10) Explicitly Wrong Approaches (do not implement)

| Approach | Why forbidden |
|---|---|
| Ship two store apps | User requirement; Capacitor customer has no iOS |
| WebView `bodyshop/` inside Expo | Keeps service-role risk and a second stack |
| Copy `bodyshop/src` DOM into RN | Wrong renderer |
| Add `'customer'` to `users.role` | Breaks staff RBAC CHECK and admin |
| `GRANT` workshop tables to `anon` | Destroys dealer/SA RLS |
| Port vehicle-number as username | Product lock 2026-09-16: login is mobile=mobile only |
| Trust client-sent phone after login | Session phone is server-side; optional reg must belong to that phone |
| Invent a vehicle when phone is unknown | Fail closed; that was the old web hole |
| Client-generated estimates / gate-pass QR | Not DB truth |
| Leave `signup.tsx` public | Customers will create workshop accounts |

---

## 11) Test Matrix (Phase evidence)

Create `docs/Implementation_plans/mobileversion/categories/auth/evidence/MOBILE-011_TEST_MATRIX.md` during Phase 1. Minimum cases:

| ID | Case | Expected |
|---|---|---|
| C-01 | Username and password both `9950042708`, phone has two regs | Session + **both** vehicles; no other phones’ rows |
| C-02 | Username `9950042708`, password `9460517971` (different) | Fail; no session |
| C-02b | Username is a vehicle reg, password is a phone | Fail (reg is not a login id) |
| C-02c | Unknown 10-digit mobile used as both fields | Fail; no fake vehicle |
| C-03 | Customer token calls staff table directly | RLS deny / empty |
| C-03b | Customer token + another customer’s `p_reg_number` | RPC reject |
| C-04 | Customer deep-link `/(tabs)/admin` | Redirect / denied |
| C-05 | Staff session opens `/(customer)` | Redirect to staff home |
| C-06 | Anon `customer_get_active_job` without token | Fail |
| C-07 | Staff JWT calls `customer_*` RPC | Fail |
| C-08 | Estimate missing in DB for my vehicle | Empty / pending — no synthetic lines |
| C-09 | Gate pass not issued | Null — no client QR |
| C-10 | Staff signup without invite | Blocked |
| C-11 | Web and mobile same mobile=mobile login | Same vehicle set from same RPC |
| C-12 | Phase 4 OTP (if enabled) to session phone | Still phone-scoped rows; no `public.users` row |

---

## 12) Risks

| Risk | Mitigation |
|---|---|
| `service_role` still in a client bundle | Phase 0: delete from `bodyshop` source and `.env`. Do not rotate the dashboard key. |
| Customer RPC over-returns other customers’ jobs | Every RPC: `phone = session.phone`; optional reg must be in that phone’s vehicle set |
| Phone is a weak password (printed on JC) | Accepted for Phase 1 UX. Mitigate with rate limit + generic errors. OTP is optional later; row isolation does not depend on OTP |
| OTP vendor not ready | Ship Phase 1–3 on phone=phone session. Phase 4 is optional step-up, not a ship gate |
| Store review (background location) | Customer mode never requests it; listing names both audiences |
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
7. Logged-in customer never receives another phone’s vehicle/job/estimate/gate-pass row.

---

## 14) Resume Protocol

1. Read this file + [PHASES.md](PHASES.md) + [CHECKLIST.md](CHECKLIST.md).
2. Confirm dump path: `supabase/backups/full_metadata.sql`.
3. Continue the first unchecked CHECKLIST item in the current phase.
4. Do not start Phase 2 UI against direct table reads.
5. Update MOBILE-010 and the mobile tracker/index when phase status changes.
