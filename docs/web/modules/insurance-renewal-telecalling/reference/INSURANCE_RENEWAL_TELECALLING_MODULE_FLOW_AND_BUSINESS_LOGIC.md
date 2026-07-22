# OPS-INSURANCE-RENEWAL-001: Insurance Renewal Telecalling Module Flow and Business Logic

Last Updated: 2026-07-22
Owner: Operations Team + Platform Team
Scope: Web route `/insurance-renewal-telecalling`, dedicated Supabase edge function
Status: Active operations authority for module behavior

---

## 1) Purpose

Proactive calling queue for customers whose vehicle insurance is nearing expiry, to
pitch renewal ahead of `all_service_data.last_insurance_expiry_date`.

This module is structurally modeled on the existing service Telecalling module
(`docs/web/modules/telecalling/reference/TELECALLING_MODULE_FLOW_AND_BUSINESS_LOGIC.md`)
— same pull-based allotment shape, same campaign/assignment/counter pattern —
but uses its own tables, edge function, and disposition set because the
eligibility window, re-attempt cadence, and call outcomes differ from service
reminders.

---

## 2) Source of Truth Map

Application sources:
1. `src/pages/InsuranceRenewalTelecallingPage.tsx`
2. `supabase/functions/insurance-renewal-telecalling/index.ts`
3. `src/App.tsx` (web route and module access gate)

Database sources:
1. `supabase/migrations/20260722081242_insurance_renewal_telecalling_module.sql`
2. Tables: `insurance_renewal_campaigns`, `insurance_renewal_assignments`
3. RPC: `insurance_renewal_get_next_assignment`

---

## 3) Module Goal

1. Creates rolling-window campaigns from customers whose insurance expires within N days (default 30).
2. Assigns leads to insurance renewal telecallers one-by-one via a concurrency-safe atomic picker.
3. Captures renewal-specific call outcomes and follow-up dates.
4. Tracks campaign performance and daily telecaller summary.

---

## 4) Why This Is a Separate Module, Not a Priority Mode on Telecalling

The existing Telecalling module briefly carried an unwired `insurance_expiry`
`priority_mode` branch in `create_campaign`/`preview_campaign`. It was removed
in the same change that introduced this module (2026-07-22) because:

1. **Eligibility window differs**: rolling "N days before expiry" anchored to
   `last_insurance_expiry_date`, not a service-due date range.
2. **Disposition set differs**: `renewed_via_us`, `renewed_elsewhere`,
   `already_renewed_unknown`, etc. — service outcomes like `already_serviced`/
   `sold_vehicle`/`booked` don't apply.
3. **No downstream booking bridge**: unlike service `booked` (which
   auto-creates a `service_bookings` row), `renewed_via_us` only records
   status + optional `quoted_premium`/`renewal_company` — no auto-created
   downstream record (by design, revisit if/when a dedicated policy-tracking
   table exists).
4. **Access is a distinct module permission** (`insurance_renewal_telecalling`),
   so insurance renewal telecallers and service telecallers can be granted
   independently.

---

## 5) Access and Roles

### 5.1 Web route access

Route `/insurance-renewal-telecalling` is gated by module name
`insurance_renewal_telecalling` in `src/App.tsx`, registered in the `modules`
table with `route = '/insurance-renewal-telecalling'`. Access is granted per
user via `user_module_permissions`, same mechanism as every other module —
there is no separate "role" concept; "Insurance Renewal Telecaller" is simply
a user granted this module.

### 5.2 In-page role behavior

1. User role is read from `users.role`.
2. `admin` sees Admin Dashboard and Telecaller View toggle.
3. Non-admin users see the Telecaller dashboard only.

### 5.3 Edge authorization

Same pattern as `telecalling`: bearer token validated via Supabase auth,
resolved to `users.email`/`users.role`. Admin-only actions enforced
server-side (`create_campaign`, `refresh_campaign`, `admin_stats`,
`close_campaign`, `update_campaign`, `delete_campaign`, `preview_campaign`, `rc_fetch_status`, `rc_fetch_enqueue`).
A shared `x-cron-secret` header bypass exists for the scheduled `refresh_campaign` call.

---

## 6) Data Model

### 6.1 Lead source table and due-date fallback

