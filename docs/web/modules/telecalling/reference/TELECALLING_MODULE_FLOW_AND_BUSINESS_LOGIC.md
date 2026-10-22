# OPS-TELECALL-001: Telecalling Module Flow and Business Logic

Last Updated: 2026-10-22
Owner: Operations Team + Platform Team
Scope: Web route /telecalling, shared Supabase edge function, and mobile parity screen
Status: Active operations authority for module behavior

---

## 1) Purpose

This document is the single operational reference for the Telecalling module.

Use this file to understand:
1. End-to-end flow from UI to edge function to database.
2. Business rules for assignment, call outcomes, and campaign stats.
3. Role access behavior for web and mobile.
4. What must be updated when this module changes in future.

---

## 2) Source of Truth Map

Application sources:
1. `src/pages/TelecallingPage.tsx`
2. `mobile/src/app/(tabs)/telecalling.tsx`
3. `supabase/functions/telecalling/index.ts`
4. `src/App.tsx` (web route and module access gate)

Authoritative database/schema sources:
1. `local_folder/backups/full_database.sql` (authoritative dump)
2. `local_folder/backups/chunks/full_database.sql.part_000` (table/function DDL mirror)
3. `local_folder/backups/chunks/full_database.sql.part_004` (constraints/indexes/FKs/RLS mirror)

---

## 3) Module Goal

Telecalling is a service-reminder workflow that:
1. Creates date-range campaigns from customers due for service.
2. Assigns leads to telecallers one-by-one via an atomic picker.
3. Captures call outcomes and follow-up dates.
4. Tracks campaign performance and daily telecaller summary.

---

## 4) End-to-End Architecture

```mermaid
flowchart TD
  A[Web Telecalling Page] -->|JWT Bearer| E[Edge Function telecalling]
  M[Mobile Telecalling Screen] -->|JWT Bearer| E
  E --> U[users table: role and email]
  E --> C[telecall_campaigns]
  E --> T[telecall_assignments]
  E --> R[RPC telecall_get_next_assignment]
  E --> S[all_service_data]
  R --> T
  T --> C
  T --> S
```

---

## 5) Access and Roles

### 5.1 Web route access

Route `/telecalling` is gated by module name `telecalling` in `src/App.tsx`.

Access rules:
1. Users need `telecalling` in `get_all_my_permissions()` result.
2. Admin gets broad access through admin handling in app-level permission loading.

### 5.2 In-page role behavior

Inside Telecalling page:
1. User role is read from `users.role`.
2. `admin` sees Admin Dashboard and Telecaller View toggle.
3. Non-admin users see Telecaller dashboard only.

### 5.3 Edge authorization

Each edge call requires bearer token.
1. Token is validated with Supabase auth client.
2. User identity is resolved to `users.email` and `users.role`.
3. Admin-only actions are enforced server-side (`create_campaign`, `campaign_stats`, `close_campaign`).

---

## 6) Data Model (Authoritative)

### 6.1 Lead source table

`all_service_data` is the lead source.
Important fields used by Telecalling:
1. `id`
2. `contact_phones`
3. `assumed_next_service_date`
4. `assumed_next_service_type`
5. Customer identity and vehicle fields (`first_name`, `last_name`, `model`, `vehicle_registration_number`, etc.)

### 6.2 Campaign table

Table: `telecall_campaigns`

Core columns:
1. `id`
2. `campaign_name`
3. `date_from`, `date_to`
4. `status` (default `active`)
5. counters: `total_leads`, `pending_count`, `completed_count`, `booked_count`, `whatsapp_sent_count`
6. audit fields: `created_by`, `created_at`, `updated_at`

### 6.3 Assignment table

Table: `telecall_assignments`

Core columns:
1. `id`, `campaign_id`, `customer_id`
2. `assigned_to` (user email)
3. `status` (default `pending`)
4. call outcome fields: `call_notes`, `booking_date`, `callback_date`, `called_at`
5. counters: `call_count`, `no_answer_count`
6. WhatsApp fields: `whatsapp_sent`, `whatsapp_status`
7. timestamps: `assigned_at`, `updated_at`

### 6.4 Key constraints and relationships

From authoritative schema mirror:
1. Unique: `(campaign_id, customer_id)` on `telecall_assignments`
2. FK: `telecall_assignments.campaign_id -> telecall_campaigns.id` (cascade delete)
3. FK: `telecall_assignments.customer_id -> all_service_data.id` (cascade delete)

### 6.5 RPC used for concurrency-safe assignment

Function: `telecall_get_next_assignment(p_campaign_id, p_user_email)`

Behavior:
1. Select first unassigned `pending` row ordered by assignment id.
2. Lock row with `FOR UPDATE SKIP LOCKED`.
3. Update row to `assigned` and set `assigned_to`, `assigned_at`, `updated_at`.
4. Return `(assignment_id, customer_id)`.

---

