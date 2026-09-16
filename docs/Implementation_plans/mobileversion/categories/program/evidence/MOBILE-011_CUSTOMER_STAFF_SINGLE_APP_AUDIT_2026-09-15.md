# MOBILE-011 — Customer + Staff Single-App Audit

**Date:** 2026-09-15  
**Status:** Evidence (audit only — not implemented)  
**DB truth:** `supabase/backups/full_metadata.sql`  
**Scope:** `/bodyshop` (customer Capacitor prototype) vs `/mobile` (staff Expo app already built for APK + iOS)  
**Decision requested:** One native app only, with login-home **Login as Customer** / **Login as Staff**  
**Implementation plan:** [MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md](../../auth/active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)

---

## 1. Executive recommendation

**Keep one Expo binary in `mobile/`.** Add a customer audience inside that existing app. Do not ship `bodyshop/` as a second APK/iOS app, and do not wrap the Capacitor WebView inside Expo.

The login screen should copy the web app (`src/pages/LoginPage.tsx`): two modes on one chooser, then a **separate shell** after login. Customer never sees staff modules. Staff never sees customer routes.

The merge is **not** “put two buttons on the current Expo login screen.” The blocker is identity: customers are phone numbers on vehicles, not `auth.users`, and current RLS will not serve them.

| Keep | Do not keep as a shipped app |
|---|---|
| `mobile/` — Expo 54, `com.techwheels.service`, EAS, App Store id `6774519420` | `bodyshop/` — Capacitor 8, `com.techwheels.bodyshop`, Android only, no iOS |

Customer UX to **port** is the web portal, not the Capacitor folder:

- `src/pages/LoginPage.tsx` — Staff / Customer tabs (UX to copy)
- `src/pages/CustomerPortalPage.tsx` — live stage, estimates, complaints, escalation, feedback, gate pass, history
- `src/lib/api/customer.ts` — vehicle/phone lookup

`bodyshop/` is an older Capacitor copy of that idea. Archive it after the Expo customer shell matches. Do not publish `com.techwheels.bodyshop`.

---

## 2. What was audited

| Surface | Path | Finding |
|---|---|---|
| Customer Capacitor app | `bodyshop/` | Vite + React DOM + Capacitor 8. ~22 source files, ~4.4k lines. Android project present. **No `ios/`.** |
| Staff Expo app | `mobile/` | Expo 54 + React Native + EAS. ~164 source files. Production modules, OTA, Play/App Store packaging. |
| Web dual login | `src/pages/LoginPage.tsx` | Already has Staff Login / Customer Login tabs. |
| Web customer product | `src/pages/CustomerPortalPage.tsx` (~3,477 lines) | The real customer portal. |
| Web customer API | `src/lib/api/customer.ts` | Lookup against reception, bodyshop cards, `vehicles`, `all_service_data`. |
| Schema / RLS / grants | `supabase/backups/full_metadata.sql` | No customer identity table. Staff-only RLS. No anon table grants on workshop tables. |

---

## 3. Folder comparison (as they exist today)

| | `bodyshop/` (labelled customer) | `mobile/` (labelled staff) |
|---|---|---|
| Stack | Vite + React DOM + Capacitor 8 | Expo 54 + React Native + EAS |
| App id | `com.techwheels.bodyshop` | `com.techwheels.service` |
| Platforms | Android only | Android + iOS already built |
| Auth | Vehicle / mobile as username, mobile as password. **No** `auth.users` session | Email + password via `supabase.auth` |
| Identity | Latest row in `service_reception_entries` / `bodyshop_repair_cards` / `vehicles` | `auth.users` → `public.users` → `user_employee_links` → `employee_master` |
| Access model | Client queries tables directly (and currently bypasses RLS) | `user_module_permissions` + `get_all_my_permissions()` |
| Screens | Dashboard, Problem, Estimate, Bills, Gate Pass, Feedback. Service booking / repair tracker pages exist but are **not wired** (dead imports) | Home, Search, New, Alerts, Profile + hidden modules: reception, floor incharge, bodyshop repair/floor, autodoc, reports, import, admin, telecalling |
| Maturity | Prototype. Sandbox credentials on login. Fake fallback fields. Hardcoded secrets | Production workspace with OTA (`eas update`) |

