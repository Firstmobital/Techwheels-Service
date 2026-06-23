-- Read-only verification checks for:
-- supabase/migrations/20260623183000_all_service_data_post_insert_history_sync_and_backfill.sql

-- 1) Trigger function exists and calls refresh by NEW.chassis_no.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  position('refresh_all_service_data_from_service_history(NEW.chassis_no)' in pg_get_functiondef(p.oid)) > 0 AS calls_refresh_on_new_chassis
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'trg_refresh_all_service_data_from_history_on_insert'
  AND pg_get_function_identity_arguments(p.oid) = '';

-- 2) Trigger binding exists on all_service_data for AFTER INSERT.
SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'all_service_data'
  AND t.tgisinternal = false
  AND t.tgname = 'trg_refresh_all_service_data_from_history_on_insert';

-- 3) Backfill coverage snapshot: how many all_service_data rows have matching history rows.
SELECT COUNT(*) AS target_rows_with_any_history
FROM public.all_service_data a
WHERE nullif(btrim(a.chassis_no), '') IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM public."EV_service_history_test" e
      WHERE upper(btrim(e.chassis_no)) = upper(btrim(a.chassis_no))
    )
    OR EXISTS (
      SELECT 1
      FROM public."PV_service_history_test" p
      WHERE upper(btrim(p.chassis_no)) = upper(btrim(a.chassis_no))
    )
  );

-- 4) Sample verification for the known late-created target case.
WITH chosen AS (
  SELECT
    h.id,
    h.sr_type,
    h.service_date_time,
    h.created_at,
    h.odometer_reading,
    h.registration_no
  FROM public."PV_service_history_test" h
  WHERE upper(btrim(h.chassis_no)) = 'MAT626242KKH53850'
  ORDER BY
    CASE WHEN lower(coalesce(h.sr_type, '')) LIKE '%service%' THEN 0 ELSE 1 END ASC,
    h.service_date_time DESC NULLS LAST,
    h.created_at DESC NULLS LAST,
    h.id DESC
  LIMIT 1
)
SELECT
  a.id AS target_id,
  a.chassis_no,
  a.last_service_type,
  a.last_service_date,
  a.last_service_km,
  a.updated_by_robot_at,
  c.id AS chosen_id,
  c.sr_type AS chosen_sr_type,
  c.service_date_time AS chosen_service_date_time,
  c.odometer_reading AS chosen_odometer,
  c.created_at AS chosen_created_at,
  (
    a.last_service_type IS NOT DISTINCT FROM c.sr_type
    AND a.last_service_date IS NOT DISTINCT FROM c.service_date_time
    AND a.last_service_km IS NOT DISTINCT FROM c.odometer_reading
  ) AS target_matches_chosen
FROM public.all_service_data a
CROSS JOIN chosen c
WHERE upper(btrim(a.chassis_no)) = 'MAT626242KKH53850';
