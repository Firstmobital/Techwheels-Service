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
