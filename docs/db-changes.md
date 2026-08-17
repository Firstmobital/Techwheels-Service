# DB Changes Ledger

## 2026-08-17

### P1-13 — reception list role fast paths (CRM/floor/admin 57014)

| Order | Migration | Change |
|------|-----------|--------|
| 1 | `20260817170000_fix_reception_list_role_fast_paths.sql` | CRM/SM/GM with reception module use dealer-only path (matches RLS). Dedicated early paths for admin, reception-dealer, floor incharge (precomputed SA JOIN). Residual broad path: dealer pre-filter + `summary_scope` only for bodyshop / SA-only CRM. |

- Checks: `supabase/sql_checks/20260817170000_fix_reception_list_role_fast_paths_checks.sql`
- Root cause: `reception_dealer_only` excluded CRM roles (copied from SA-summary logic), forcing per-row `user_is_crm_for_dealer_sa` / `user_has_service_floor_incharge_scope_for_sa_code` on prod logs 2026-08-17 06:30–06:56 UTC
- Status: **Pending apply**

### SUPABASE-002 Phase 8.6 — 10-day `contact_details` retention

| Order | Migration | Change |
|------|-----------|--------|
| 1 | `20260817161000_contact_details_10day_retention_purge.sql` | Keep only last 10 days of `contact_details` (`created_at`). Batched purge RPC + daily pg_cron `02:15 IST`. Fills remaining Customer phones before delete. |

- Checks: `supabase/sql_checks/20260817161000_contact_details_10day_retention_purge_checks.sql`
- Plan: SUPABASE-002 Phase 8.6
- Status: **Pending apply**
- Authority: `supabase/backups/full_metadata.sql` (`public.contact_details.created_at`)

### SUPABASE-002 Phase 8 — fill-null `contact_phones` from `contact_details`

| Order | Migration | Change |
|------|-----------|--------|
| 1 | `20260817160000_all_service_data_fill_contact_phones_from_contact_details.sql` | Fill `all_service_data.contact_phones` from Customer `contact_details.cell_phone_no` on matching chassis when target is NULL/blank. No overwrite. Triggers + chunked reconcile. |

- Checks: `supabase/sql_checks/20260817160000_all_service_data_fill_contact_phones_from_contact_details_checks.sql`
- Plan: `docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-002_ALL_SERVICE_DATA_DYNAMIC_TABLE_REALTIME_SYNC_PLAN_2026-06-20.md` Phase 8
- Status: **Applied + verified** (2026-08-17). `remaining_fillable_rows=0`, reconcile=`0`, both triggers present. New Customer inserts fill blank phones automatically.
- Authority: `supabase/backups/full_metadata.sql` (`public.contact_details`, `public.all_service_data.contact_phones`)

### P1-13 — shared-role gate for reception list (Veika + floor)

| Order | Migration | Change |
|------|-----------|--------|
| 1 | `20260817150000_fix_list_reception_shared_role_gate.sql` | Own-code JOIN only when user has `service_advisor` + an employee link and is not floor/bodyshop. Reception-only (no SA module, no `user_employee_links`) uses dealer codes from JWT. Keeps optimize dealer pre-filter + 10k cap. |

- Checks: `supabase/sql_checks/20260817150000_fix_list_reception_shared_role_gate_checks.sql`
- Status: **Applied** (2026-08-17, Management API)
- Regression: `20260817140000_optimize_reception_list_broad_path` restored the 10:24 own-SA gate. `avanimeena4560@gmail.com` is reception-only with **zero** employee links, so the JOIN returned 0 intake rows.

### P1-13 — restore bodyshop-floor list after SA own-code over-apply

| Order | Migration | Change |
|------|-----------|--------|
| 1 | `20260817140000_fix_list_reception_floor_scope.sql` | Advisor own-code JOIN in `list_reception_entries_page` + `list_reception_reg_created_since` only when user is assigned SA and not `bodyshop_floor` / `floor_incharge`. Floor callers use `service_reception_entry_in_summary_scope` again. |

