-- ACCOUNTS-003 Phase 1 paired checks (read-only). Every row must show ok = true.
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
SELECT 'rls enabled on 3 tables' AS check_name, count(*) = 3 AS ok FROM pg_class
  WHERE oid IN ('public.pnl_recurring_expenses'::regclass, 'public.pnl_expense_entries'::regclass, 'public.pnl_expense_entry_history'::regclass) AND relrowsecurity
UNION ALL SELECT '7 module policies', count(*) = 7 FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('pnl_recurring_expenses','pnl_expense_entries','pnl_expense_entry_history') AND policyname LIKE 'pnl\_%'
UNION ALL SELECT 'users cannot delete entries', NOT has_table_privilege('authenticated', 'public.pnl_expense_entries', 'DELETE')
UNION ALL SELECT 'users cannot write history', NOT has_table_privilege('authenticated', 'public.pnl_expense_entry_history', 'INSERT, UPDATE, DELETE')
UNION ALL SELECT 'anon cannot read entries', NOT has_table_privilege('anon', 'public.pnl_expense_entries', 'SELECT')
UNION ALL SELECT 'old grid is read-only', NOT has_table_privilege('authenticated', 'public.pnl_expenses', 'INSERT, UPDATE, DELETE')
UNION ALL SELECT 'every old grid row carried over', NOT EXISTS (
  SELECT 1 FROM public.pnl_expenses o WHERE NOT EXISTS (
    SELECT 1 FROM public.pnl_expense_entry_history h
     WHERE h.action = 'created' AND h.new_row->>'note' = 'Carried over from the monthly grid'
       AND (h.new_row->>'expense_month')::date = o.expense_month AND h.new_row->>'branch' = o.branch
       AND (h.new_row->>'head_id')::bigint = o.head_id AND (h.new_row->>'amount')::numeric = o.amount))
UNION ALL SELECT '3 guard triggers', count(*) = 3 FROM pg_trigger
  WHERE tgname IN ('pnl_expense_entries_guard','pnl_expense_entries_history','pnl_recurring_expenses_guard') AND NOT tgisinternal;