They are not two flavours of the same product. React DOM and React Native do not share UI. Copy-pasting `bodyshop/` into `mobile/` will not compile.

---

## 4. What is wrongly done

This section is the defect list. These are current bugs / architecture mistakes, not future work.

### 4.1 Critical — secrets and RLS bypass

**Wrong:** `bodyshop/src/lib/supabase.ts` prefers `VITE_SUPABASE_SERVICE_KEY` and ships a **hardcoded `service_role` JWT** as fallback.

Effect:

- The customer APK bypasses **every** RLS policy.
- Anyone who unpacks the APK can read and write the whole database.
- This is why the Capacitor app “works” against tables that have no customer/anon policies.

**Must do before any customer build:** remove that service-role key from client code (product decision 2026-09-16: do **not** rotate the dashboard key). Never put `service_role` in a mobile/web bundle.

Staff mobile client is correct on this point: it uses the anon key from Expo env / `expo.extra` (`mobile/src/lib/supabase.ts`).

### 4.2 Critical — no customer identity in DB truth

**Wrong:** Treating “customer login” as a real session when the schema has no customer user.

From `full_metadata.sql`:

- `public.users.role` CHECK is only `admin | manager | staff | viewer | driver`. **There is no `customer`.**
- Staff identity is complete: `auth.users` → `public.users` → `user_employee_links` (`user_id`, `employee_code`, `dealer_code`) → `employee_master`.
- Customer is only a phone on a vehicle/job:
  - `vehicles.owner_phone` / `owner_name` / `reg_number`
  - `service_reception_entries.owner_phone` (already constrained to `^[0-9]{10}$`)
  - `bodyshop_repair_cards.customer_phone`
  - `all_service_data.contact_phones` / `last_service_customer_mobile_no`

A customer is **not** a user. Putting customers into `public.users` would break staff RBAC, admin, and `user_employee_links`.

### 4.3 Critical — RLS cannot serve a customer with the anon key

**Wrong:** Customer screens query `service_reception_entries`, `vehicles`, `bodyshop_repair_cards`, `post_feedback_bot_data` from the client as if those tables were public.

DB truth:

- Those tables have RLS enabled.
- Policies are `TO authenticated` and keyed off admin / module / dealer / SA code.
- Grants are `authenticated` + `service_role`. **Not `anon`.**
- `post_feedback_bot_data` has an admin policy only in this dump.
- There are **no customer RLS policies** and **no customer RPCs**.

So:

- Capacitor customer app only works because of the service-role key (4.1).
- Web customer portal using the anon key **cannot legally read** the customer’s own job, estimate, or invoice, unless some other leaked privileged key is in play.
- Unification **must** add `SECURITY DEFINER` RPCs (then OTP + customer-scoped RLS). Do not open workshop tables to `anon`.

### 4.4 High — customer “password” is not authentication

**Wrong in `bodyshop`:** Username = vehicle or mobile, password = registered mobile. The password is the same public phone printed on job cards, WhatsApp messages, and invoices. Matching is `endsWith` on digits (`bodyshop/src/lib/api.ts` `authenticateCustomer`). Hardcoded quick-test credentials (real-looking reg + phone) sit on the login screen.

**Wrong in web (worse):** `src/lib/api/customer.ts` `authenticateCustomer` succeeds if a lookup finds **any** rows. It does **not** prove the caller owns that phone. `src/App.tsx` also auto-enters the portal from URL `?reg=` / `?phone=` with no secret.

This is a lookup, not a login. Do not port it as-is into Expo.

### 4.5 High — two native apps for one product

**Wrong:** Maintaining `bodyshop/` as a second customer app while `mobile/` already has APK + iOS.

