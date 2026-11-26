-- ACCOUNTS-003 paired checks (read-only). Every row must show ok = true.
SELECT 'module registered' AS check_name, count(*) = 1 AS ok FROM public.modules WHERE name = 'pnl_report' AND is_active
UNION ALL SELECT 'rls enabled on 3 tables', count(*) = 3 FROM pg_class
  WHERE oid IN ('public.pnl_settings'::regclass, 'public.pnl_expense_heads'::regclass, 'public.pnl_expenses'::regclass) AND relrowsecurity
UNION ALL SELECT '9 policies', count(*) = 9 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('pnl_settings','pnl_expense_heads','pnl_expenses')
UNION ALL SELECT 'default settings row', count(*) = 1 FROM public.pnl_settings
UNION ALL SELECT 'one salary head', count(*) = 1 FROM public.pnl_expense_heads WHERE code = 'salary'
UNION ALL SELECT 'anon cannot read expenses', NOT has_table_privilege('anon', 'public.pnl_expenses', 'SELECT')
UNION ALL SELECT 'anon cannot run payroll rpc', NOT has_function_privilege('anon', 'public.pnl_payroll_cost(date,date)', 'EXECUTE');
