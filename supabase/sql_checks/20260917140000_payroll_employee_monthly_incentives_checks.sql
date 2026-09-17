-- Read-only verification checks for:
-- supabase/migrations/20260917140000_payroll_employee_monthly_incentives.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Source table exists
SELECT to_regclass('public.payroll_employee_incentives') IS NOT NULL
  AS payroll_employee_incentives_table_present;

-- 2) Column shapes
SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_employee_incentives'
  AND column_name IN (
    'id',
    'employee_code',
    'payroll_month',
    'incentive_type',
    'value',
    'incentive_percent',
    'amount',
    'description',
    'created_by',
    'created_at',
    'updated_at'
  )
ORDER BY column_name;
-- Expect 11 rows

SELECT
  data_type = 'numeric'
  AND numeric_precision = 12
  AND numeric_scale = 2
  AND is_nullable = 'NO'
AS incentive_value_shape_ok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_employee_incentives'
  AND column_name = 'value';

SELECT
  data_type = 'numeric'
  AND numeric_precision = 8
  AND numeric_scale = 4
  AND is_nullable = 'NO'
AS incentive_percent_shape_ok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_employee_incentives'
  AND column_name = 'incentive_percent';

SELECT
  data_type = 'numeric'
  AND numeric_precision = 12
  AND numeric_scale = 2
  AND is_nullable = 'NO'
AS incentive_amount_shape_ok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_employee_incentives'
  AND column_name = 'amount';

-- 3) No uniqueness on (employee_code, payroll_month) — multiple lines per employee/month
SELECT count(*) = 0 AS no_employee_month_unique
FROM pg_constraint
WHERE conrelid = 'public.payroll_employee_incentives'::regclass
  AND contype = 'u'
  AND pg_get_constraintdef(oid) ILIKE '%employee_code%'
  AND pg_get_constraintdef(oid) ILIKE '%payroll_month%'
  AND pg_get_constraintdef(oid) NOT ILIKE '%incentive_type%';

SELECT count(*) = 0 AS no_employee_month_unique_index
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'payroll_employee_incentives'
  AND indexdef ILIKE '%UNIQUE%'
  AND indexdef ILIKE '%employee_code%'
  AND indexdef ILIKE '%payroll_month%';

-- 4) Derived-amount CHECK uses the same 2dp round as payroll money
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.payroll_employee_incentives'::regclass
  AND conname = 'payroll_employee_incentives_amount_derived_chk';
-- Expect CHECK (amount = round((value * incentive_percent) / 100, 2))

SELECT pg_get_constraintdef(oid) LIKE '%round(((%'
  AND pg_get_constraintdef(oid) LIKE '%value * incentive_percent%'
  AND pg_get_constraintdef(oid) LIKE '%/ (100)%'
  AND pg_get_constraintdef(oid) LIKE '%, 2)%'
  AS derived_amount_check_ok
FROM pg_constraint
WHERE conrelid = 'public.payroll_employee_incentives'::regclass
  AND conname = 'payroll_employee_incentives_amount_derived_chk';

-- 5) Type CHECK
SELECT pg_get_constraintdef(oid) LIKE '%Parts%'
  AND pg_get_constraintdef(oid) LIKE '%Rusting%'
  AND pg_get_constraintdef(oid) LIKE '%VAS%'
  AND pg_get_constraintdef(oid) LIKE '%Others%'
  AS incentive_type_check_ok
FROM pg_constraint
WHERE conrelid = 'public.payroll_employee_incentives'::regclass
  AND conname = 'payroll_employee_incentives_incentive_type_check';

-- 6) FK to employee_master(employee_code)
SELECT
  confrelid = 'public.employee_master'::regclass
  AND array_length(conkey, 1) = 1
AS employee_code_fk_ok
FROM pg_constraint
WHERE conrelid = 'public.payroll_employee_incentives'::regclass
  AND contype = 'f';

-- 7) RLS + policies
SELECT relrowsecurity AS rls_enabled
FROM pg_class
WHERE oid = 'public.payroll_employee_incentives'::regclass;
-- Expect true

SELECT count(*) AS payroll_employee_incentives_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_employee_incentives';
-- Expect 3: select + modify + existing admin_unrestricted_all_ops_v1 bypass

SELECT
  (qual LIKE '%payroll_can_mutate_payroll%' AND with_check LIKE '%payroll_can_mutate_payroll%')
  AND (qual LIKE '%payroll_is_month_finalized%' AND with_check LIKE '%payroll_is_month_finalized%')
  AS incentive_modify_lock_ok
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_employee_incentives'
  AND policyname = 'payroll_employee_incentives_modify';

-- 8) Snapshot column on payroll_entries
SELECT
  data_type = 'numeric'
  AND numeric_precision = 12
  AND numeric_scale = 2
  AND is_nullable = 'NO'
  AND column_default ILIKE '%0%'
AS payroll_entries_incentive_amount_shape_ok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_entries'
  AND column_name = 'incentive_amount';

SELECT
  count(*) FILTER (WHERE incentive_amount IS NULL) = 0 AS no_null_incentive_snapshot,
  count(*) AS payroll_entries_row_count
FROM public.payroll_entries;

-- 9) payroll_entries unique pair unchanged; finalized-month guard intact
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.payroll_entries'::regclass
  AND contype = 'u'
  AND pg_get_constraintdef(oid) ILIKE '%employee_code%'
  AND pg_get_constraintdef(oid) ILIKE '%payroll_month%';
-- Expect payroll_entries_employee_code_payroll_month_key

SELECT
  qual LIKE '%payroll_is_month_finalized%'
  AND with_check LIKE '%payroll_is_month_finalized%'
  AS payroll_entries_modify_still_month_locked
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_entries'
  AND policyname = 'payroll_entries_modify';

-- 10) Combined pass flag
SELECT
  to_regclass('public.payroll_employee_incentives') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payroll_entries'
      AND column_name = 'incentive_amount'
  )
  AS dbl_0076_objects_present;
