-- Long-term durability fix for all_service_data_dynamic:
-- 1) Backfill stale assumed columns in source rows.
-- 2) Add full reconcile function to re-evaluate time-relative predicate daily.
-- 3) Run one immediate reconcile.
-- 4) Schedule daily pg_cron reconcile job.

BEGIN;

-- One-time backfill for rows that missed trigger-time derivation (for example, legacy rows).
UPDATE public.all_service_data AS a
SET
  assumed_next_service_type = v.next_type,
  assumed_next_service_date = v.next_date
FROM (
  SELECT
    id,
    public.calc_all_service_assumed_next_service_type(last_service_type) AS next_type,
    public.calc_all_service_assumed_next_service_date(last_service_date, last_service_type, current_date) AS next_date
  FROM public.all_service_data
) AS v
WHERE v.id = a.id
  AND (
    a.assumed_next_service_type IS DISTINCT FROM v.next_type
    OR a.assumed_next_service_date IS DISTINCT FROM v.next_date
  );

CREATE OR REPLACE FUNCTION public.refresh_all_service_data_dynamic_full()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Upsert every row that currently matches the active predicate.
  INSERT INTO public.all_service_data_dynamic (
    id,
    chassis_no,
    vehicle_registration_number,
    model,
    product_line,
    scheduled_next_service_date,
    last_service_date,
    last_service_type,
    assumed_next_service_date,
    assumed_next_service_type,
    fuel_tp,
    sold_dealer,
    priority_bucket,
    priority_score,
    vehicle_sale_date,
    updated_by_robot,
    updated_by_robot_at
  )
  SELECT
    a.id,
    a.chassis_no,
    a.vehicle_registration_number,
    a.model,
    a.product_line,
    a.scheduled_next_service_date,
    a.last_service_date,
    a.last_service_type,
    a.assumed_next_service_date,
    a.assumed_next_service_type,
    CASE
      WHEN upper(COALESCE(a.product_line, '')) LIKE '%EV%' THEN 'EV'
      ELSE 'PV'
    END AS fuel_tp,
    a.sold_dealer,
    public.calc_all_service_dynamic_priority_bucket(a.sold_dealer) AS priority_bucket,
    public.calc_all_service_dynamic_priority_score(
      a.assumed_next_service_date,
      a.assumed_next_service_type,
      a.vehicle_sale_date::text
    ) AS priority_score,
    a.vehicle_sale_date,
    a.updated_by_robot,
    a.updated_by_robot_at
  FROM public.all_service_data AS a
  WHERE public.is_all_service_dynamic_match(a)
  ON CONFLICT (id) DO UPDATE
  SET
    chassis_no = EXCLUDED.chassis_no,
    vehicle_registration_number = EXCLUDED.vehicle_registration_number,
    model = EXCLUDED.model,
    product_line = EXCLUDED.product_line,
    scheduled_next_service_date = EXCLUDED.scheduled_next_service_date,
    last_service_date = EXCLUDED.last_service_date,
    last_service_type = EXCLUDED.last_service_type,
    assumed_next_service_date = EXCLUDED.assumed_next_service_date,
    assumed_next_service_type = EXCLUDED.assumed_next_service_type,
    fuel_tp = EXCLUDED.fuel_tp,
    sold_dealer = EXCLUDED.sold_dealer,
    priority_bucket = EXCLUDED.priority_bucket,
    priority_score = EXCLUDED.priority_score,
    vehicle_sale_date = EXCLUDED.vehicle_sale_date,
    updated_by_robot = EXCLUDED.updated_by_robot,
    updated_by_robot_at = EXCLUDED.updated_by_robot_at;

  -- Remove rows that are no longer eligible after date/predicate drift.
  DELETE FROM public.all_service_data_dynamic AS d
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.all_service_data AS a
    WHERE a.id = d.id
      AND public.is_all_service_dynamic_match(a)
  );
END;
$$;

COMMENT ON FUNCTION public.refresh_all_service_data_dynamic_full() IS
'Full reconciliation for all_service_data_dynamic. Re-evaluates active include predicate against all_service_data and repairs drift from time-dependent conditions.';

-- Run once immediately so current snapshot is repaired without waiting for cron.
SELECT public.refresh_all_service_data_dynamic_full();

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE jobname = 'all-service-data-dynamic-daily-reconcile';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'all-service-data-dynamic-daily-reconcile',
    '35 0 * * *',
    'SELECT public.refresh_all_service_data_dynamic_full();'
  );
END;
$$;

COMMIT;