- Checks: `supabase/sql_checks/20260817140000_fix_list_reception_floor_scope_checks.sql`
- Status: **Applied** (2026-08-17, Management API)
- Regression: `20260817120000` treated every non-CRM/SM/GM user as assigned SA. Bodyshop Floor (`listAccidentReceptionEntriesByDateRange`) returned 0 accident cars.

### P1-13 — SA list scope priority fix (57014 on Service Advisor page)

| Order | Migration | Change |
|------|-----------|--------|
| 1 | `20260817120000_fix_list_reception_sa_scope_priority.sql` | Advisor fast path in `list_reception_entries_page` + `list_reception_reg_created_since`: `NOT user_needs_sa_summary_broad_scope()` → `user_employee_links` JOIN on `sa_employee_code` (same gate as `get_service_advisor_summary_counts`) |

- Checks: `supabase/sql_checks/20260817120000_fix_list_reception_sa_scope_priority_checks.sql`
- Frontend: empty-date guard in `normalizeCreatedAtRange` + RPC boundary sanitize in `fetchReceptionEntriesPage` (fixes `T00:00:00+05:30` / 22007)
- Status: **Applied + Vercel deployed** (2026-08-17)

### P1-13 — broad-path reception list optimization (CRM/GM 57014)

| Order | Migration | Change |
|------|-----------|--------|
| 1 | `20260817140000_optimize_reception_list_broad_path.sql` | Broad path: `dealer_code = ANY(my_dealers)` before `summary_scope`; `list_reception_reg_created_since` capped at 10k rows |

- Checks: `supabase/sql_checks/20260817140000_optimize_reception_list_broad_path_checks.sql`
- Preserves: SA advisor JOIN fast path from `20260817120000` (unchanged gate)
- Status: **Pending apply**

### Complaints — fix 42703 / 42883 from prod logs

| Order | Migration | Change |
|------|-----------|--------|
| 1 | `20260817130000_fix_generate_complaint_link_pgcrypto.sql` | `generate_complaint_link`: qualify `extensions.gen_random_bytes()` (42883) |

- Frontend: remove invalid `user_employee_links.deleted_at` filter in `ComplaintsPage.tsx` (42703)
- Checks: `supabase/sql_checks/20260817130000_fix_generate_complaint_link_pgcrypto_checks.sql`
- Status: **Pending apply + Vercel deploy**

## 2026-08-13

### P1-13 — optimize `list_reception_entries_page` + remaining caller RPCs

| Order | Migration | RPCs / changes |
|------|-----------|----------------|
| 1 | `20260813120000_optimize_list_reception_entries_page.sql` | Rewrite `list_reception_entries_page` with dealer/SA fast paths (scope_mode); cap page_size at 100; add `list_reception_jc_numbers_by_sa`, `list_reception_reg_created_since`, `get_reception_entries_by_ids` |

- Checks: `supabase/sql_checks/20260813120000_optimize_list_reception_entries_page_checks.sql`
- Frontend: migrate remaining direct `service_reception_entries` callers (Dashboard, Technician, Bodyshop, ServiceBooking, mobile prefill/floor)
- Status: **Pending apply + deploy**

## 2026-08-07

### P1-13 — service_reception_entries RLS bypass (complete family)

Apply **all three migrations in order** (one coordinated fix, shipped in slices because 07120000 was already applied first):

