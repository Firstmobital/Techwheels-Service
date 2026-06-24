-- Read-only verification checks for:
-- supabase/migrations/20260624170000_all_service_data_robot_flag_freshness_for_plus2_due.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; final validation should be based on full-run output.

-- 1) Trigger function and reconcile helper exist.
SELECT
  p.oid::regprocedure::text AS function_signature,
  n.nspname AS schema_name,
  p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'enforce_all_service_data_robot_flag_freshness_for_plus2_due',
    'reconcile_all_service_data_robot_flag_freshness_for_plus2_due'
  )
ORDER BY p.proname;

-- 2) BEFORE trigger exists on all_service_data and points to expected function.
SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_def,
  p.proname AS target_function
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND c.relname = 'all_service_data'
  AND t.tgisinternal = false
  AND t.tgname = 'trg_enforce_all_service_data_robot_flag_freshness_for_plus2_due';

-- 3) Must be zero after migration reconcile and future writes:
-- rows that are +2 due with stale robot timestamp while still marked updated_by_robot=true.
SELECT
  COUNT(*) AS stale_robot_true_plus2_rows
FROM public.all_service_data a
WHERE a.chassis_no IS NOT NULL
  AND a.assumed_next_service_date = (current_date + 2)
  AND COALESCE(a.updated_by_robot, false) = true
  AND (
    a.updated_by_robot_at IS NULL
    OR ((a.updated_by_robot_at AT TIME ZONE 'Asia/Kolkata')::date <> (now() AT TIME ZONE 'Asia/Kolkata')::date)
  );

-- 4) Dynamic-table parity spot-check for this rule population.
-- expected_false_count = rows in source meeting rule envelope and currently false/null.
-- actual_false_count = corresponding rows in dynamic table with false/null.
SELECT
  (
    SELECT COUNT(*)
    FROM public.all_service_data a
    WHERE a.chassis_no IS NOT NULL
      AND a.assumed_next_service_date = (current_date + 2)
      AND COALESCE(a.updated_by_robot, false) = false
  ) AS expected_false_count,
  (
    SELECT COUNT(*)
    FROM public.all_service_data_dynamic d
    WHERE d.chassis_no IS NOT NULL
      AND d.assumed_next_service_date = (current_date + 2)
      AND COALESCE(d.updated_by_robot, false) = false
  ) AS actual_false_count;
