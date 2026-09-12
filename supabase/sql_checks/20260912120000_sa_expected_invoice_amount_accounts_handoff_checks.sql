-- Read-only verification checks for:
-- supabase/migrations/20260912120000_sa_expected_invoice_amount_accounts_handoff.sql

-- 1) Reception column + non-negative check
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'service_reception_entries'
      AND column_name = 'expected_invoice_amount'
  ) AS expected_invoice_amount_column,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_reception_entries_expected_invoice_amount_check'
  ) AS expected_invoice_amount_check;

-- 2) SA save / Mark Done signatures: extra amount arg, SECURITY DEFINER, auth EXECUTE
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'service_advisor_save_reception_entry',
    'service_advisor_mark_invoice_done',
    'service_advisor_seed_mechanical_billed_amount'
  )
ORDER BY p.proname, args;

-- 3) Seed helper is not executable by authenticated (internal only)
SELECT
  p.proname,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_seed_mechanical_billed_amount';

-- 4) Save + Mark Done persist expected amount and seed billed_amount
SELECT
  pg_get_functiondef(p.oid) LIKE '%expected_invoice_amount%'
  AND pg_get_functiondef(p.oid) LIKE '%p_set_expected_invoice_amount%'
  AND pg_get_functiondef(p.oid) LIKE '%service_advisor_seed_mechanical_billed_amount%'
    AS save_writes_expected_and_seeds
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_save_reception_entry';

SELECT
  pg_get_functiondef(p.oid) LIKE '%expected_invoice_amount%'
  AND pg_get_functiondef(p.oid) LIKE '%service_advisor_seed_mechanical_billed_amount%'
  AND pg_get_functiondef(p.oid) LIKE '%invoice_done_at%'
    AS mark_done_writes_expected_and_seeds
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_mark_invoice_done';

-- 5) Seed does not overwrite Accounts-captured billed_amount
SELECT
  pg_get_functiondef(p.oid) LIKE '%invoice_number%'
  AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_payment_lines%'
  AND pg_get_functiondef(p.oid) LIKE '%is_floor_incharge_service_type%'
    AS seed_locks_after_accounts_capture
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'service_advisor_seed_mechanical_billed_amount';

-- 6) Accounts list/json expose SA expected amount for modal fallback
SELECT
  pg_get_functiondef(p.oid) LIKE '%expected_invoice_amount%'
    AS list_returns_expected_invoice_amount
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_cases';

SELECT
  pg_get_functiondef(p.oid) LIKE '%expected_invoice_amount%'
    AS case_json_returns_expected_invoice_amount
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_mechanical_case_json';

-- 7) Old 5-arg save / 1-arg mark-done overloads are gone
SELECT
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'service_advisor_save_reception_entry'
      AND pg_get_function_identity_arguments(p.oid) = 'bigint, text, text, integer, text'
  ) AS old_save_overload_dropped,
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'service_advisor_mark_invoice_done'
      AND pg_get_function_identity_arguments(p.oid) = 'bigint'
  ) AS old_mark_done_overload_dropped;