| Order | Migration | RPCs / changes |
|------|-----------|----------------|
| 1 | `20260807120000_fix_sa_save_reception_entry_timeout.sql` | `service_advisor_save_reception_entry`, sync trigger SECURITY DEFINER |
| 2 | `20260807130000_fix_reception_page_timeout.sql` | `list_reception_entries_page`, `create_reception_entry`, `update_reception_entry` |
| 3 | `20260807140000_service_reception_rls_bypass_complete.sql` | `get_reception_entry_by_id`, `get_reception_entry_latest_by_reg`, `list_reception_entries_by_jc_numbers`, `service_advisor_mark_invoice_done`, `bulk_create_reception_entries`, `search_reception_reg_numbers`; create/update +portal |
| 4 | `20260807141000_drop_reception_entry_rpc_duplicate_overloads.sql` | Drop pre-portal `create_reception_entry` / `update_reception_entry` overloads (07140000 leaves duplicates without this) |

- Checks: `supabase/sql_checks/20260807140000_service_reception_rls_bypass_complete_checks.sql`
- Frontend (web): `src/lib/api/reception.ts`, `src/pages/ReceptionPage.tsx`, `src/components/PartsRequirementSection.tsx`
- Frontend (mobile): `mobile/src/app/(tabs)/reception.tsx`
- Status: **Code complete — deploy all 3 migrations + frontend**
- Notes: Root cause is systemic — every direct PostgREST path on `service_reception_entries` hits expensive RLS. Not a user/account issue. Remaining direct callers (BodyshopRepairPage, DashboardPage, edge function) are lower-traffic or already use dedicated RPCs where hot.

## 2026-07-21

### Prefix 20260721133000 (table name fix)

- Migration: `20260721133000_fix_service_history_refresh_table_names.sql`
- Check: `20260721133000_fix_service_history_refresh_table_names_checks.sql`
- Status: **Executed and verified** (applied via Management API; confirmed in metadata dump `2026-07-21T09:04:19Z`, sha256 `d09f040d…`)

### SUPABASE-003 / P1-12 — service history sync queue performance

- Plan: `docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-003_SERVICE_HISTORY_SYNC_QUEUE_PERFORMANCE_PLAN_2026-07-21.md`
- Status: **Executed and verified** (schema objects in `supabase/backups/full_metadata.sql` dump above)
- Migrations (apply order):
  1. `20260721150000_p1_12_service_history_chassis_indexes.sql` + checks — indexes `idx_ev_service_history_test_chassis_norm`, `idx_pv_service_history_test_chassis_norm`
  2. `20260721151000_p1_12_refresh_service_history_sql_opt.sql` + checks — `h.contact_full_name`, no `to_jsonb(h)`
  3. `20260721152000_p1_12_sync_queue_worker_and_cron.sql` + checks — default batch **50**, **60s** wall budget, pg_cron reschedule (job rows not in schema-only dump)
- Post-apply smoke: `process_all_service_history_sync_queue(5)` returned `processed_count=5` with large `remaining_due_count` (~21k) — queue draining under new limits; monitor over 24–48h for `57014` in logs
- Metadata authority: `supabase/evidence/authoritative_metadata_manifest.json` updated **2026-07-21T09:04:19Z**

## 2026-07-07

### Prefix 20260707070000
- Migration: 20260707070000_all_service_data_last_service_date_to_date.sql
- Check: 20260707070000_all_service_data_last_service_date_to_date_checks.sql
- Status: Executed and verified (applied directly via Supabase MCP)
- Notes:
  - `all_service_data.last_service_date` changed from `timestamp with time zone`
    to `date` (existing values truncated to their IST calendar date). Mirror
    table `all_service_data_dynamic.last_service_date` converted the same way
    to stay aligned with its source, per its existing column comment.
  - Added a new `date`-typed overload of
    `calc_all_service_assumed_next_service_date` so the
    `trg_set_all_service_assumed_columns` trigger call resolves to an exact
    type match; the pre-existing `text` and `timestamptz` overloads are left
    in place (unused by this table now, but not called from app code so kept
    for safety).
  - Updated `refresh_all_service_data_from_job_card_closed_data`,
    `refresh_all_service_data_from_service_history`, and
    `upsert_all_service_data_from_booking_source` to write/compare
    `last_service_date` as a plain date instead of timestamptz.
  - Accepted tradeoff: the closed-job sync freshness gate in
    `refresh_all_service_data_from_job_card_closed_data` now compares dates
    instead of timestamps, so two same-day closures for the same vehicle are
    indistinguishable for that gate (first-seen-wins, no update on a same-day
    replay).
  - Verification passed: both columns report `data_type = date`; three
    `calc_all_service_assumed_next_service_date` overloads present
    (date/text/timestamptz); forced-trigger spot checks matched a fresh
    recompute exactly; `all_service_data_dynamic` has zero rows out of sync
    with `all_service_data`; `refresh_all_service_data_from_job_card_closed_data`
    and `upsert_all_service_data_from_booking_source` run cleanly.
  - Pre-existing, unrelated finding surfaced during verification: 
    `refresh_all_service_data_from_service_history` errors because table
    `public."EV_service_history_test"` does not currently exist (only
    `PV_service_history_test` does). This is not caused by this migration —
    no table references were changed — and is left out of scope.

