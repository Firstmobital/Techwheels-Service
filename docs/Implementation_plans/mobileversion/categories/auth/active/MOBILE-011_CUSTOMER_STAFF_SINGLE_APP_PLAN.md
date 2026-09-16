# MOBILE-011 — Customer + Staff Single Expo App

**Plan ID:** MOBILE-011  
**Date Created:** 2026-09-15  
**Last Updated:** 2026-09-16 (bodyshop visual/workflow lock; Phase 0 done; Phase 1–3 coded in `mobile/`)  
**Status:** In Progress  

### Product lock (2026-09-16)

1. **Login:** 10-digit mobile as username **and** the same 10-digit mobile as password. Vehicle registration is not a login id.
2. **Scope:** session identity is that phone. Every customer screen and RPC may see **all vehicles/jobs for that phone only**.
3. **Access:** RPC-only. No `public.users` customer rows. No workshop-table GRANT to `anon`. No `service_role` in any client. Dashboard key rotation is out of scope.
4. **Visual / workflow source:** recreate the `bodyshop/` customer app in Expo (`mobile/src/app/(customer)*`) so that folder can be archived in Phase 5 **without rebuilding** screens, steps, or calculations. Recreate in React Native — do not copy React DOM, do not WebView `bodyshop/`.
5. **Truth:** still RPC-only. Do **not** port fake catalog prices, invented warranty/AMC, sandbox vehicles, vehicle-as-username, a client-minted QR, or security-mode fake exit. Empty workshop fields stay pending / `—`.

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

The customer shell’s **look, steps, and calculations** come from `bodyshop/` (dashboard hero + actions, multi-problem form, estimate table/approve-reject, settlement math, gate pass, feedback tags, booking, repair tracker). The data path does **not**. Expo talks only to session RPCs. When `bodyshop/` is archived, those workflows already live in `mobile/`.

### Measurable outcomes
- One store binary. Customer and staff both install `com.techwheels.service`.
- First screen is an audience picker; customer cannot open `/(tabs)/admin` (or any staff module); staff cannot open `/(customer)`.
- No `service_role` key in any client (`bodyshop/src/lib/supabase.ts` and `bodyshop/.env` included). Dashboard key rotation is **out of scope** (product decision 2026-09-16).
- No `'customer'` value added to `public.users.role`.
- Customer data access uses RPCs only; workshop table grants stay `authenticated` + `service_role` (staff RLS unchanged). Existing dump `GRANT ALL ON TABLE public.all_service_data TO anon` is left as-is (product decision 2026-09-16).
- Staff self-signup is invite-only before the dual-audience build is public.
- Customer UX in Expo matches `bodyshop/` workflows (tabs + booking + tracker). Missing workshop data is pending, never invented.
- After Phase 5, `bodyshop/` is archived; no second rebuild of customer UI in the staff binary.

---

## 2) Classification Record

- **State:** implementation plan (active)
- **Scope:** shared backend (customer identity + RPCs) + Expo routing/shell + customer screens (bodyshop parity) + web customer-login cutover
- **Intent:** active plan
- **Parity reference:** `bodyshop/` customer app (visuals, workflows, calculations to recreate in Expo). Web `LoginPage` Staff/Customer tabs = login UX only. Web `CustomerPortalPage` is **not** the Expo visual source.

---

## 3) Scope

### In scope
- Remove `service_role` from `bodyshop/src/lib/supabase.ts` and tracked `bodyshop/.env` (do **not** rotate the dashboard key)
- `customer_profiles` + `customer_sessions` (Phase 1); OTP + `auth.users` `app_metadata.audience = 'customer'` (Phase 4)
- SECURITY DEFINER RPCs: login, vehicles, active job, history, complaint (+ KM write-back), feedback, estimates, estimate decision, gate pass, **settlement**, **booking**, **repair card**
- Expo audience picker + customer auth screens + customer tab shell
- Lock staff signup (`mobile/src/app/(auth)/signup.tsx`)
- Route `mobile/src/app/index.tsx` / auth layout / tabs layout by **audience**, not only by “session present”
- Recreate `bodyshop/` customer screens in Expo: dashboard, problem, estimate, bills, gate pass, feedback, booking, tracker, shared chrome
- Replace web `authenticateCustomer` with the same phone=phone RPC (stop direct table reads and lookup-without-match)
- OTA to existing EAS project; archive `bodyshop/` after customer shell ships
- Runtime-gate camera / background location so customer mode does not request staff-only permissions

