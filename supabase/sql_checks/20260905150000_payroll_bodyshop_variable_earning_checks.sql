-- Read-only verification checks for:
-- supabase/migrations/20260905150000_payroll_bodyshop_variable_earning.sql
-- Execution: This file can be run in one go.

-- 1) Column exists with SA/Tech snapshot conventions
SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_entries'
  AND column_name IN (
    'sa_variable_earning',
    'technician_variable_earning',
    'bodyshop_variable_earning',
    'variable_earning_total'
  )
ORDER BY column_name;
-- Expect 4 rows
-- bodyshop_variable_earning: numeric, precision 12, scale 2, is_nullable = NO, default 0

SELECT
  data_type = 'numeric'
  AND numeric_precision = 12
  AND numeric_scale = 2
  AND is_nullable = 'NO'
  AND column_default ILIKE '%0%'
AS bodyshop_variable_earning_shape_ok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_entries'
  AND column_name = 'bodyshop_variable_earning';

-- 2) Existing rows are readable and default to 0 when never recomputed
SELECT
  count(*) AS payroll_entries_row_count,
  count(*) FILTER (WHERE bodyshop_variable_earning IS NULL) AS null_bodyshop_count,
  count(*) FILTER (WHERE bodyshop_variable_earning = 0) AS zero_bodyshop_count
FROM public.payroll_entries;
-- Expect null_bodyshop_count = 0

-- 3) Finalized-month write guard still applies to the whole payroll_entries row
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_entries'
  AND policyname = 'payroll_entries_modify';
-- Expect qual and with_check to include payroll_is_month_finalized(payroll_month)

SELECT pg_get_functiondef('public.payroll_is_month_finalized(date)'::regprocedure)
  LIKE '%status = ''finalized''%' AS finalized_helper_intact;

-- 4) No extra payroll_entries policies
SELECT count(*) AS payroll_entries_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_entries';
-- Expect 2 (select + modify)