Cost:

- Two app ids, two listings, two update trains.
- Customer Capacitor has **no iOS**. Staff Expo already does.
- Capacitor and Expo cannot share screens.
- User asked for one folder / one build.

### 4.6 High — customer product was forked into the wrong folder

**Wrong:** Building customer UX in `bodyshop/` instead of extending the already-complete web portal into Expo.

| Source | Reality |
|---|---|
| `bodyshop/` | Prototype. Dead imports: `ServiceBookingPage` calls `createServiceBooking`, `RepairTrackerPage` calls `fetchBodyshopRepair` — **neither exists** in `bodyshop/src/lib/api.ts`. Fake warranty/AMC/KM/payment fields when falling back to `vehicles`. Sandbox `RJ14TEST*` vehicles. |
| Web `CustomerPortalPage` | The actual customer product (~3.5k lines). |

Port **web** behavior into `mobile/src/app/(customer)/…`. Do not treat `bodyshop/` as source of truth.

### 4.7 High — estimates and gate passes are not real tables

**Wrong:** There is **no** `customer_estimates` table and **no** `issued_gate_pass` table in `full_metadata.sql`.

Current workaround (web + bodyshop):

- Estimates / gate-pass payloads stuffed into `post_feedback_bot_data.feedback_text` (JSON in a feedback column) and/or `localStorage`.
- `bodyshop/src/lib/api.ts` `getEstimateDetails()` can synthesise a priced estimate from `parts_pricing.json` even when no workshop estimate exists.
- `getGatePassInfo()` can mint a client-side QR token (`GP_AUTH_…_SECURE`) that the database does not issue.

Do not clone this into Expo. Use reception / accounts / estimate columns that already exist, or add real customer-facing tables via migration. `localStorage` is not DB truth.

### 4.8 High — open staff signup on an app that customers will download

**Wrong:** `mobile/src/app/(auth)/signup.tsx` lets anyone create a staff account. Fine when only employees had the APK. Fatal on Play Store / App Store once customers install the same binary.

Staff signup must become invite-only (admin creates the user, or email domain + `public.users.is_active = false` until approved). Customer path must not show “Join your dealership's service team.”

### 4.9 Medium — Expo staff shell has no audience split

**Wrong (for the single-app goal, not a current production bug):** Routing assumes “has `supabase.auth` session ⇒ staff home.”

- `mobile/src/app/index.tsx` — session → `/(tabs)/home`, else `/(auth)/login`
- `mobile/src/app/(auth)/_layout.tsx` — any session redirects to staff tabs
- `mobile/src/app/(tabs)/_layout.tsx` — same
- Staff modules are hidden from the tab bar (`href: null`) but **still in the bundle** and reachable by route if a customer session were ever mixed in

Without an `audience` on the session, a future customer JWT would land inside the workshop.

### 4.10 Medium — store permissions vs dual audience

**Wrong if the same listing is framed as a customer app without gating:** `mobile/app.json` requests camera, photos, microphone, Face ID, and **background location**. Acceptable for workshop staff. Reviewers will reject a “track my car” customer listing that always needs background location.

Customer mode must never request background location. Camera/photos only if a customer flow needs them (most of the current portal does not). Store copy must say the app is for Techwheels customers **and** authorised workshop staff.

### 4.11 Medium — fake / denormalised customer data

**Wrong in `bodyshop/src/lib/api.ts` `fetchCustomerVehicles`:** when live columns are missing, the client invents:

- warranty “Active (3 Years / 1,00,000 KM)”
- AMC “Gold Care AMC Active”
- billed amounts (`4850`, `12500`, `3200`)
- payment/QC/wash/gate-pass inferred from `invoice_done_at`
- VIN minted as `'MAT' + reg_number`

That is not DB truth. Customer screens must show null/pending, not invented workshop state.

### 4.12 Low — incomplete Capacitor customer app

**Wrong / unfinished in `bodyshop/`:**