### Out of scope
- A second APK / iOS app / Play or App Store listing
- WebView of `bodyshop/` or the web portal inside Expo
- Copying React DOM from `bodyshop/` into React Native
- Adding `'customer'` to `public.users.role` or linking customers via `user_employee_links`
- Opening `service_reception_entries` / `vehicles` / `bodyshop_repair_cards` to `anon`. Existing dump `GRANT ALL ON TABLE public.all_service_data TO anon` is left as-is (product decision 2026-09-16).
- Inventing warranty / AMC / billed amounts / QR tokens / JC numbers / advisor names on the client
- Porting `bodyshop` sandbox vehicles, 1-click test credentials, or `?reg=` auto-login
- Porting security-mode fake vehicle-exit grant
- Porting `parts_pricing.json` / `getEstimateDetails` / `buildEstimateForVehicle` synthetic quotations
- Full customer payments / UPI checkout (show workshop-posted status only)
- New first-class `customer_estimates` table in Phase 1 (read existing reception/accounts/estimate columns via RPC)
- Mobile staff-module redesign (owned by MOBILE-009 / MOBILE-BP-RD)

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
| `post_feedback_bot_data` | Present | Estimate/gate-pass/complaint/payment/booking dump; admin policy only in dump |
| `accounts_mechanical_invoices` | Present | Real billed / received for settlement RPC |
| `customer_profiles` / `customer_sessions` / `customer_*` RPCs | **Present (applied 2026-09-16)** | `20260916120000` + helper revoke `20260916121500`. Parity RPCs in `20260916123000` (apply in SQL editor if `db push` is blocked). |
| First-class `customer_estimates` / issued gate-pass table | **Absent** | Read via RPC from reception / bot payload / `customer_estimates` if that table exists (`to_regclass`) |

### 4.2 Present in apps (wrong vs keep)

| Surface | Keep / wrong |
|---|---|
| `mobile/` Expo, EAS, `com.techwheels.service`, ASC `6774519420` | **Keep** — only native binary |
| `mobile/src/lib/supabase.ts` anon key | **Keep** |
| `bodyshop/` Capacitor, Android only, `com.techwheels.bodyshop` | **Wrong as a shipped app** — visual/workflow **source** until Phase 5 archive |
| `bodyshop/src/lib/supabase.ts` hardcoded `service_role` | **Critical wrong** — remove from client + `.env` in Phase 0 (no dashboard rotation) |
| `bodyshop` pages (dashboard → feedback, plus booking + tracker) | **Keep as Expo parity source**; do not ship the Capacitor binary |
| `bodyshop` fakes (`parts_pricing`, sandbox vehicles, client QR, security-mode exit) | **Wrong** — do not recreate |
| Web `LoginPage` Staff/Customer tabs | **Keep UX**; customer handler is the phone=phone RPC |
| Web `CustomerPortalPage` | **Not** the Expo visual source (2026-09-16 lock). Web still uses the same RPCs. |
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
8. Recreate `bodyshop/` customer **visuals, workflows, and calculations** in Expo. Do not copy React DOM. Do not invent prices, warranty, or QR tokens.

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
   (customer) shell  ← bodyshop visuals/workflows, RPC data
   dashboard · problem · estimate · bills · gate pass · feedback
   (+ booking, tracker from dashboard; not extra store apps)
              │
              ▼
   SECURITY DEFINER RPCs only
   (scoped to session phone / JWT phone)
              │
              ▼
   service_reception_entries / vehicles / bodyshop_repair_cards
   / all_service_data / accounts_mechanical_invoices
   / post_feedback_bot_data  — staff RLS unchanged; RPCs run as definer