## 2026-06-25

### Prefix 20260625174500
- Migration: 20260625174500_all_service_data_booking_source_add_last_service_seed_from_rto_date.sql
- Check: 20260625174500_all_service_data_booking_source_add_last_service_seed_from_rto_date_checks.sql
- Status: Executed and verified
- Notes:
  - Booking-source insert mapping now seeds:
    - last_service_type = 'New'
    - last_service_date = rto_date (stored as timestamptz in IST)

### Prefix 20260625181500
- Migration: 20260625181500_all_service_data_booking_source_backfill_last_service_seed.sql
- Check: 20260625181500_all_service_data_booking_source_backfill_last_service_seed_checks.sql
- Status: Executed and verified
- Notes:
  - One-time backfill fixed historical booking-sync rows with updated_by_sale = true.
  - Validation passed:
    - sale_rows = 85
    - missing_last_service_type = 0
    - missing_last_service_date = 0
    - date_not_equal_vehicle_sale_date = 0

### Prefix 20260625200500
- Migration: 20260625200500_schedule_daily_ist_plus1h_booking_source_sync_incremental.sql
- Check: 20260625200500_schedule_daily_ist_plus1h_booking_source_sync_incremental_checks.sql
- Status: Executed and verified
- Notes:
  - Scheduler job created: booking-source-sync-daily-ist-plus1h
  - Schedule: 30 19 * * * (UTC) = 01:00 IST daily
  - Verification passed:
    - wrapper_exists = true
    - matching_job_rows = 1
    - active_matching_job_rows = 1

### Prefix 20260625221000
- Migration: 20260625221000_p1_07_disk_io_hotlist_indexes.sql
- Check: 20260625221000_p1_07_disk_io_hotlist_indexes_checks.sql
- Status: Executed and verified
- Notes:
  - Added indexes:
    - idx_sre_created_at_id_desc
    - idx_sre_service_type_created_at_id_desc
    - idx_ta_updated_assigned_desc
    - idx_vas_jc_closed_branch
  - Verification EXPLAIN now shows Index Scan for:
    - service_reception_entries ordered list
    - technician_assignments ordered list
    - service_vas_jc_data date-window ordered list

## 2026-07-06

### Prefix 20260706200000
- Migration: 20260706200000_ew_renewal_reminders.sql
- Check: 20260706200000_ew_renewal_reminders_checks.sql
- Status: Executed and verified
- Notes:
  - New table ew_renewal_reminders tracks WhatsApp "Renew Now" reminders sent
    10 days and 3 days before all_service_data.extended_warranty_end_date.
  - New wa_agent_config columns: ew_renewal_enabled, ew_renewal_template_id,
    ew_renewal_template_lang, ew_renewal_variable_map, ew_renewal_send_time.
  - pg_cron job ew-renewal-reminder-daily-ist registered at 30 6 * * * (12:00 IST).
  - Verification passed: table/columns/constraints/indexes present, cron job
    active with expected schedule/command.

