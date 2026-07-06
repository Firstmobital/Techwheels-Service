# DB Changes Ledger

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
