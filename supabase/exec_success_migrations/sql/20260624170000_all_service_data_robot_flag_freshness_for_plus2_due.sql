-- Enforce robot-flag freshness when Condition B (assumed_next_service_date = current_date + 2)
-- is the active eligibility path.
-- Rule:
-- 1) If updated_by_robot = true but updated_by_robot_at is not today (IST), force updated_by_robot=false.
-- 2) Clear updated_by_robot_at at the same time for consistency with non-robot state.

CREATE OR REPLACE FUNCTION public.enforce_all_service_data_robot_flag_freshness_for_plus2_due()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NEW.chassis_no IS NOT NULL
     AND NEW.assumed_next_service_date = (current_date + 2)
     AND COALESCE(NEW.updated_by_robot, false) = true
     AND (
       NEW.updated_by_robot_at IS NULL
       OR ((NEW.updated_by_robot_at AT TIME ZONE 'Asia/Kolkata')::date <> v_today_ist)
     )
  THEN
    NEW.updated_by_robot := false;
    NEW.updated_by_robot_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_all_service_data_robot_flag_freshness_for_plus2_due()
IS 'Before-write guard: for +2 due rows, stale/non-today robot timestamp forces updated_by_robot=false and updated_by_robot_at=NULL.';

DROP TRIGGER IF EXISTS trg_enforce_all_service_data_robot_flag_freshness_for_plus2_due
ON public.all_service_data;

CREATE TRIGGER trg_enforce_all_service_data_robot_flag_freshness_for_plus2_due
BEFORE INSERT OR UPDATE OF assumed_next_service_date, updated_by_robot, updated_by_robot_at
ON public.all_service_data
FOR EACH ROW
EXECUTE FUNCTION public.enforce_all_service_data_robot_flag_freshness_for_plus2_due();

CREATE OR REPLACE FUNCTION public.reconcile_all_service_data_robot_flag_freshness_for_plus2_due()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  UPDATE public.all_service_data AS a
  SET
    updated_by_robot = false,
    updated_by_robot_at = NULL,
    last_updated_at = now()
  WHERE a.chassis_no IS NOT NULL
    AND a.assumed_next_service_date = (current_date + 2)
    AND COALESCE(a.updated_by_robot, false) = true
    AND (
      a.updated_by_robot_at IS NULL
      OR ((a.updated_by_robot_at AT TIME ZONE 'Asia/Kolkata')::date <> (now() AT TIME ZONE 'Asia/Kolkata')::date)
    );

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.reconcile_all_service_data_robot_flag_freshness_for_plus2_due()
IS 'Reconcile helper for +2 due rows: stale/non-today robot timestamp rows are normalized to updated_by_robot=false and updated_by_robot_at=NULL.';

-- Immediate reconcile so existing stale rows are corrected as part of migration apply.
SELECT public.reconcile_all_service_data_robot_flag_freshness_for_plus2_due();
