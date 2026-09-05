-- Read-only / structural verification for:
-- supabase/migrations/20260905180000_payroll_unlock_security_gate.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
--
-- This file does not insert live payroll/advance rows. The unlock+recompute money
-- cycle is proven by function-body contract checks below plus the practical
-- operator scenario (finalize → unlock → recompute) after apply.

-- 1) Unlock signature is (date, text, text, text) — old 3-arg overload must be gone
SELECT to_regprocedure('public.payroll_unlock_month(date,text,text,text)') IS NOT NULL AS unlock_4arg_exists,
       to_regprocedure('public.payroll_unlock_month(date,text,text)') IS NULL AS unlock_3arg_removed;

-- 2) Unlock body: advance reversal, recovered recalc, cancelled left alone, fresh code, audit
SELECT
  pg_get_functiondef('public.payroll_unlock_month(date,text,text,text)'::regprocedure)
    LIKE '%status = ''pending''%' AS reverts_schedule_pending,
  pg_get_functiondef('public.payroll_unlock_month(date,text,text,text)'::regprocedure)
    LIKE '%applied_amount = 0%' AS clears_applied_amount,
  pg_get_functiondef('public.payroll_unlock_month(date,text,text,text)'::regprocedure)
    LIKE '%recovered_amount%' AS recalcs_recovered,
  pg_get_functiondef('public.payroll_unlock_month(date,text,text,text)'::regprocedure)
    LIKE '%cancelled%' AS preserves_cancelled,
  pg_get_functiondef('public.payroll_unlock_month(date,text,text,text)'::regprocedure)
    LIKE '%payroll_assert_security_code%' AS requires_security_code,
  pg_get_functiondef('public.payroll_unlock_month(date,text,text,text)'::regprocedure)
    LIKE '%payroll_month_unlocked%' AS writes_audit,
  pg_get_functiondef('public.payroll_unlock_month(date,text,text,text)'::regprocedure)
    LIKE '%Unlock reason is required%' AS reason_required,
  pg_get_functiondef('public.payroll_unlock_month(date,text,text,text)'::regprocedure)
    NOT LIKE '%payroll_entries%' AS does_not_touch_entries;

-- 3) Finalize still applies pending schedules and now requires grant for non-admin
SELECT
  pg_get_functiondef('public.payroll_finalize_month(date,text)'::regprocedure)
    LIKE '%status = ''applied''%' AS finalize_applies_schedules,
  pg_get_functiondef('public.payroll_finalize_month(date,text)'::regprocedure)
    LIKE '%payroll_has_security_grant%' AS finalize_checks_grant;

-- 4) Security helpers exist
SELECT to_regprocedure('public.payroll_verify_security_code(text)') IS NOT NULL AS verify_exists,
       to_regprocedure('public.payroll_set_security_code(text)') IS NOT NULL AS set_code_exists,
       to_regprocedure('public.payroll_security_grant_status()') IS NOT NULL AS grant_status_exists,
       to_regprocedure('public.payroll_has_security_grant()') IS NOT NULL AS has_grant_exists,
       to_regprocedure('public.payroll_can_mutate_payroll()') IS NOT NULL AS can_mutate_exists;

-- 5) Verify checks modify permission before hash compare
SELECT
  pg_get_functiondef('public.payroll_verify_security_code(text)'::regprocedure)
    LIKE '%has_module_modify(''payroll'')%' AS verify_requires_modify,
  pg_get_functiondef('public.payroll_assert_security_code(text)'::regprocedure)
    LIKE '%Incorrect security code.%' AS generic_fail_text,
  pg_get_functiondef('public.payroll_assert_security_code(text)'::regprocedure)
    LIKE '%extensions.crypt%' AS uses_pgcrypto_crypt;

-- 6) Protected tables exist; hash table is not selectable by authenticated
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'payroll_security_settings'
) AS settings_table_exists,
EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'payroll_security_grants'
) AS grants_table_exists,
NOT has_table_privilege('authenticated', 'public.payroll_security_settings', 'SELECT') AS settings_not_selectable,
NOT has_table_privilege('authenticated', 'public.payroll_security_grants', 'SELECT') AS grants_not_selectable,
NOT has_table_privilege('authenticated', 'public.payroll_security_attempt_state', 'SELECT') AS attempts_not_selectable;

-- 7) payroll_months: no authenticated write policy (RPC-only status)
SELECT count(*) AS payroll_months_write_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_months'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');
-- Expect 0

SELECT count(*) AS payroll_months_select_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_months'
  AND cmd = 'SELECT';
-- Expect 1

-- 8) Non-admin payroll writes require grant helper
SELECT
  qual LIKE '%payroll_can_mutate_payroll%' AS attendance_uses_grant,
  with_check LIKE '%payroll_is_month_finalized%' AS attendance_month_gated
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_attendance'
  AND policyname = 'payroll_attendance_modify';

SELECT
  qual LIKE '%payroll_can_mutate_payroll%' AS entries_use_grant,
  with_check LIKE '%payroll_is_month_finalized%' AS entries_month_gated
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_entries'
  AND policyname = 'payroll_entries_modify';

SELECT
  qual LIKE '%payroll_can_mutate_payroll%' AS adjustments_use_grant,
  qual LIKE '%payroll_is_month_finalized%' AS adjustments_month_gated
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_adjustments'
  AND policyname = 'payroll_adjustments_modify';

SELECT qual LIKE '%payroll_can_mutate_payroll%' AS compensation_uses_grant
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_compensation'
  AND policyname = 'payroll_compensation_modify';

SELECT qual LIKE '%payroll_can_mutate_payroll%' AS advances_use_grant
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payroll_advances'
  AND policyname = 'payroll_advances_modify';
