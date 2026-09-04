-- Read-only verification checks for:
-- supabase/migrations/20260904200000_bodyshop_recovery_export.sql
-- Execution: This file can be run in one go.

SELECT public.bodyshop_insurer_payer_mismatch(
  'United India Insurance Co. Ltd.',
  'TATA AIG GENERAL INSURANCE COMPANY LIMITED C/O ABHISHEK'
) AS united_vs_tata_mismatch;

SELECT public.bodyshop_insurer_payer_mismatch(
  'ICICI Lombard General Insurance Co. Ltd.',
  'M/S ICICI LOMBARD GENERAL INSURANCE C/O ASHWINI'
) AS icici_vs_icici_ok;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('bodyshop_insurer_payer_mismatch', 'export_bodyshop_do_recovery')
ORDER BY p.proname;