- `ServiceBookingPage` and `RepairTrackerPage` are not mounted from `bodyshop/src/App.tsx` and call missing API functions.
- Quick-test credentials on the production login UI.
- Android only; no iOS counterpart to the staff app.
- Polling every 4 seconds plus realtime on `service_reception_entries` / `bodyshop_repair_cards` while using a privileged key.

---

## 5. Database truth (identity and access)

### 5.1 Staff (complete, keep)

```
auth.users
  → public.users (id = auth uid, role admin|manager|staff|viewer|driver)
  → user_employee_links (user_id, employee_code, dealer_code, is_primary, is_active)
  → employee_master (employee_code, role CSV: SA, TECHNICIAN, FLOOR_INCHARGE, …)
  → user_module_permissions + modules + get_all_my_permissions()
```

This is the only login model `mobile/` implements today.

### 5.2 Customer (indirect only — do not force into `public.users`)

No `customer_accounts`, `customer_profiles`, or `customer` role exists.

Identify a customer by:

1. `owner_phone` / `customer_phone` (10 digits)
2. `reg_number`
3. optional chassis from `all_service_data` / `vehicles.vin`

Do **not** add `'customer'` to `users.role`. Use:

- Staff: current path (unchanged)
- Customer: `auth.users` with `app_metadata.audience = 'customer'` plus a small `customer_profiles` table (`auth_user_id`, `phone`). No `employee_code`. No module permissions.

### 5.3 Tables customer UI needs vs what RLS allows today

| Customer need | Current source | RLS today |
|---|---|---|
| Active job / vehicle | `service_reception_entries`, `bodyshop_repair_cards`, `vehicles` | Staff/dealer/SA only |
| Lifetime history | `all_service_data` | Staff-oriented; no customer policy found in this audit |
| Complaint / feedback | `post_feedback_bot_data` (wrong home for this) | Admin policy only in dump |
| Estimate approve/reject | Not a first-class table | N/A |
| Gate pass | Invented client-side or JSON in feedback text | N/A |

Correct path: `SECURITY DEFINER` RPCs that return **only** rows for that phone/reg, then later OTP + RLS on a customer-visible slice. Never `GRANT` workshop tables to `anon`.

---

## 6. Target architecture (one folder, one build)

```
App open
  → Audience picker: Login as Customer | Login as Staff
      → Customer: phone OTP (interim: RPC proving phone+reg) → (customer) tab shell
      → Staff: existing email/password → existing (tabs) shell
```

Proposed Expo routes (do not mix stacks):

- `src/app/(audience)/index.tsx` — Customer / Staff chooser
- `src/app/(customer)/…` — dashboard, problem, estimate, bills, gate pass, feedback
- `src/app/(auth)/login.tsx` — staff only (current screen, signup locked)
- existing `src/app/(tabs)/…` — staff only

`src/app/index.tsx` must route by **audience**, not only by “session present.”

Staff modules stay behind `user_module_permissions`. Customer shell is a fixed small set of screens. Customer JWT must fail closed on every staff table.

---

## 7. What not to do

| Reject | Why |
|---|---|
| Two APKs / two store listings | User wants one app; Capacitor customer has no iOS; staff already shipped. |
| WebView of `bodyshop/` or the web portal inside Expo | Fast, but keeps service-role risk, DOM UI, and a second codebase. |
| Copy `bodyshop/` React DOM into `mobile/` | Different renderer. Will not run. |
| Put customers in `public.users` | `users_role_check` and staff RBAC are not built for that. |
| Ship vehicle+phone as password | Phone is public. Web version does not even check it. |
| Open workshop tables to `anon` | Breaks dealer/SA RLS for the whole workshop. |
| Leave service_role in any client | Full database compromise. |
| Leave open staff signup | Customers will create workshop accounts. |
| Invent warranty/AMC/prices/QR in the client | Not DB truth. |

---

## 8. Suggested build order (when implementation starts)