```

### 5.1 Expo routes

| Screen | Path | Audience | Bodyshop source |
|---|---|---|---|
| Chooser | `mobile/src/app/(audience)/index.tsx` | none | — |
| Customer login | `mobile/src/app/(customer-auth)/login.tsx` | customer | `AuthPage` look; **login rule is mobile=mobile**, not vehicle-as-username |
| Customer tabs layout | `mobile/src/app/(customer)/_layout.tsx` | customer | `Header` + `BottomNav` |
| Dashboard | `mobile/src/app/(customer)/index.tsx` | customer | `DashboardPage` |
| Problem | `mobile/src/app/(customer)/complaint.tsx` | customer | `ComplaintPage` |
| Estimate | `mobile/src/app/(customer)/estimate.tsx` | customer | `EstimatePage` |
| Bills | `mobile/src/app/(customer)/invoices.tsx` | customer | `InvoicesPage` |
| Gate pass | `mobile/src/app/(customer)/gatepass.tsx` | customer | `GatePassPage` (no fake QR / security mode) |
| Feedback | `mobile/src/app/(customer)/feedback.tsx` | customer | `FeedbackPage` |
| Book service | `mobile/src/app/(customer)/booking.tsx` | customer | `ServiceBookingPage` (hidden tab; open from dashboard) |
| Repair tracker | `mobile/src/app/(customer)/tracker.tsx` | customer | `RepairTrackerPage` (hidden tab; open from dashboard) |
| Staff login | existing `mobile/src/app/(auth)/login.tsx` | staff | — |
| Staff tabs | existing `mobile/src/app/(tabs)/…` | staff | — |

`mobile/src/app/index.tsx` must branch:

1. Customer session/token → `/(customer)`
2. Staff `supabase.auth` session → `/(tabs)/home`
3. Else → `/(audience)` chooser

Staff `(auth)/_layout.tsx` must **not** redirect a customer session into `/(tabs)/home`.

### 5.2 API layer (mobile)

Recreate in Expo (do not import `bodyshop/src`):

- `mobile/src/lib/api/customerAuth.ts` — start/end session, later OTP
- `mobile/src/lib/api/customerPortal.ts` — job, history, complaint, feedback, estimate, gate pass, settlement, booking, repair card
- `mobile/src/lib/customer/math.ts` — estimate line/totals parse; billed − received − remaining (only on workshop numbers)
- `mobile/src/context/CustomerSessionContext.tsx` — token in SecureStore, never AsyncStorage for the token
- `mobile/src/components/customer/*` — shared chrome, cards, vehicle picker, workshop QR renderer

Web: `src/lib/api/customer.ts` `authenticateCustomer` uses the same RPC wrappers so web and mobile cannot drift.

### 5.3 Bodyshop → Expo parity map (Phase 3 lock)

Port **behavior and layout**. Fill slots from RPCs. If the workshop did not issue a value, show pending / `—`.

| Bodyshop piece | Expo | Data rule |
|---|---|---|
| Header “Techwheels Customer Services” + vehicle badge + logout | `CustomerScreen` | Session vehicle picker; logout ends RPC session |
| Bottom nav Home / Problem / Estimate / Bills / Gate Pass / Feedback | `(customer)/_layout.tsx` | Same six tabs |
| Footer SRD v1.0 | `CustomerScreen` footer | Static chrome |
| Gradient hero (reg, model, KM, service, advisor, in-service vs delivered) | `index.tsx` | Job RPC. No default “Tata Motors”, “Creative Edition”, “Valued Customer”, warranty, AMC |
| 2×2 actions + booking + tracker tiles | `index.tsx` | `router.push` to those routes |
| Workshop record (JC, advisor, branch, settlement) | `index.tsx` | Real fields only. Settlement from `customer_get_settlement`, not “Payment Due” by default |
| Advisor Call | `index.tsx` | `tel:` only if advisor phone exists. **Never** `owner_phone` |
| Live refresh | focus + ~8s poll of RPCs | No anon `postgres_changes` on workshop tables |
| Multi-problem + KM + notes | `complaint.tsx` | RPC `problems[]` + `notes` + `current_km`; KM write-back on open reception row |
| Estimate switcher, item table, subtotal/discount/GST/grand total, approve / reject modal | `estimate.tsx` | Only keys/items the RPC returned. Do not apply 5% / 18% unless workshop sent those fields. No `parts_pricing.json` |
| Settlement billed / received / remaining | `invoices.tsx` + `math.ts` | Payment payload → mechanical invoice → expected invoice → issued estimate totals. Do not invent ₹0 as a fake receipt |
| Invoice download | `invoices.tsx` | Only `invoice_drive_url` (or history URL) |
| Desk payment note (UPI/card/cash at workshop) | `invoices.tsx` | Informational. No in-app checkout |
| Gate pass pending vs issued card, share/print | `gatepass.tsx` | RPC null → pending. QR **only** if payload has workshop `qr_token` / `qr` |
| Feedback stars + tags + remarks | `feedback.tsx` | RPC submit |
| Book service (type, date, pickup, remarks) | `booking.tsx` | `customer_submit_booking` |
| Repair tracker stages + insurance card | `tracker.tsx` | Job fields + `customer_get_repair_card`. No fake “Assigned” surveyor |
| Auth brand card, show/hide password | `(customer-auth)/login.tsx` | **Not** vehicle-as-username, **not** quick-test credentials, **not** `?reg=` |

**Do not port**

| Bodyshop piece | Why |
|---|---|
| `getEstimateDetails` / `buildEstimateForVehicle` / `parts_pricing.json` | Fake prices |
| Sandbox `RJ14TEST*` vehicles and 1-click fill | Fake workshop rows |
| Vehicle No as username; Hindi “vehicle or mobile” login copy as the rule | Product lock is mobile=mobile |
| `getGatePassInfo` / `GP_AUTH_*` / 5×5 decorative QR | Client-made QR |
| Security-mode “Confirm QR Scan & Allow Exit” | Fake grant; not Accounts |
| Default JC-2026-00125, AMAN GUPTA, Sitapura, INV-PROCESSED, GP-PENDING as if issued | Fake identity |
| localStorage estimate/payment/gate-pass stores | Not DB truth |
| Direct `.from(workshop_table)` and client realtime on those tables | Anon must not read them |

---

## 6) Data Model

Applied 2026-09-16 (`20260916120000`). Re-grep dump after refresh.

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

## 7) RPC Contract

All `SECURITY DEFINER`. Workshop tables stay ungranted to `anon`. Session RPCs execute only with a valid token (or later customer JWT); they **read phone from `customer_sessions`**, never from a client-supplied phone field.

Helpers (`customer_collect_vehicles`, `customer_require_session`, hash/norm/assert) stay **revoked** from `public` / `anon` / `authenticated` (`20260916121500`). Supabase default-grants EXECUTE after `CREATE FUNCTION` — re-REVOKE after any replace.

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
| `customer_submit_complaint` | token + payload (must include a my-reg) | id | Write only if reg ∈ session vehicles. Persist `problems[]` + `notes` + `current_km`; update open reception `km_reading` when KM > 0 |
| `customer_submit_feedback` | token + payload | id | Same |
| `customer_list_estimates` | token + optional `p_reg_number` | estimates | Phone-scoped. Reception URLs + bot JSON + `customer_estimates` if present |
| `customer_set_estimate_decision` | token + estimate id + approve/reject + reason | updated row | Estimate’s vehicle must be in session vehicles |
| `customer_get_gate_pass` | token + optional `p_reg_number` | issued gate pass or null | Phone-scoped; never mint a client QR |
| `customer_get_settlement` | token + optional `p_reg_number` | payment payload / mechanical invoice / expected invoice or null | Phone-scoped. No invented billed amount |
| `customer_submit_booking` | token + payload | id | `customer_booking_portal` row; type + date required; pickup requires address |
| `customer_get_repair_card` | token + optional `p_reg_number` | latest `bodyshop_repair_cards` row or null | Phone-scoped |

Migrations: `20260916120000` (core), `20260916121500` (helper revoke), `20260916123000` (parity: settlement, booking, repair card, complaint KM). Apply `20260916123000` in the SQL editor if remote history blocks `db push`.

Phase 4 (optional step-up): `customer_request_otp` / `customer_verify_otp` still keyed to the same phone. Does not change row visibility.

**Rate limit** `customer_start_session` per phone + IP. Same generic error whether the phone is unknown or mistyped (do not leak “this mobile exists”).

---

## 8) Business Rules

1. One binary, two shells. No mixed navigation.
2. Customer sees **all** vehicles for the session phone, and **only** those vehicles. Screens load from `customer_list_my_vehicles` / job RPCs. Selected vehicle is UI state; switching vehicle never loads another phone’s data.
3. Missing KM / invoice / estimate / gate pass / billed amount / QR / warranty renders as pending — never a fake number or decorative QR.
4. Settlement math (billed − received = remaining; paid / partial / due / quoted) runs **only** on workshop-posted figures (payment payload, mechanical invoice, expected invoice, or issued estimate `grand_total`). Do not treat a missing received amount as a fake ₹0 receipt unless a payment record said so.
5. Estimate GST/discount appear only when those keys exist on the RPC row. Do not apply catalog 5% / 18%.
6. Gate-pass QR encodes a workshop `qr_token` only. No `GP_AUTH_*`, no 5×5 grid, no print-time mint.
7. Advisor Call uses advisor phone only — not the customer’s `owner_phone`.
8. Staff modules remain behind `get_all_my_permissions()`; customer sessions must not be inserted into `public.users`.
9. Open staff signup is forbidden on the public dual-audience build.
10. `bodyshop/` is not a release vehicle after Phase 0 (secret removal). Archive when Phase 5 customer shell is on the staff binary. Until then it is the visual/workflow reference only.
11. Web and mobile customer login call the same RPCs with the same username=password=mobile rule.
12. Background location / job-card camera are staff-only runtime permissions.
13. Web `?reg=` / `?phone=` auto-login is removed. Deep links after login may select a **my** vehicle only.

---

## 9) Phase Plan (summary)

Detail and checkboxes live in [PHASES.md](PHASES.md) and [CHECKLIST.md](CHECKLIST.md).

| Phase | Name | Depends on | Outcome |
|---|---|---|---|
| 0 | Remove client `service_role` | none (start immediately) | Key deleted from `bodyshop` client + tracked `.env`; dashboard key left as-is |
| 1 | Customer RPCs + web cutover | Phase 0 | Phone=phone login RPC; web `authenticateCustomer` replaced; dump refreshed |
| 2 | Expo audience shell + staff signup lock | Phase 1 | Chooser + routing; staff cannot land in customer shell and vice versa |
| 3 | Customer screens (bodyshop parity) | Phase 2 | Expo recreates bodyshop workflows via RPCs; booking + tracker included; no fakes |
| 4 | Phone OTP (optional step-up) | Phase 3 | Extra proof on the same phone; does not change row visibility |
| 5 | Release + archive | Phase 3 minimum | OTA, store copy, archive `bodyshop/`, evidence |

Phase 0 is client-only secret removal (no dashboard rotation). It may run in parallel with Body & Paint redesign (MOBILE-BP-RD).

**Progress 2026-09-16:** Phase 0 done. Phase 1 core RPCs + web cutover applied (`20260916120000` + `20260916121500`). Phase 2 shell coded and device-checked for login. Phase 3 screens coded in `mobile/` (bodyshop visual port). Apply `20260916123000` for settlement/booking/repair/KM. Phase 4 not this ship. Phase 5 after device smoke + OTA.

---

## 10) Explicitly Wrong Approaches (do not implement)

| Approach | Why forbidden |
|---|---|
| Ship two store apps | User requirement; Capacitor customer has no iOS |
| WebView `bodyshop/` inside Expo | Keeps service-role risk and a second stack |
| Copy `bodyshop/src` DOM into RN | Wrong renderer; recreate the same screens/workflows in Expo |
| Skip a bodyshop customer workflow “because it was an orphan page” | Booking + tracker must live in Expo before `bodyshop/` is deleted |
| Port `bodyshop` login as vehicle-number + password | Product lock: mobile=mobile only |
| Port sandbox / 1-click test credentials | Fake workshop identity on production UI |
| Add `'customer'` to `users.role` | Breaks staff RBAC CHECK and admin |
| `GRANT` workshop tables to `anon` | Destroys dealer/SA RLS |
| Trust client-sent phone after login | Session phone is server-side; optional reg must belong to that phone |
| Invent a vehicle when phone is unknown | Fail closed; that was the old web hole |
| Client-generated estimates / gate-pass QR / warranty / AMC | Not DB truth |
| Security-mode fake exit | Not Accounts clearance |
| In-app UPI checkout | Later plan; show posted settlement only |
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
| C-08 | Estimate missing in DB for my vehicle | Empty / pending — no synthetic lines, no 18% GST invented |
| C-09 | Gate pass not issued | Null — no client QR |
| C-09b | Gate pass issued **without** `qr_token` | Pass fields shown; no decorative QR |
| C-09c | Gate pass issued **with** workshop `qr_token` | Encode that token only |
| C-10 | Staff signup without invite | Blocked |
| C-11 | Web and mobile same mobile=mobile login | Same vehicle set from same RPC |
| C-12 | Phase 4 OTP (if enabled) to session phone | Still phone-scoped rows; no `public.users` row |
| C-13 | No mechanical invoice / payment payload / expected amount | Settlement empty / quoted only if estimate `grand_total` exists |
| C-14 | Booking without preferred date | RPC fail; no row |
| C-15 | No `bodyshop_repair_cards` row | Tracker stages from job only; no fake claim/surveyor |
| C-16 | Dashboard with null model / advisor / JC | `—` / awaiting KM — never Creative Edition / AMAN GUPTA / JC-2026-00125 |

---

## 12) Risks

| Risk | Mitigation |
|---|---|
| `service_role` still in a client bundle | Phase 0: delete from `bodyshop` source and `.env`. Do not rotate the dashboard key. |
| Customer RPC over-returns other customers’ jobs | Every RPC: `phone = session.phone`; optional reg must be in that phone’s vehicle set |
| Phone is a weak password (printed on JC) | Accepted for Phase 1 UX. Mitigate with rate limit + generic errors. OTP is optional later; row isolation does not depend on OTP |
| OTP vendor not ready | Ship Phase 1–3 on phone=phone session. Phase 4 is optional step-up, not a ship gate |
| Store review (background location) | Customer mode never requests it; listing names both audiences |
| `post_feedback_bot_data` as write sink | Distinct `mode` (`customer_portal_concern`, `customer_portal_feedback`, `customer_booking_portal`, estimate/payment/gatepass payloads). Follow-up plan for first-class tables if Phase 3 evidence needs it |
| Dual login confuses staff in field | Default last-used audience; staff bookmark still works |
| Deleting `bodyshop/` before Expo parity | Phase 3 lock in §5.3. Archive only in Phase 5 after device smoke |
| Helpers EXECUTE-granted to anon after `CREATE FUNCTION` | `20260916121500` + re-REVOKE after any replace |
| `db push` blocked by remote history | Apply SQL in editor; do not invent a second migration path |

---

## 13) Success Criteria (plan done)

1. Phase 0–5 checklists complete with evidence notes.
2. `full_metadata.sql` refreshed after Phase 1 and Phase 4 migrations.
3. Production APK/iOS (or OTA on existing runtime) shows audience picker; both paths verified on device.
4. `bodyshop/` not in any store listing; folder archived or marked do-not-ship in this plan’s Phase 5 evidence.
5. Expo customer shell covers every `bodyshop/` customer workflow in §5.3 (including booking and tracker) without the forbidden fakes in §3 / §10.
6. No `service_role` string in `bodyshop/`, `mobile/`, or `src/` client bundles.
7. `public.users_role_check` still excludes `customer`.
8. Logged-in customer never receives another phone’s vehicle/job/estimate/gate-pass row.

---

## 14) Resume Protocol

1. Read this file + [PHASES.md](PHASES.md) + [CHECKLIST.md](CHECKLIST.md).
2. Confirm dump path: `supabase/backups/full_metadata.sql`.
3. Confirm `20260916123000` is applied if settlement/booking/tracker RPCs are required.
4. Continue the first unchecked CHECKLIST item in the current phase.
5. Do not start new customer UI against direct table reads, `parts_pricing.json`, or a client QR.
6. Update MOBILE-010 and the mobile tracker/index when phase status changes.