`all_service_data`, filtered on `contact_phones` (not null/empty) and an
**effective due date** — not the raw `last_insurance_expiry_date` column.
Fields surfaced to the telecaller: `chassis_no`, `vehicle_registration_number`,
`first_name`, `last_name`, `contact_phones`, `model`, `product_line`,
`powertrain_type`, `vehicle_sale_date`, `vehicle_age_in_years`,
`ex_showroom_price`, `idv`, `last_insurance_expiry_date`,
`last_insurance_comapny`, `last_insurance_policy_number`, `sold_dealer`.

**`last_insurance_expiry_date` is only populated for ~1.3% of `all_service_data`
rows** (715 of 55,276 as of 2026-07-22). For every other row, the module falls
back to a due date computed from `vehicle_sale_date`:

1. Insurance renews annually off the sale-date anniversary, not a fixed
   calendar date — a vehicle sold 24-Jan-2025 has its first renewal due
   23-Jan-2026 (day before the 1-year anniversary), then every year after
   that on the same day/month (23-Jan-2027, 23-Jan-2028, ...).
2. `insurance_next_due_date(sale_date, as_of)` (SQL function) rolls the
   candidate date forward year over year until it lands on or after `as_of`
   (default `CURRENT_DATE`) — correctly handling vehicles many renewals into
   their life, not just first-year cases.
3. `last_insurance_expiry_date` remains authoritative whenever present (it
   reflects the actual last-known policy) and is used verbatim — it is not
   itself rolled forward across missed years.

This is implemented as a database view, `insurance_renewal_leads`:

```sql
SELECT id, chassis_no, contact_phones, vehicle_sale_date, last_insurance_expiry_date,
  COALESCE(last_insurance_expiry_date, insurance_next_due_date(vehicle_sale_date)) AS effective_due_date,
  (last_insurance_expiry_date IS NULL) AS due_date_is_estimated
FROM all_service_data
```

All eligibility queries (`create_campaign`, `refresh_campaign`,
`preview_campaign`) and the allotment RPC's ordering read from
`insurance_renewal_leads.effective_due_date`, not from `all_service_data`
directly. The web page independently mirrors the same day/month-rollforward
logic client-side (`computeInsuranceDueDate` in
`InsuranceRenewalTelecallingPage.tsx`) purely for display — e.g. showing
"Insurance Due (estimated)" and a "📅 Estimated from sale date" badge on the
call card when `last_insurance_expiry_date` is null. Eligibility/ordering
correctness always comes from the server-side view, not the client mirror.

### 6.2 Campaign table — `insurance_renewal_campaigns`

`id`, `campaign_name`, `window_days` (default 30), `date_from`, `date_to`,
`status` (`active`/`closed`), counters (`total_leads`, `pending_count`,
`in_progress_count`, `callback_later_count`, `out_of_window_count`,
`completed_count`, `renewed_count`), `created_by`, `created_at`, `updated_at`.

### 6.3 Assignment table — `insurance_renewal_assignments`

`id`, `campaign_id`, `customer_id` (→ `all_service_data.id`), `assigned_to`
(user email), `status` (default `pending`), `call_notes`, `callback_date`,
`called_at`, `call_count`, `no_answer_count`, `retry_after`, `whatsapp_sent`,
`whatsapp_status`, `quoted_premium`, `renewal_company`, `assigned_at`,
`updated_at`. Unique on `(campaign_id, customer_id)`.

### 6.4 Disposition vocabulary

`pending`, `assigned`, `renewed_via_us`, `renewed_elsewhere`, `not_interested`,
`callback_later`, `no_answer`, `not_reachable`, `wrong_number`,
`already_renewed_unknown`, `out_of_window`.

### 6.5 Concurrency-safe allotment RPC

Function: `insurance_renewal_get_next_assignment(p_campaign_id, p_user_email)`

Unlike the existing `telecalling` edge function (which does a plain
select-then-update despite an idle `SKIP LOCKED` RPC sitting unused), this
module's `get_next` action calls this RPC directly:

1. Prefer `pending` rows with `retry_after <= today` (no-answer retries),
   ordered by `retry_after` then soonest `insurance_renewal_leads.effective_due_date`
   (see §6.1 — this is `last_insurance_expiry_date` when present, else the
   sale-date-derived projection).
