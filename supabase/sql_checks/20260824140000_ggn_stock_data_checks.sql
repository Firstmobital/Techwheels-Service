-- Read-only verification checks for:
-- supabase/migrations/20260824140000_ggn_stock_data.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'ggn_stock_data';
-- Expect 1 row

-- 2) Core columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ggn_stock_data'
  AND column_name IN (
    'part_number', 'part_description', 'plant', 'storage_location',
    'free_stock', 'source_file_name', 'uploaded_at', 'source_row_hash'
  )
ORDER BY column_name;
-- Expect 8 rows

-- 3) Unique on part_number
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.ggn_stock_data'::regclass
  AND contype = 'u';
-- Expect ggn_stock_data_part_number_key

-- 4) parts_requests new columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'parts_requests'
  AND column_name IN ('matched_order_number', 'matched_order_status_label', 'ggn_stock_status')
ORDER BY column_name;
-- Expect 3 rows

-- 5) Helper functions
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ggn_stock_status_for_part', 'refresh_parts_requests_ggn_stock')
ORDER BY p.proname;
-- Expect 2 rows, prosecdef true

-- 6) RLS enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname = 'ggn_stock_data';
-- Expect relrowsecurity = true

-- 7) Lookup behaviour (empty table → NULL)
SELECT public.ggn_stock_status_for_part(NULL) AS null_input,
       public.ggn_stock_status_for_part('') AS blank_input,
       public.ggn_stock_status_for_part('NO-SUCH-PART') AS missing_part;
-- Expect all NULL
