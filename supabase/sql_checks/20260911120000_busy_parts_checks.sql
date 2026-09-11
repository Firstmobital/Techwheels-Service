-- BUSY Parts persistence checks
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'busy_parts'
) AS busy_parts_table_exists;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'busy_parts'
ORDER BY ordinal_position;

SELECT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname = 'busy_parts_source_row_key_key'
) AS source_row_key_unique_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname = 'busy_parts_source_type_check'
) AS source_type_check_exists;

SELECT relrowsecurity AS busy_parts_rls_enabled
FROM pg_class
WHERE oid = 'public.busy_parts'::regclass;

SELECT polname
FROM pg_policy
WHERE polrelid = 'public.busy_parts'::regclass
ORDER BY polname;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'replace_busy_parts_source'
) AS replace_busy_parts_source_exists;

SELECT
  col_description('public.busy_parts'::regclass, attnum) AS column_comment,
  attname
FROM pg_attribute
WHERE attrelid = 'public.busy_parts'::regclass
  AND attname IN ('invoice_no', 'invoice_date', 'job_card_no', 'net_amount', 'source_row_key')
  AND attnum > 0
ORDER BY attname;