## 7) API Actions in Edge Function

Endpoint: Supabase edge function `telecalling`

### 7.1 `create_campaign` (admin only)

Input:
1. `campaign_name`
2. `date_from`
3. `date_to`

Logic:
1. Insert campaign with status `active`.
2. Query `all_service_data` where:
   - `assumed_next_service_date` in range
   - `contact_phones` is not null
3. Insert one `pending` assignment per eligible customer.
4. Update campaign counters (`total_leads`, `pending_count`).

### 7.2 `get_next`

Input:
1. `campaign_id`

Logic:
1. Call RPC `telecall_get_next_assignment`.
2. If no row is available, return `assignment: null`.
3. Else fetch full customer details from `all_service_data` and return assignment payload.

### 7.3 `update_status`

Input:
1. `assignment_id`
2. `campaign_id`
3. `status`
4. optional `call_notes`, `booking_date`, `callback_date`

Logic:
1. Set `called_at` and `updated_at`.
2. Increment `call_count`.
3. If status is `no_answer`, increment `no_answer_count`.
4. If `no_answer_count >= 3`, status is auto-changed to `not_reachable`.
5. Recompute campaign counters from all assignments in campaign:
   - `pending_count`: statuses in `pending`, `assigned`, `calling`
   - `completed_count`: statuses in `completed`, `no_answer`, `not_reachable`, `wrong_number`, `not_interested`
   - `booked_count`: status `booked`

### 7.4 `my_queue`

Input:
1. optional `campaign_id`

Logic:
1. Filter assignments where `assigned_to` = current user email.
2. Include statuses: `assigned`, `calling`, `callback_later`, `booked`.
3. Return joined customer summary fields.

My Queue remains the actionable working queue. Customers in other statuses (for example `pending` with a retry after no answer, `no_answer`, `not_reachable`, or completed outcomes) are not listed here by design.

### 7.4a `find_customers` (read-only)

Input:
1. `query` (required) — mobile, vehicle registration, customer name, or chassis
2. optional `campaign_id` — when provided, limits results to that campaign

Logic:
1. Authenticated user only (same JWT gate as other telecalling actions).
2. Resolve matching `all_service_data` rows using bounded server-side lookups (phone last-10 match, normalized registration, partial name/chassis where safe).
3. Return matching `telecall_assignments` joined to customer and campaign name, any status, up to 25 rows ordered by most recent `called_at`.
4. Does not mutate assignments (no reassignment, status change, counter increment, or queue changes).

Empty result message: `No Telecalling customer found for this search.`

### 7.4b `get_assignment` (read-only)

Input:
1. `assignment_id`

Logic:
1. Return full assignment + customer payload for the existing call card (same shape as `get_next` customer view).
2. Read-only — used when opening a customer from Find Customer without side effects.
3. Returns `can_update`: whether the current user may mutate this assignment via `update_status` / `log_whatsapp` (same rule as `edit_assignment`: admin, unassigned `assigned_to`, or assignee email).

### 7.4c Mutation ownership (`update_status`, `log_whatsapp`)

Before persisting outcomes or WhatsApp log flags:
1. Load assignment `assigned_to`.
2. Allow if user is admin, or `assigned_to` is null (unassigned pool — e.g. after no-answer retry queue), or `assigned_to` equals current user email.
3. Otherwise reject with `Not authorised to update this assignment`.

Find Customer open does not change `assigned_to`. Another executive may view a peer-owned assignment for identification but cannot record outcomes unless admin.

### 7.5 `my_summary`

Logic:
1. Filter assignments for current user where `called_at` is today (UTC day boundary logic in current implementation).
2. Return status bucket counts for dashboard cards.

### 7.6 `campaign_stats` (admin only)

Logic:
1. Return campaign list.
2. Build telecaller status distribution by `assigned_to`.
3. Return booked assignments list for recent bookings panel.

### 7.7 `close_campaign` (admin only)

Input:
1. `campaign_id`

Logic:
1. Set campaign `status = closed`.

---

## 8) Web UI Flow

### 8.1 Initialization

1. Resolve current session.
2. Load role from `users` table.
3. Load campaigns ordered by newest first.
4. Select active campaign if present, else latest campaign.

### 8.2 Telecaller dashboard

Views:
1. Call view
2. My Queue view
3. Find Customer view
4. Today Summary view

Primary journey:
1. Telecaller clicks Get Next Customer.
2. System returns one assignment.
3. Telecaller calls customer and sets outcome.
4. Queue and summary refresh after status update.

