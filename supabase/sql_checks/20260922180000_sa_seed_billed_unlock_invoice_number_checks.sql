-- Read-only verification checks for:
-- supabase/migrations/20260922180000_sa_seed_billed_unlock_invoice_number.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Seed helper still internal SECURITY DEFINER; no authenticated EXECUTE
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_seed_mechanical_billed_amount';

-- 2) Lock predicate: payment lines only. Invoice number is not an OR lock.
SELECT
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_payment_lines%'
    AS seed_reads_payment_lines,
  pg_get_functiondef(p.oid) LIKE '%IF v_has_lines THEN%'
    AS seed_locks_on_payment_lines,
  pg_get_functiondef(p.oid) NOT LIKE '%v_has_lines OR NULLIF(btrim(v_existing.invoice_number)%'
    AS seed_does_not_or_lock_invoice_number,
  pg_get_functiondef(p.oid) LIKE '%is_floor_incharge_service_type%'
    AS seed_keeps_floor_type_gate,
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_recalc%'
    AS seed_still_recalcs
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_seed_mechanical_billed_amount';

-- 3) SA save still calls the same seed helper; qualification unchanged
SELECT
  pg_get_functiondef(p.oid) LIKE '%service_advisor_seed_mechanical_billed_amount%'
    AS save_still_calls_seed,
  pg_get_functiondef(p.oid) LIKE '%technician_assignments%'
    AS save_keeps_floor_completed_gate,
  pg_get_functiondef(p.oid) LIKE '%invoice_done_at IS NULL%'
    AS save_keeps_invoice_done_once
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_save_reception_entry'
  AND pg_get_function_identity_arguments(p.oid)
    = 'p_reception_entry_id bigint, p_service_type text, p_jc_number text, p_km_reading integer, p_remark text, p_expected_invoice_amount numeric, p_set_expected_invoice_amount boolean';

-- 4) Accounts billed lock on upsert remains payment-lines only (unchanged)
SELECT
  pg_get_functiondef(p.oid) LIKE '%IF v_has_lines THEN%'
    AND pg_get_functiondef(p.oid) LIKE '%v_billed := v_existing.billed_amount%'
    AS upsert_still_locks_billed_on_lines
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'upsert_accounts_mechanical_invoice';

-- 5) List still reads inv.billed_amount, not expected as the billed column
SELECT
  pg_get_functiondef(p.oid) LIKE '%inv.billed_amount%'
    AS list_billed_from_invoice,
  pg_get_functiondef(p.oid) LIKE '%e.expected_invoice_amount%'
    AS list_still_exposes_expected
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_cases';
