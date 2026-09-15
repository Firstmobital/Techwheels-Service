-- Read-only verification checks for:
-- supabase/migrations/20260915183000_service_advisor_estimates.sql
-- PARTS-002 / DBL-0064
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) table present
SELECT to_regclass('public.service_advisor_estimates') AS table_regclass_should_be_present;

-- 2) unique reception_entry_id
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'service_advisor_estimates'
ORDER BY indexname;

-- 3) CHECK constraints
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.service_advisor_estimates'::regclass
ORDER BY conname;

-- 4) RLS enabled
SELECT relrowsecurity AS rls_should_be_true
FROM pg_class
WHERE oid = 'public.service_advisor_estimates'::regclass;

-- 5) policies
SELECT polname
FROM pg_policy
WHERE polrelid = 'public.service_advisor_estimates'::regclass
ORDER BY polname;

-- 6) customer_estimates still absent (do not create as a side effect)
SELECT to_regclass('public.customer_estimates') AS customer_estimates_should_be_null;
