-- Read-only verification checks for:
-- supabase/migrations/20260924120000_bodyshop_invoice_account_from_dms.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Sync helper is internal. authenticated cannot call it.
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'sync_bodyshop_invoice_account_from_dms';

-- 2) Copy uses account only. Does not write the policy company or bill-to names.
SELECT
  pg_get_functiondef(p.oid) LIKE '%psf_revenue_dms%' AS reads_dms,
  pg_get_functiondef(p.oid) LIKE '%NULLIF(btrim(p.account), '''')%' AS uses_account,
  pg_get_functiondef(p.oid) LIKE '%invoice_account = latest.account%' AS writes_invoice_account,
  pg_get_functiondef(p.oid) NOT LIKE '%insurance_company%' AS does_not_touch_policy,
  pg_get_functiondef(p.oid) NOT LIKE '%first_name%' AS does_not_use_first_name,
  pg_get_functiondef(p.oid) NOT LIKE '%last_name%' AS does_not_use_last_name,
  pg_get_functiondef(p.oid) LIKE '%<> ''Cancelled''%' AS skips_cancelled
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'sync_bodyshop_invoice_account_from_dms';

-- 3) Settlement header touch fills an empty bill-to.
SELECT
  pg_get_functiondef(p.oid) LIKE '%sync_bodyshop_invoice_account_from_dms%' AS ensure_calls_sync
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = '_bodyshop_ensure_settlement';

-- 4) DMS import fires one statement trigger, not a per-row trigger.
SELECT
  t.tgname,
  t.tgtype & 1 = 1 AS is_row_trigger,
  pg_get_triggerdef(t.oid) LIKE '%FOR EACH STATEMENT%' AS is_statement_trigger,
  pg_get_triggerdef(t.oid) LIKE '%REFERENCING NEW TABLE AS new_rows%' AS has_transition_table
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'psf_revenue_dms'
  AND t.tgname IN (
    'trg_sync_bodyshop_invoice_account_ins',
    'trg_sync_bodyshop_invoice_account_upd'
  )
  AND NOT t.tgisinternal
ORDER BY t.tgname;
