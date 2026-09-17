-- Practical verification for DBL-0078 percentage vs fixed incentive amounts.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
--
-- Isolated payroll months 2099-01-01 / 2099-02-01. Live payroll_entries are not rewritten.
-- Inserts are rolled back.

BEGIN;

INSERT INTO public.payroll_employee_incentives
  (employee_code, payroll_month, incentive_type, calculation_method, value, incentive_percent, amount, description, created_by)
VALUES
  ('3000840_188', DATE '2099-01-01', 'Parts', 'percentage', 235281, 2.13, 5011.49, 'DBL-0078 practical Parts %', 'cursor-agent'),
  ('3000840_188', DATE '2099-01-01', 'Others', 'fixed', NULL, NULL, 5000.00, 'DBL-0078 practical special', 'cursor-agent'),
  ('3000840_612', DATE '2099-01-01', 'VAS', 'percentage', 100000, 1, 1000.00, 'DBL-0078 other employee', 'cursor-agent'),
  ('3000840_188', DATE '2099-02-01', 'Others', 'fixed', NULL, NULL, 750.00, 'DBL-0078 other month', 'cursor-agent');

CREATE TEMP TABLE dbl_0078_practical AS
SELECT
  (SELECT count(*) FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-01-01') = 2
    AS two_modes_same_employee_month,
  (SELECT round(sum(amount), 2) FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-01-01') = 10011.49
    AS jan_mixed_sum,
  (SELECT amount FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-01-01' AND incentive_type = 'Parts') = 5011.49
    AS percentage_235281_x_2_13,
  (SELECT amount FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-01-01' AND incentive_type = 'Others') = 5000
    AS fixed_amount_5000,
  (SELECT value IS NULL AND incentive_percent IS NULL FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-01-01' AND incentive_type = 'Others')
    AS fixed_value_percent_null,
  (SELECT round((416030 * 1.45) / 100, 2)) = 6032.44
    AS percentage_416030_x_1_45,
  (SELECT count(*) FROM public.payroll_employee_incentives
    WHERE employee_code = '3000840_188' AND payroll_month = DATE '2099-02-01') = 1
    AS feb_does_not_inherit_jan,
  (SELECT count(*) FILTER (WHERE incentive_amount IS DISTINCT FROM 0) FROM public.payroll_entries
    WHERE payroll_month IN (DATE '2099-01-01', DATE '2099-02-01')) = 0
    AS isolated_months_have_no_snapshot_rewrite;

-- Percentage mismatched amount must still fail
DO $$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payroll_employee_incentives
      (employee_code, payroll_month, incentive_type, calculation_method, value, incentive_percent, amount)
    VALUES
      ('3000840_188', DATE '2099-01-01', 'Rusting', 'percentage', 100, 1, 999.00);
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'expected percentage CHECK to reject mismatched amount';
  END IF;
END $$;

-- Fixed amount must not be forced to Value × %
DO $$
DECLARE
  allowed boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payroll_employee_incentives
      (employee_code, payroll_month, incentive_type, calculation_method, value, incentive_percent, amount, description)
    VALUES
      ('3000840_188', DATE '2099-01-01', 'Rusting', 'fixed', 100000, 1, 1250.00, 'stale value/% ignored');
    allowed := true;
  EXCEPTION WHEN check_violation THEN
    allowed := false;
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'expected fixed CHECK to allow amount independent of value and percent';
  END IF;
END $$;

SELECT * FROM dbl_0078_practical;

ROLLBACK;