### Prefix 20260706201000
- Migration: 20260706201000_ew_service_reminders.sql
- Check: 20260706201000_ew_service_reminders_checks.sql
- Status: Executed and verified
- Notes:
  - New table ew_service_reminders tracks WhatsApp "Book Now / Call Us"
    reminders sent 30 days and 15 days before
    all_service_data.extended_warranty_end_date, nudging customers to get
    serviced while EW coverage is still active.
  - New wa_agent_config columns: ew_service_reminder_enabled,
    ew_service_reminder_template_id, ew_service_reminder_template_lang,
    ew_service_reminder_variable_map, ew_service_reminder_send_time.
  - pg_cron job ew-service-reminder-daily-ist registered at 30 7 * * * (13:00 IST).
  - Verification passed: table/columns/constraints/indexes present, cron job
    active with expected schedule/command.

### Prefix 20260706202000
- Migration: 20260706202000_ew_reminder_wa_template_drafts.sql
- Check: 20260706202000_ew_reminder_wa_template_drafts_checks.sql
- Status: Executed and verified
- Notes:
  - Seeded two draft wa_templates rows: ew_renewal_reminder_v1
    (campaign_type=ew_reminder, single "Renew Now" quick-reply button) and
    ew_service_reminder_v1 (campaign_type=ew_service_reminder, "Book Now" +
    "Call Us" quick-reply buttons). Both remain in draft status until an
    admin reviews the copy and submits them to Meta for approval.
  - Both new jobs stay disabled (*_enabled=false) until a template is
    approved and wired up in the UI.

### Prefix 20260706220000
- Migration: 20260706220000_ew_renewal_responses_and_service_flow_button.sql
- Check: 20260706220000_ew_renewal_responses_and_service_flow_button_checks.sql
- Status: Executed and verified
- Notes:
  - ew_renewal_reminders gains responded_at/customer_response so a "Renew Now"
    tap can be recorded and surfaced as an interested lead on the EW Reminder page.
  - ew_service_reminders gains flow_response_id (mirrors auto_service_reminders)
    since wa-webhook's booking-Flow link-back now writes to whichever of the
    two tables the customer's reminder came from.
  - ew_service_reminder_v1's draft buttons updated to reuse the approved
    service_due_reminder_flow template's exact Flow ("Book Now", flow_id
    1329781145787136) and PHONE_NUMBER button ("Call Us", +917045181062)
    instead of static quick-replies.

## 2026-07-09

### Prefix 20260709180000
- Migration: 20260709180000_updation_reminders.sql
- Check: 20260709180000_updation_reminders_checks.sql
- Status: Executed and verified
- Notes:
  - New tables updation_import_batches (one row per chassis-list import,
    tracks matched-with-phone / matched-no-phone / unmatched counts) and
    updation_reminders (2 rows per matched chassis — reminder_number 1 sent
    immediately on import, reminder_number 2 scheduled gap_days later),
    supporting the import-driven "Updation Reminder" WhatsApp automation
    (Tata Motors recall/software-update campaigns).
  - New wa_agent_config columns: updation_reminder_enabled (gates only the
    day-N follow-up sweep — reminder 1 always sends on import),
    updation_reminder_template_id, updation_reminder_template_lang,
    updation_reminder_variable_map, updation_reminder_send_time,
    updation_reminder_gap_days (default 3).
  - pg_cron job updation-reminder-daily-ist registered at 30 4 * * *
    (10:00 IST), driving the reminder-2 follow-up sweep only.
  - No RLS / GRANT ALL to anon,authenticated,service_role, matching every
    sibling reminder table (auto_service_reminders, ew_service_reminders,
    ew_renewal_reminders) — verified via get_advisors that this introduces
    no new findings beyond that already-accepted posture.
  - Verification passed: tables/columns/constraints/indexes present, cron
    job active with expected schedule/command, config row defaults correct.
