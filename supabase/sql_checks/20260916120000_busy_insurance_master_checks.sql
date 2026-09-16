-- BUSY-001 / DBL-0067
-- supabase/migrations/20260916120000_busy_insurance_master.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'busy_insurance_master'
) AS busy_insurance_master_table_exists;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'busy_insurance_master'
ORDER BY ordinal_position;

SELECT EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'busy_insurance_master_company_name_unique'
) AS company_name_unique_exists;

SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.busy_insurance_master'::regclass
ORDER BY conname;

SELECT relrowsecurity AS busy_insurance_master_rls_enabled
FROM pg_class
WHERE oid = 'public.busy_insurance_master'::regclass;

SELECT polname
FROM pg_policy
WHERE polrelid = 'public.busy_insurance_master'::regclass
ORDER BY polname;

SELECT
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.busy_insurance_master'::regclass
      AND tgname = 'trg_busy_insurance_master_normalize_v1'
  ) AS normalize_trigger_exists,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'busy_insurance_master_normalize_v1'
  ) AS normalize_function_exists;

SELECT count(*) AS seeded_row_count
FROM public.busy_insurance_master;

SELECT count(*) AS duplicate_company_names
FROM (
  SELECT lower(btrim(company_name))
  FROM public.busy_insurance_master
  GROUP BY 1
  HAVING count(*) > 1
) d;

SELECT EXISTS (
  SELECT 1
  FROM public.busy_insurance_master
  WHERE company_name = 'ICICI LOMBARD GENERAL INSURANCE'
    AND busy_group = 'ICICI LOMBARD'
    AND gstin = '08AAACI7904G1ZN'
) AS icici_seed_present;
