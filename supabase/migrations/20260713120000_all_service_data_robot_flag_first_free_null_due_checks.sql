-- Read-only verification for:
-- 20260713120000_all_service_data_robot_flag_first_free_null_due.sql

-- 1) Trigger should include assumed_next_service_type in its UPDATE OF column list.
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

-- 2) Existing rule should have no stale robot-true +2 due rows after reconcile.
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

-- 3) New rule should have no stale robot-true First Free Service/no-date rows after reconcile.
SELECT
  COUNT(*) AS stale_robot_true_first_free_null_due_rows
FROM public.all_service_data a
WHERE a.chassis_no IS NOT NULL
  AND a.assumed_next_service_date IS NULL
  AND lower(btrim(COALESCE(a.assumed_next_service_type, ''))) = 'first free service'
  AND COALESCE(a.updated_by_robot, false) = true
  AND (
    a.updated_by_robot_at IS NULL
    OR ((a.updated_by_robot_at AT TIME ZONE 'Asia/Kolkata')::date <> (now() AT TIME ZONE 'Asia/Kolkata')::date)
  );

-- 4) Preview the rows currently matching the new rule envelope and reset state.
SELECT
  COUNT(*) FILTER (WHERE COALESCE(a.updated_by_robot, false) = false) AS first_free_null_due_robot_false_rows,
  COUNT(*) FILTER (WHERE COALESCE(a.updated_by_robot, false) = true) AS first_free_null_due_robot_true_today_rows
FROM public.all_service_data a
WHERE a.chassis_no IS NOT NULL
  AND a.assumed_next_service_date IS NULL
  AND lower(btrim(COALESCE(a.assumed_next_service_type, ''))) = 'first free service';

