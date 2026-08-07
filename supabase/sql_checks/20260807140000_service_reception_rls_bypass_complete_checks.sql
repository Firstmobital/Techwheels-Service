-- Post-apply checks for 20260807140000_service_reception_rls_bypass_complete.sql

SELECT p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_reception_entry_by_id',
    'get_reception_entry_latest_by_reg',
    'list_reception_entries_by_jc_numbers',
    'service_advisor_mark_invoice_done',
    'bulk_create_reception_entries'
  )
ORDER BY p.proname;

-- Full P1-13 RPC family (all migrations)
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'service_advisor_save_reception_entry',
    'list_reception_entries_page',
    'create_reception_entry',
    'update_reception_entry',
    'get_reception_entry_by_id',
    'get_reception_entry_latest_by_reg',
    'list_reception_entries_by_jc_numbers',
    'service_advisor_mark_invoice_done',
    'bulk_create_reception_entries'
  )
ORDER BY p.proname;
