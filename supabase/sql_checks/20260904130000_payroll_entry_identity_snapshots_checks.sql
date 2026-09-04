-- Read-only verification checks for:
-- supabase/migrations/20260904130000_payroll_entry_identity_snapshots.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Snapshot columns exist with expected types and nullability
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_entries'
  AND column_name IN (
    'employee_name_snapshot',
    'department_snapshot',
    'branch_snapshot',
    'role_snapshot',
    'bank_name_snapshot',
    'account_number_snapshot',
    'ifsc_snapshot'
  )
ORDER BY column_name;
-- Expect 7 rows; account_number_snapshot data_type = text; all is_nullable = YES

-- 2) Existing numeric / identity payroll columns unchanged
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_entries'
  AND column_name IN (
    'employee_code',
    'salary_type_snapshot',
    'base_salary_snapshot',
    'payable_days_snapshot',
    'earned_base',
    'sa_variable_earning',
    'technician_variable_earning',
    'variable_earning_total',
    'custom_additions',
    'other_deductions',
    'advance_deduction',
    'gross_payout',
    'net_payable'
  )
ORDER BY column_name;
-- Expect 13 rows

-- 3) Finalized-month write guard still applies to the whole payroll_entries row
-- Use pg_policies (portable). pg_get_policydef(oid) is not available on this database.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_entries'
  AND policyname = 'payroll_entries_modify';
-- Expect qual and with_check to include payroll_is_month_finalized(payroll_month)

-- 4) No extra snapshot policies were added
SELECT count(*) AS payroll_entries_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_entries';
-- Expect 2 (select + modify)

-- 5) Integrity: row counts and month statuses are readable (operator compares to pre-apply notes)
SELECT count(*) AS payroll_entries_row_count FROM public.payroll_entries;
SELECT status, count(*) AS month_count
FROM public.payroll_months
GROUP BY status
ORDER BY status;
