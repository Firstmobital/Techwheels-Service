-- Payroll Employee Monthly Incentives: percentage vs fixed amount.
--
-- Adds calculation_method ('percentage' | 'fixed'). Existing rows are
-- classified as percentage and their Amount values are not rewritten.
-- payroll_entries snapshots are not rewritten.
--
-- Percentage: value and incentive_percent required; amount =
--   round(value * incentive_percent / 100, 2)
-- Fixed: amount is authoritative; value and incentive_percent optional/NULL.
--
-- Timestamp 20260917170000. Ledger: DBL-0078. Requires DBL-0076.
--
-- Rollback:
-- DELETE FROM public.payroll_employee_incentives WHERE calculation_method = 'fixed';
-- ALTER TABLE public.payroll_employee_incentives
--   DROP CONSTRAINT IF EXISTS payroll_employee_incentives_method_amount_chk;
-- ALTER TABLE public.payroll_employee_incentives
--   DROP CONSTRAINT IF EXISTS payroll_employee_incentives_calculation_method_chk;
-- ALTER TABLE public.payroll_employee_incentives ALTER COLUMN value SET NOT NULL;
-- ALTER TABLE public.payroll_employee_incentives ALTER COLUMN incentive_percent SET NOT NULL;
-- ALTER TABLE public.payroll_employee_incentives
--   ADD CONSTRAINT payroll_employee_incentives_amount_derived_chk
--   CHECK (amount = round((value * incentive_percent) / 100, 2));
-- ALTER TABLE public.payroll_employee_incentives DROP COLUMN IF EXISTS calculation_method;

ALTER TABLE public.payroll_employee_incentives
  ADD COLUMN IF NOT EXISTS calculation_method text;

UPDATE public.payroll_employee_incentives
SET calculation_method = 'percentage'
WHERE calculation_method IS NULL;

ALTER TABLE public.payroll_employee_incentives
  ALTER COLUMN calculation_method SET DEFAULT 'percentage';

ALTER TABLE public.payroll_employee_incentives
  ALTER COLUMN calculation_method SET NOT NULL;

ALTER TABLE public.payroll_employee_incentives
  DROP CONSTRAINT IF EXISTS payroll_employee_incentives_calculation_method_chk;
ALTER TABLE public.payroll_employee_incentives
  ADD CONSTRAINT payroll_employee_incentives_calculation_method_chk
  CHECK (calculation_method IN ('percentage', 'fixed'));

ALTER TABLE public.payroll_employee_incentives
  DROP CONSTRAINT IF EXISTS payroll_employee_incentives_amount_derived_chk;

ALTER TABLE public.payroll_employee_incentives
  ALTER COLUMN value DROP NOT NULL;

ALTER TABLE public.payroll_employee_incentives
  ALTER COLUMN incentive_percent DROP NOT NULL;

ALTER TABLE public.payroll_employee_incentives
  DROP CONSTRAINT IF EXISTS payroll_employee_incentives_method_amount_chk;
ALTER TABLE public.payroll_employee_incentives
  ADD CONSTRAINT payroll_employee_incentives_method_amount_chk
  CHECK (
    (
      calculation_method = 'percentage'
      AND value IS NOT NULL
      AND incentive_percent IS NOT NULL
      AND amount = round((value * incentive_percent) / 100, 2)
    )
    OR (
      calculation_method = 'fixed'
      AND amount IS NOT NULL
    )
  );

COMMENT ON COLUMN public.payroll_employee_incentives.calculation_method IS
  'DBL-0078: percentage = amount derived from value × percent / 100; fixed = amount entered directly.';

COMMENT ON COLUMN public.payroll_employee_incentives.amount IS
  'Final line amount. Derived when calculation_method = percentage; authoritative when calculation_method = fixed.';

COMMENT ON COLUMN public.payroll_employee_incentives.value IS
  'Required for percentage method. Optional/NULL for fixed method.';

COMMENT ON COLUMN public.payroll_employee_incentives.incentive_percent IS
  'Required for percentage method. Optional/NULL for fixed method.';

COMMENT ON TABLE public.payroll_employee_incentives IS
  'DBL-0076/0077: Manual monthly employee incentive lines. Multiple rows per employee_code + payroll_month are allowed. calculation_method percentage derives amount; fixed stores amount directly. Snapshot is SUM(amount) on payroll_entries.incentive_amount.';

NOTIFY pgrst, 'reload schema';
