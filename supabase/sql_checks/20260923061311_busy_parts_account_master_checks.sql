-- BUSY-001 / DBL-0083
-- supabase/migrations/20260923061311_busy_parts_account_master.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'busy_parts_account_master'
) AS busy_parts_account_master_table_exists;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'busy_parts_account_master'
ORDER BY ordinal_position;

SELECT EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'busy_parts_account_master_code_unique'
) AS code_unique_exists;

SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.busy_parts_account_master'::regclass
ORDER BY conname;

SELECT relrowsecurity AS busy_parts_account_master_rls_enabled
FROM pg_class
WHERE oid = 'public.busy_parts_account_master'::regclass;

SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'public.busy_parts_account_master'::regclass
ORDER BY polname;

SELECT
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.busy_parts_account_master'::regclass
      AND tgname = 'trg_busy_parts_account_master_normalize_v1'
      AND NOT tgisinternal
  ) AS normalize_trigger_exists,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'busy_parts_account_master_normalize_v1'
  ) AS normalize_function_exists;

SELECT count(*) AS seeded_row_count
FROM public.busy_parts_account_master;

SELECT count(*) AS duplicate_codes
FROM (
  SELECT code
  FROM public.busy_parts_account_master
  GROUP BY 1
  HAVING count(*) > 1
) d;

SELECT code, party_name, gstin, busy_group
FROM public.busy_parts_account_master
WHERE code IN ('3004370', '300A150', '3000080', '3080520', '3008660', '300A230', '3083120')
ORDER BY code;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'busy_parts'
  AND column_name IN ('account_name', 'account_code')
ORDER BY column_name;

SELECT
  (p.prosrc LIKE '%account_code%') AS function_reads_account_code,
  (p.prosrc LIKE '%NOT c.already_uploaded%') AS function_still_skips_existing_invoices,
  (p.prosrc ~* 'DELETE\s+FROM\s+public\.busy_parts') AS function_deletes_busy_parts,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'replace_busy_parts_source';
