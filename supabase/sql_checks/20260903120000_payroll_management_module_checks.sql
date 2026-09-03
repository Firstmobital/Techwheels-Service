-- Payroll module checks
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'payroll_compensation'
) AS payroll_compensation_exists;

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'payroll_entries'
) AS payroll_entries_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'payroll_calc_earned_base'
) AS payroll_calc_fn_exists;

SELECT EXISTS (
  SELECT 1 FROM public.modules WHERE name = 'payroll'
) AS payroll_module_registered;

-- Verify canonical salary examples
SELECT public.payroll_calc_earned_base(28000, 29) = 27067 AS example_28000_29;
SELECT public.payroll_calc_earned_base(22000, 29.5) = 21633 AS example_22000_29_5;
