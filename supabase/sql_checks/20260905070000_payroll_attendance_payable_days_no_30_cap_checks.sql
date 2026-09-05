-- Read-only verification checks for:
-- supabase/migrations/20260905070000_payroll_attendance_payable_days_no_30_cap.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Upper-bound CHECK is gone; non-negative CHECK remains
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'payroll_attendance'
  AND con.contype = 'c'
ORDER BY con.conname;
-- Expect payroll_attendance_payable_days_check = CHECK (payable_days >= 0)
-- Expect payroll_attendance_half_day still present
-- Expect no definition containing payable_days <= 30

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'payroll_attendance'
    AND pg_get_constraintdef(con.oid) ILIKE '%<=%30%'
) AS no_payable_days_le_30_check;

SELECT EXISTS (
  SELECT 1
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'payroll_attendance'
    AND con.conname = 'payroll_attendance_payable_days_check'
    AND pg_get_constraintdef(con.oid) ILIKE '%payable_days >= 0%'
) AS nonneg_check_present;

SELECT EXISTS (
  SELECT 1
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'payroll_attendance'
    AND con.conname = 'payroll_attendance_half_day'
) AS half_day_check_present;

-- 2) Earned-base SQL authority: 30 is the divisor, not a cap
SELECT public.payroll_calc_earned_base(30000, 30) = 30000 AS base_30000_days_30;
SELECT public.payroll_calc_earned_base(30000, 31) = 31000 AS base_30000_days_31;
SELECT public.payroll_calc_earned_base(30000, 32) = 32000 AS base_30000_days_32;
SELECT public.payroll_calc_earned_base(30000, 28) = 28000 AS base_30000_days_28;
SELECT public.payroll_calc_earned_base(20150, 32) = 21493 AS base_20150_days_32;

-- 3) Finalized-month attendance lock unchanged
SELECT pg_get_functiondef('public.payroll_is_month_finalized(date)'::regprocedure)
  LIKE '%status = ''finalized''%' AS finalized_helper_intact;
