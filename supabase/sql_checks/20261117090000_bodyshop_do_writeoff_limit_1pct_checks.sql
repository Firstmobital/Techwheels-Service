-- Read-only checks for 20261117090000_bodyshop_do_writeoff_limit_1pct.sql
-- Execution: This file can be run in one go.
-- Note: the SQL editor shows only the last result when run in one go; run each SELECT separately there.

-- Expect: true / false / true (1% limit present, old 0.5% limit gone, message says 1%)
SELECT pg_get_functiondef(p.oid) LIKE '%insurance_due_amount * 100 > v_h.do_amount%' AS limit_1pct_should_be_true,
       pg_get_functiondef(p.oid) LIKE '%insurance_due_amount * 200%' AS old_limit_should_be_false,
       pg_get_functiondef(p.oid) LIKE '%above 1%% of the DO amount%' AS message_should_be_true
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'write_off_bodyshop_do_residual';

-- Expect: false / true / true
SELECT has_function_privilege('anon', p.oid, 'execute') AS anon_should_be_false,
       has_function_privilege('authenticated', p.oid, 'execute') AS authenticated_should_be_true,
       has_function_privilege('service_role', p.oid, 'execute') AS service_role_should_be_true
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'write_off_bodyshop_do_residual';

-- Expect: exactly 1 overload
SELECT count(*) AS overloads_should_be_1
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'write_off_bodyshop_do_residual';
