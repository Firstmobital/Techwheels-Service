-- Read-only verification checks for:
-- supabase/migrations/20260911140000_accounts_mechanical_payment_lines.sql
-- Execution: This file can be run in one go after the migration.

-- 1) Payment lines table + constraints
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_payment_lines'
  ) AS payment_lines_table,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_mechanical_payment_lines_mode_check'
  ) AS mode_check,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_mechanical_payment_lines_amount_check'
  ) AS amount_check;

-- 2) New RPCs exist, SECURITY DEFINER, executable by authenticated
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'accounts_mechanical_recalc',
    'accounts_mechanical_case_json',
    'add_accounts_mechanical_payment',
    'list_accounts_mechanical_payments',
    'list_accounts_mechanical_cases',
    'upsert_accounts_mechanical_invoice'
  )
ORDER BY p.proname;

-- 3) List returns remaining + unused SA invoice file columns
SELECT
  pg_get_functiondef(p.oid) LIKE '%remaining_amount%'
  AND pg_get_functiondef(p.oid) LIKE '%invoice_storage_path%'
  AND pg_get_functiondef(p.oid) LIKE '%is_floor_incharge_service_type%' AS list_has_remaining_and_invoice_file
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_cases';

-- 4) Header upsert no longer writes posted amount; add payment posts lines
SELECT
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_recalc%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%amount_received = EXCLUDED.amount_received%' AS upsert_does_not_overwrite_received
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'upsert_accounts_mechanical_invoice';

SELECT
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_payment_lines%'
  AND pg_get_functiondef(p.oid) LIKE '%receipt amount must be greater than 0%' AS add_payment_inserts_line
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_accounts_mechanical_payment';
