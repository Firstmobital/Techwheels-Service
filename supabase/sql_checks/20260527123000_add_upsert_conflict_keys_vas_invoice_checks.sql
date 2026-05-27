-- Verification checks for:
-- 20260527123000_add_upsert_conflict_keys_vas_invoice.sql

-- 1) Confirm indexes exist
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'uq_service_vas_conflict',
    'uq_service_invoice_conflict'
  )
ORDER BY indexname;

-- 2) Ensure VAS duplicates no longer exist for natural key
SELECT
  upper(trim(job_card_number)) AS job_card_number,
  trim(branch) AS branch,
  upper(trim(sr_type)) AS sr_type,
  COUNT(*) AS row_count
FROM public.service_vas_jc_data
WHERE nullif(trim(coalesce(job_card_number, '')), '') IS NOT NULL
  AND nullif(trim(coalesce(branch, '')), '') IS NOT NULL
  AND nullif(trim(coalesce(sr_type, '')), '') IS NOT NULL
GROUP BY 1,2,3
HAVING COUNT(*) > 1
ORDER BY row_count DESC
LIMIT 50;

-- 3) Ensure Invoice duplicates no longer exist for natural key
DO $$
DECLARE
  invoice_key_col text;
  check_sql text;
BEGIN
  SELECT c.column_name
    INTO invoice_key_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'service_invoice_data'
    AND c.column_name IN ('job_card_number', 'order_number', 'sr_number', 'invoice_number')
  ORDER BY array_position(ARRAY['job_card_number', 'order_number', 'sr_number', 'invoice_number'], c.column_name)
  LIMIT 1;

  IF invoice_key_col IS NULL THEN
    RAISE EXCEPTION 'service_invoice_data: none of expected key columns found (job_card_number/order_number/sr_number/invoice_number)';
  END IF;

  check_sql := format($f$
    SELECT
      upper(trim(%1$I)) AS invoice_key,
      trim(branch) AS branch,
      invoice_date,
      COUNT(*) AS row_count
    FROM public.service_invoice_data
    WHERE nullif(trim(coalesce(%1$I, '')), '') IS NOT NULL
      AND nullif(trim(coalesce(branch, '')), '') IS NOT NULL
      AND invoice_date IS NOT NULL
    GROUP BY 1,2,3
    HAVING COUNT(*) > 1
    ORDER BY row_count DESC
    LIMIT 50;
  $f$, invoice_key_col);

  RAISE NOTICE 'Checking invoice duplicates using key column: %', invoice_key_col;
  EXECUTE check_sql;
END $$;

-- 4) Optional row counts for quick sanity
SELECT 'service_vas_jc_data' AS table_name, COUNT(*) AS total_rows FROM public.service_vas_jc_data
UNION ALL
SELECT 'service_invoice_data' AS table_name, COUNT(*) AS total_rows FROM public.service_invoice_data;
