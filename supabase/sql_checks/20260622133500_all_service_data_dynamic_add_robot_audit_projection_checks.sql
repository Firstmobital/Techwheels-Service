-- Read-only verification checks for:
-- supabase/migrations/20260622133500_all_service_data_dynamic_add_robot_audit_projection.sql

-- 1) Confirm dynamic table has robot-audit projection columns.
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'all_service_data_dynamic'
  AND column_name IN ('updated_by_robot', 'updated_by_robot_at')
ORDER BY column_name;

-- 2) Confirm sync function projects robot-audit fields.
SELECT
  position('updated_by_robot' in pg_get_functiondef('public.sync_all_service_data_dynamic()'::regprocedure)) > 0 AS has_updated_by_robot_projection,
  position('updated_by_robot_at' in pg_get_functiondef('public.sync_all_service_data_dynamic()'::regprocedure)) > 0 AS has_updated_by_robot_at_projection;

-- 3) Verify backfill parity between dynamic and source by id.
SELECT
  count(*) AS robot_projection_mismatch_rows
FROM public.all_service_data_dynamic d
JOIN public.all_service_data a
  ON a.id = d.id
WHERE d.updated_by_robot IS DISTINCT FROM a.updated_by_robot
   OR d.updated_by_robot_at IS DISTINCT FROM a.updated_by_robot_at;

-- 4) Quick sample for manual spot-check.
SELECT
  d.id,
  d.chassis_no,
  d.updated_by_robot AS dynamic_updated_by_robot,
  a.updated_by_robot AS source_updated_by_robot,
  d.updated_by_robot_at AS dynamic_updated_by_robot_at,
  a.updated_by_robot_at AS source_updated_by_robot_at
FROM public.all_service_data_dynamic d
JOIN public.all_service_data a
  ON a.id = d.id
ORDER BY d.id DESC
LIMIT 50;