Find Customer journey (callback / re-open):
1. Telecaller opens Find Customer (alongside Call, My Queue, Today's Summary).
2. Searches by mobile or registration (also name or chassis when useful).
3. Picks a result and clicks Open Customer — loads the existing call card via `get_assignment` without changing assignment state.
4. Telecaller continues the conversation and records an outcome only through normal call actions.

### 8.3 Admin dashboard

Capabilities:
1. Create campaign with date range.
2. Close active campaign.
3. Monitor campaign counters.
4. View telecaller performance table.
5. View recent booked customers.

### 8.4 Booking / lead form fields (CRE and Driver)

When a telecaller records a booked visit or edits lead details on the web Telecalling page, the booking/lead form exposes **CRE Name** and **Driver** dropdowns.

Dropdown sourcing (web):
1. **CRE Name** — loaded from `public.employee_master` where `role = 'CRE'`, ordered by `employee_name`. Stored/submitted value is `employee_name`.
2. **Driver** — loaded from `public.employee_master` where `role = 'DRIVER'`, ordered by `employee_name`. Stored/submitted value is `employee_name`.

Notes:
1. This replaces an earlier pattern that queried `public.users` by system role labels (`admin`/`manager`/`staff` for CRE; `driver` for Driver), which could show non-CRE staff or miss CRE roster entries.
2. The same `employee_master` sourcing applies on `src/pages/ServiceBookingPage.tsx` for parity between telecalling bookings and the standalone service-booking module.
3. Update this subsection whenever either dropdown query, role filter, or stored field changes.

---

## 9) Mobile Flow Parity

Mobile screen mirrors core flow:
1. Same edge endpoint and action contract.
2. Same campaign loading and active campaign selection.
3. Same call/queue/summary tabs.
4. Native call launch via `tel:` URL using device dialer.

Notable differences:
1. Mobile uses modals for booking and callback dates.
2. Mobile has no admin campaign-creation surface in this screen.

---

## 10) Business Rules Summary

1. Campaign lead eligibility requires due-date in range and phone availability.
2. One customer appears once per campaign due to unique `(campaign_id, customer_id)`.
3. Assignment is pull-based and atomic, preventing duplicate pickup under concurrency.
4. Three consecutive `no_answer` updates auto-transition assignment to `not_reachable`.
5. Booked visits must include `booking_date`; callback flow must include `callback_date`.
6. Campaign counters are derived from assignment statuses after each update.

---

## 11) Observed Current Constraints and Risks

1. `my_summary` uses UTC-day boundary in current edge code; IST-based business reporting may drift near day cutoffs.
2. `campaign_stats` telecaller breakdown currently aggregates across assignments without explicit campaign filter in code path.
3. Status vocabulary is flexible text; without stricter enum/validation, unexpected status values can skew counters.

These are implementation facts, not blockers for current production behavior.

---

## 12) Sync Contract (Mandatory for Future Changes)

This file must be updated in the same change whenever any of the following changes:

1. New or removed edge action in `supabase/functions/telecalling/index.ts`.
2. Status lifecycle changes (new statuses, counter rules, auto-transition logic).
3. Schema changes to `telecall_campaigns`, `telecall_assignments`, or lead-source fields from `all_service_data`.
4. Access-control changes for `/telecalling` route or module permissions.
5. Mobile/web parity behavior differences introduced intentionally.
6. Booking/lead form dropdown sourcing changes for CRE or Driver fields (section 8.4).

### 12.1 Required update checklist

1. Update sections 6, 7, 8.4, and 10 in this file.
2. Add a dated entry to section 13 change log.
3. Update operations indexes/trackers:
   - `docs/Implementation_plans/webversion/INDEX.md`
   - `docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md`
4. Validate references with search:

```bash
rg -n "telecall_|telecalling|OPS-TELECALL-001" src mobile/src supabase/functions docs/Implementation_plans
```

### 12.2 Drift audit command (recommended)

```bash
rg -n "action === '" supabase/functions/telecalling/index.ts
```

Compare action list from command output with section 7 before closing change.

---

## 13) Change Log

1. 2026-06-23: Initial full-flow baseline created from web/mobile source code, edge function, and authoritative schema dump mirror.
2. 2026-06-23: Classified under web operations category as per docs tree governance.
3. 2026-07-01: Documented CRE and Driver booking/lead form dropdown sourcing from `employee_master` by role (section 8.4); aligns with Service Booking page and upstream PR #16.
4. 2026-07-22: Removed the dead, unwired `insurance_expiry` `priority_mode` branch from `create_campaign`/`preview_campaign` in the edge function, and the corresponding dropdown option in the admin dashboard — insurance renewal now has its own dedicated module (`OPS-INSURANCE-RENEWAL-001`, route `/insurance-renewal-telecalling`) rather than being a priority mode on this one. No other action, schema, or access-control change to this module.
5. 2026-10-22: Added Find Customer telecaller view plus read-only edge actions `find_customers` and `get_assignment` so executives can locate assignments outside My Queue (for example after no answer) without lookup mutating assignment state.
6. 2026-10-22: Aligned `update_status` and `log_whatsapp` ownership with `edit_assignment`; `get_assignment` returns `can_update` for read-only CallCard when another executive owns the assignment.
