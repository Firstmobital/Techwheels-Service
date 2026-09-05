-- Payable days: 30 is the earned-base divisor, not a storage maximum.
-- Employees may work additional days (including Sundays). Extra days increase
-- earned base via payroll_calc_earned_base(base / 30 * days).
--
-- Replaces payroll_attendance_payable_days_check
--   CHECK (payable_days >= 0 AND payable_days <= 30)
-- with a non-negative-only check. Half-day increment CHECK is unchanged.
--
-- Timestamp 20260905070000. Ledger: DBL-0038.
-- Does not mutate finalized payroll_entries. Attendance writes remain blocked
-- when payroll_is_month_finalized(payroll_month) is true.
--
-- Rollback:
-- ALTER TABLE public.payroll_attendance
--   DROP CONSTRAINT IF EXISTS payroll_attendance_payable_days_check;
-- ALTER TABLE public.payroll_attendance
--   ADD CONSTRAINT payroll_attendance_payable_days_check
--   CHECK (payable_days >= 0 AND payable_days <= 30);

ALTER TABLE public.payroll_attendance
  DROP CONSTRAINT IF EXISTS payroll_attendance_payable_days_check;

ALTER TABLE public.payroll_attendance
  ADD CONSTRAINT payroll_attendance_payable_days_check
  CHECK (payable_days >= 0);
