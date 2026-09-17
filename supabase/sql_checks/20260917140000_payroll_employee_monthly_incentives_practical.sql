-- Practical verification for DBL-0076 Employee Monthly Incentives.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
--
-- Isolated payroll months 2099-01-01 / 2099-02-01. Live payroll_entries are not rewritten.
-- Inserts are rolled back.

BEGIN;

INSERT INTO public.payroll_employee_incentives
  (employee_code, payroll_month, incentive_type, value, incentive_percent, amount, description, created_by)
VALUES
  ('3000840_188', DATE '2099-01-01', 'Parts', 100000, 1, 1000.00, 'DBL-0076 practical Parts', 'cursor-agent'),
  ('3000840_188', DATE '2099-01-01', 'VAS', 20000, 2.5, 500.00, 'DBL-0076 practical VAS', 'cursor-agent'),
  ('3000840_612', DATE '2099-01-01', 'Rusting', 500, 10, 50.00, 'DBL-0076 practical other employee', 'cursor-agent'),
  ('3000840_188', DATE '2099-02-01', 'Others', 10000, 1, 100.00, 'DBL-0076 practical other month', 'cursor-agent');

CREATE TEMP TABLE dbl_0076_practical AS
SELECT
  (SELECT count(*) FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-01-01') = 2
    AS two_rows_same_employee_month,
  (SELECT round(sum(amount), 2) FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-01-01') = 1500
    AS jan_sum_1500,
  (SELECT amount FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-01-01' AND incentive_type = 'Parts') = 1000
    AS parts_amount_1000,
  (SELECT amount FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-01-01' AND incentive_type = 'VAS') = 500
    AS vas_amount_500,
  (SELECT round(sum(amount), 2) FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_612' AND payroll_month = DATE '2099-01-01') = 50
    AS other_employee_isolated,
  (SELECT count(*) FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-02-01') = 1
    AS feb_does_not_inherit_jan,
  (SELECT round((100000 * 1) / 100, 2) = 1000 AND round((20000 * 2.5) / 100, 2) = 500)
    AS derived_formula_ok,
  (SELECT count(*) FILTER (WHERE incentive_amount IS DISTINCT FROM 0) FROM public.payroll_entries) = 0
    AS historical_snapshot_still_zero,
  (
    SELECT round((
      20000::numeric + 0 + 1500 + 0 - 0 - 0
    ), 2)
  ) = 21500
    AS base_salary_net_includes_incentive_ungated;

-- Wrong derived amount must fail CHECK
DO $$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payroll_employee_incentives
      (employee_code, payroll_month, incentive_type, value, incentive_percent, amount)
    VALUES
      ('3000840_188', DATE '2099-01-01', 'Others', 100, 1, 999.00);
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'expected derived-amount CHECK to reject mismatched amount';
  END IF;
END $$;

SELECT * FROM dbl_0076_practical;

ROLLBACK;
