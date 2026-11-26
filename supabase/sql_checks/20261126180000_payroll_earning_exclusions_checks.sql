-- DBL-0105 paired checks (read-only). Every row must show ok = true.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
SELECT 'rls enabled' AS check_name, relrowsecurity AS ok FROM pg_class WHERE oid = 'public.payroll_earning_exclusions'::regclass
UNION ALL SELECT '3 module policies', count(*) = 3 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payroll_earning_exclusions' AND policyname LIKE 'payroll\_exclusions\_%'
UNION ALL SELECT 'users cannot delete', NOT has_table_privilege('authenticated', 'public.payroll_earning_exclusions', 'DELETE')
UNION ALL SELECT 'anon cannot read', NOT has_table_privilege('anon', 'public.payroll_earning_exclusions', 'SELECT')
UNION ALL SELECT 'guard trigger present', count(*) = 1 FROM pg_trigger WHERE tgname = 'payroll_earning_exclusions_guard' AND NOT tgisinternal;
