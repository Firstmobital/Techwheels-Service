-- Read-only checks for 20261125140000_finance_data_access_hardening.sql (ACCOUNTS-002, DBL-0101)
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Note: the SQL editor shows only the last result when run in one go; run each SELECT separately there.

-- Expect: 42 (10 tables x 4 policies + 2 read-only warranty tables)
SELECT count(*) AS finance_policies_should_be_42
FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'finance\_%';

-- Expect: 0 rows. No authenticated policy with a literal true condition may remain on the protected tables.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND (tablename IN ('psf_revenue_dms', 'job_card_closed_data', 'service_invoice_data') OR tablename LIKE 'warranty\_%')
  AND 'authenticated' = ANY (roles)
  AND (qual = 'true' OR with_check = 'true');

-- Expect: 1 (module exists) and 0 users granted it unless Finance has granted it deliberately
SELECT (SELECT count(*) FROM public.modules WHERE name = 'finance_all_branches') AS module_should_be_1,
       (SELECT count(*) FROM public.user_module_permissions p JOIN public.modules m ON m.id = p.module_id
         WHERE m.name = 'finance_all_branches') AS grants_review_manually;

-- Expect: false / false / false (bank fields not selectable) and true (a non-bank column is)
SELECT has_column_privilege('authenticated', 'public.employee_master', 'bank_name', 'SELECT')      AS bank_name_should_be_false,
       has_column_privilege('authenticated', 'public.employee_master', 'account_number', 'SELECT') AS account_number_should_be_false,
       has_column_privilege('authenticated', 'public.employee_master', 'ifsc', 'SELECT')           AS ifsc_should_be_false,
       has_column_privilege('authenticated', 'public.employee_master', 'employee_name', 'SELECT')  AS employee_name_should_be_true;

-- Expect: 0 rows. Any employee_master column other than the three bank fields that authenticated cannot select
-- (a column added later needs an explicit GRANT SELECT (column) ... TO authenticated).
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'employee_master'
  AND column_name NOT IN ('bank_name', 'account_number', 'ifsc')
  AND NOT has_column_privilege('authenticated', 'public.employee_master', column_name, 'SELECT');

-- Expect: false / true for the bank readers, and false for anon on all three new functions
SELECT has_function_privilege('anon', 'public.get_employee_bank_details(text[])', 'EXECUTE')      AS anon_bank_rpc_should_be_false,
       has_function_privilege('authenticated', 'public.get_employee_bank_details(text[])', 'EXECUTE') AS auth_bank_rpc_should_be_true,
       has_function_privilege('anon', 'public.set_employee_bank_details(jsonb)', 'EXECUTE')        AS anon_bank_write_should_be_false,
       has_function_privilege('anon', 'public.finance_data_read_allowed()', 'EXECUTE')             AS anon_read_helper_should_be_false;
