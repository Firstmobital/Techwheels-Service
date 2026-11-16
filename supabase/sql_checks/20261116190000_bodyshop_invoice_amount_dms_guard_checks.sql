-- Read-only checks for 20261116190000_bodyshop_invoice_amount_dms_guard.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Note: the SQL editor shows only the last result when run in one go; run each SELECT separately there.

-- Expect: 2 true
SELECT count(*) AS new_columns_should_be_2 FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bodyshop_settlements'
  AND column_name IN ('invoice_amount_variance_reason', 'invoice_dms_amount_at_save');

-- Expect: exactly 1 overload, with 13 arguments (the old 12-arg function must be gone)
SELECT count(*) AS overloads_should_be_1, max(p.pronargs) AS args_should_be_13
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upsert_bodyshop_settlement_header';

-- Expect: false / true / true
SELECT has_function_privilege('anon', p.oid, 'execute') AS anon_should_be_false,
       has_function_privilege('authenticated', p.oid, 'execute') AS authenticated_should_be_true,
       has_function_privilege('service_role', p.oid, 'execute') AS service_role_should_be_true
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upsert_bodyshop_settlement_header';

-- Expect: true (guard present)
SELECT pg_get_functiondef(p.oid) LIKE '%differs from the DMS invoice amount%' AS guard_present_should_be_true
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upsert_bodyshop_settlement_header';

-- Existing rows untouched: expect 0 (no reason has been written yet by this migration)
SELECT count(*) AS reasons_written_by_migration_should_be_0 FROM public.bodyshop_settlements
WHERE invoice_amount_variance_reason IS NOT NULL;
