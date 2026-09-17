-- Read-only verification checks for:
-- supabase/migrations/20260917170000_payroll_employee_incentive_calculation_method.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) calculation_method column
SELECT
  data_type = 'text'
  AND is_nullable = 'NO'
  AND column_default ILIKE '%percentage%'
AS calculation_method_shape_ok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_employee_incentives'
  AND column_name = 'calculation_method';

-- 2) value / incentive_percent nullable for fixed rows
SELECT is_nullable = 'YES' AS value_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_employee_incentives'
  AND column_name = 'value';

SELECT is_nullable = 'YES' AS incentive_percent_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_employee_incentives'
  AND column_name = 'incentive_percent';

SELECT is_nullable = 'NO' AS amount_still_required
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_employee_incentives'
  AND column_name = 'amount';

-- 3) Method CHECK
SELECT pg_get_constraintdef(oid) LIKE '%percentage%'
  AND pg_get_constraintdef(oid) LIKE '%fixed%'
AS calculation_method_check_ok
FROM pg_constraint
WHERE conrelid = 'public.payroll_employee_incentives'::regclass
  AND conname = 'payroll_employee_incentives_calculation_method_chk';

-- 4) Derived-amount CHECK replaced by method-aware CHECK
SELECT count(*) = 0 AS old_derived_check_dropped
FROM pg_constraint
WHERE conrelid = 'public.payroll_employee_incentives'::regclass
  AND conname = 'payroll_employee_incentives_amount_derived_chk';

SELECT
  pg_get_constraintdef(oid) LIKE '%percentage%'
  AND pg_get_constraintdef(oid) LIKE '%fixed%'
  AND pg_get_constraintdef(oid) LIKE '%round%'
AS method_amount_check_ok
FROM pg_constraint
WHERE conrelid = 'public.payroll_employee_incentives'::regclass
  AND conname = 'payroll_employee_incentives_method_amount_chk';

-- 5) Existing rows classified percentage; amounts unchanged (all non-null method)
SELECT
  count(*) FILTER (WHERE calculation_method IS NULL) = 0 AS no_null_method,
  count(*) FILTER (WHERE calculation_method NOT IN ('percentage', 'fixed')) = 0 AS only_known_methods,
  count(*) FILTER (
    WHERE calculation_method = 'percentage'
      AND amount IS DISTINCT FROM round((value * incentive_percent) / 100, 2)
  ) = 0 AS percentage_rows_still_derived
FROM public.payroll_employee_incentives;

-- 6) No uniqueness on (employee_code, payroll_month)
SELECT count(*) = 0 AS no_employee_month_unique
FROM pg_constraint
WHERE conrelid = 'public.payroll_employee_incentives'::regclass
  AND contype = 'u'
  AND pg_get_constraintdef(oid) ILIKE '%employee_code%'
  AND pg_get_constraintdef(oid) ILIKE '%payroll_month%';

-- 7) RLS / month lock unchanged
SELECT
  (qual LIKE '%payroll_can_mutate_payroll%' AND with_check LIKE '%payroll_can_mutate_payroll%')
  AND (qual LIKE '%payroll_is_month_finalized%' AND with_check LIKE '%payroll_is_month_finalized%')
  AS incentive_modify_lock_ok
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_employee_incentives'
  AND policyname = 'payroll_employee_incentives_modify';

-- 8) Snapshot column unchanged; no rewrite of historical nets implied
SELECT
  data_type = 'numeric'
  AND numeric_precision = 12
  AND numeric_scale = 2
  AND is_nullable = 'NO'
AS payroll_entries_incentive_amount_unchanged
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_entries'
  AND column_name = 'incentive_amount';

-- 9) Combined pass flag
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payroll_employee_incentives'
      AND column_name = 'calculation_method'
      AND is_nullable = 'NO'
  )
  AND EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payroll_employee_incentives'::regclass
      AND conname = 'payroll_employee_incentives_method_amount_chk'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payroll_employee_incentives'::regclass
      AND conname = 'payroll_employee_incentives_amount_derived_chk'
  )
  AS dbl_0078_objects_present;
