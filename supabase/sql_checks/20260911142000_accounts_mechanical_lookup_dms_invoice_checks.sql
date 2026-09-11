-- Read-only verification checks for:
-- supabase/migrations/20260911142000_accounts_mechanical_lookup_dms_invoice.sql

-- 1) RPC exists, SECURITY DEFINER, executable by authenticated
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  p.provolatile = 's' AS stable,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'lookup_accounts_mechanical_dms_invoice';

-- 2) Lookup is unique-only, skips Cancelled, does not write remaining
SELECT
  pg_get_functiondef(p.oid) LIKE '%invoice_status%' AS skips_status,
  pg_get_functiondef(p.oid) LIKE '%Cancelled%' AS skips_cancelled,
  pg_get_functiondef(p.oid) LIKE '%match_count%' AS returns_match_count,
  pg_get_functiondef(p.oid) LIKE '%unique%' AS returns_unique,
  pg_get_functiondef(p.oid) NOT LIKE '%accounts_mechanical_invoices%' AS does_not_write_invoice_table,
  pg_get_functiondef(p.oid) NOT LIKE '%payment_lines%' AS does_not_write_receipts
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'lookup_accounts_mechanical_dms_invoice';