2. Else pick fresh `pending` rows (`retry_after IS NULL`), ordered by
   soonest `effective_due_date` — urgency here is purely time-to-due-date
   driven, not a weighted priority score like service segments.
3. Row-lock with `FOR UPDATE SKIP LOCKED` so two telecallers calling
   `get_next` at the same instant can never receive the same customer.
4. Update the row to `assigned` and return `(asgn_id, cust_id)`.

---

## 7) API Actions in Edge Function

Endpoint: Supabase edge function `insurance-renewal-telecalling`

1. `create_campaign` (admin) — window_days (default 30) → date_from/date_to computed server-side (IST); dedup by chassis_no.
2. `refresh_campaign` (admin/cron) — rolls window forward daily; adds newly-eligible leads; marks drifted pending rows `out_of_window`; never touches worked rows.
3. `get_next` — own callback_later rows due today first, then RPC-based atomic pick.
4. `update_status` — sets disposition; `renewed_via_us` accepts optional `quoted_premium`/`renewal_company`; `no_answer` follows 3-strike retry-then-`not_reachable` cadence (same as service module).
5. `log_whatsapp`, `edit_assignment`, `my_queue`, `my_summary`, `admin_stats`, `renewed_list`, `close_campaign`, `update_campaign`, `delete_campaign`, `preview_campaign`, `rc_fetch_status`, `rc_fetch_preview`, `rc_fetch_enqueue`, `process_rc_fetch_jobs` (cron).

---

## 8) Business Rules Summary

1. Campaign lead eligibility requires `last_insurance_expiry_date` within the
   window and phone availability.
2. One customer appears once per campaign (`UNIQUE(campaign_id, customer_id)`).
3. Assignment is pull-based and atomic via `FOR UPDATE SKIP LOCKED`, preventing
   duplicate pickup under concurrency.
4. Three consecutive `no_answer` updates auto-transition to `not_reachable`.
5. `renewed_via_us` does not auto-create any downstream record — status + notes
   (+ optional premium/company) only, per current scope.
6. Campaign counters are derived from assignment statuses after each update.

---

## 9) Sync Contract (Mandatory for Future Changes)

Same governance as the service Telecalling module. Update this file whenever:
1. A new/removed edge action changes.
2. Disposition vocabulary or counter rules change.
3. Schema changes to `insurance_renewal_campaigns`/`insurance_renewal_assignments`.
4. Access-control changes for the route/module.
5. A downstream conversion-record bridge is added (see §4 point 3).

```bash
rg -n "insurance_renewal_|InsuranceRenewalTelecalling|OPS-INSURANCE-RENEWAL-001" src supabase/functions supabase/migrations docs/Implementation_plans
```

---

## 10) Change Log

1. 2026-07-22: Initial module created — dedicated tables/RPC/edge
   function/page, module permission `insurance_renewal_telecalling` wired
   into `src/App.tsx`. Removed the dead unwired `insurance_expiry`
   `priority_mode` branch from the existing `telecalling` edge function and
   the corresponding UI option in `TelecallingPage.tsx` admin dashboard.
2. 2026-07-22: Added sale-date fallback due-date logic (§6.1) — `insurance_next_due_date()`
   SQL function and `insurance_renewal_leads` view, since `last_insurance_expiry_date`
   is populated for only ~1.3% of `all_service_data`. All eligibility queries and the
   allotment RPC's ordering switched from `all_service_data.last_insurance_expiry_date`
   to `insurance_renewal_leads.effective_due_date`. Frontend mirrors the same logic
   client-side for display only (`computeInsuranceDueDate`).
3. 2026-07-22: Admin **Fetch RC (IDSPay)** per campaign — background job queue
   (`insurance_renewal_rc_fetch_jobs` + `insurance_renewal_rc_fetch_attempts`),
   pg_cron worker every 2 min, edge actions `rc_fetch_status`, `rc_fetch_enqueue`,
   `process_rc_fetch_jobs`. Only campaign assignment leads with
   `last_insurance_expiry_date` null or older than 365 days **and no prior attempt
   row** are called; refresh/new assignments become eligible again automatically.