1. **Remove** the service-role key from `bodyshop/src/lib/supabase.ts` and tracked `bodyshop/.env`. Do **not** rotate the dashboard key (product decision 2026-09-16).
2. **DB:** customer RPCs (then OTP + `customer_profiles`). No customer rows in `public.users`.
3. **Expo:** audience picker → customer login → customer tab shell. Staff login unchanged. Staff signup locked.
4. **Port** dashboard / problem / estimate / bills / gate pass / feedback from `CustomerPortalPage`, talking only to those RPCs. Show real nulls, not invented fields.
5. **Verify** in the same binary: customer cannot open `/(tabs)/admin` (or any staff module); staff cannot open `/(customer)`.
6. **OTA** to existing `com.techwheels.service` builds. Archive `bodyshop/`. Do not publish `com.techwheels.bodyshop`.

Store listing: one binary, runtime-gated permissions, description that names both audiences.

---

## 9. Source files (audit evidence)

### Customer Capacitor (`bodyshop/`)

- `bodyshop/package.json` — Vite + Capacitor, no Expo
- `bodyshop/capacitor.config.ts` — `com.techwheels.bodyshop`
- `bodyshop/src/lib/supabase.ts` — **service_role in client (defect 4.1)**
- `bodyshop/src/lib/api.ts` — lookup + weak phone password + invented fallbacks
- `bodyshop/src/pages/AuthPage.tsx` — hardcoded test credentials
- `bodyshop/src/App.tsx` — tab shell; booking/tracker not mounted
- `bodyshop/android/` — Android wrapper only; no `bodyshop/ios/`

### Staff Expo (`mobile/`)

- `mobile/package.json` / `mobile/eas.json` / `mobile/app.json` — production EAS, `com.techwheels.service`, ASC `6774519420`
- `mobile/src/lib/supabase.ts` — anon key (correct)
- `mobile/src/context/AuthContext.tsx` — email/password staff session
- `mobile/src/app/index.tsx`, `(auth)/_layout.tsx`, `(tabs)/_layout.tsx` — session ⇒ staff only
- `mobile/src/app/(auth)/login.tsx` / `signup.tsx` — staff UX; open signup (defect 4.8)
- `mobile/src/app/(tabs)/home.tsx` — module grid from `get_all_my_permissions()`
- `mobile/src/lib/businessRoles.ts` — employee_master role CSV (staff operations, not customers)

### Web (real customer product + dual login)

- `src/pages/LoginPage.tsx` — Staff / Customer tabs (copy this UX)
- `src/pages/CustomerPortalPage.tsx` — port this behavior
- `src/lib/api/customer.ts` — lookup; **does not verify password (defect 4.4)**
- `src/App.tsx` — `customerVehicle` localStorage + `?reg=` auto-login (defect 4.4)
- `src/lib/supabase.ts` — anon key (correct for staff; insufficient for customer without RPCs)

### DB truth

- `supabase/backups/full_metadata.sql`
  - `public.users` (~line 28651) — no customer role
  - `user_employee_links` (~line 28549)
  - `employee_master` (~line 24182)
  - `service_reception_entries` (~line 3784) + staff-only RLS (~lines 42946–43057)
  - `vehicles` (~line 25790)
  - `all_service_data` (~line 8653)
  - `post_feedback_bot_data` (~line 26742)
  - No `customer_estimates` / gate-pass tables

---

## 10. Bottom line

The login-home idea is right. The folder to keep is **`mobile/`**. The customer UX to copy is the **web portal**, not the Capacitor prototype.

What is wrongly done today: a second half-built Android app, a leaked service-role key, a fake customer password, no customer row in DB truth, RLS that cannot serve customers, estimates/gate passes stored as feedback JSON / localStorage, invented vehicle fields, and an open staff signup that cannot survive a public store listing.

Do not start by copying `bodyshop/` screens. Start by rotating the key, adding customer-scoped RPCs, and putting an audience picker in Expo.
