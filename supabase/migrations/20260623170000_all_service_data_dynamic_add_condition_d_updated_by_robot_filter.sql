-- Adds Condition D to dynamic include predicate:
-- Include rows when updated_by_robot is NULL / FALSE / compatibility-blank.
-- Also runs an immediate reconcile so existing dynamic rows reflect the new predicate.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_all_service_dynamic_match(r public.all_service_data)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    (
      r.chassis_no IS NOT NULL
      AND COALESCE(
        (
          SELECT bool_and(e.value IS NULL)
          FROM jsonb_each(
            to_jsonb(r) - ARRAY['id','chassis_no','created_at','last_updated_at']
          ) AS e(key, value)
        ),
        true
      )
    )
    OR
    (
      r.chassis_no IS NOT NULL
      AND r.assumed_next_service_date = (current_date + 2)
    )
    OR
    (
      r.chassis_no IS NOT NULL
      AND (
        NULLIF(btrim(r.last_service_type), '') IS NULL
        OR btrim(r.last_service_type) !~* 'service'
      )
    )
    OR
    (
      r.chassis_no IS NOT NULL
      AND COALESCE(
        NULLIF(lower(btrim(r.updated_by_robot::text)), ''),
        'false'
      ) IN ('false', 'f')
    );
$$;

COMMENT ON FUNCTION public.is_all_service_dynamic_match(r public.all_service_data) IS
'Active include conditions: (1) chassis_no present and all non-technical columns are NULL OR (2) assumed_next_service_date = current_date + 2 OR (3) last_service_type is NULL/blank or does not contain Service text OR (4) updated_by_robot is NULL/blank/false.';

DO $$
BEGIN
  IF to_regprocedure('public.refresh_all_service_data_dynamic_full()') IS NOT NULL THEN
    PERFORM public.refresh_all_service_data_dynamic_full();
  ELSE
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

    DELETE FROM public.all_service_data_dynamic AS d
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.all_service_data AS a
      WHERE a.id = d.id
        AND public.is_all_service_dynamic_match(a)
    );
  END IF;
END;
$$;

COMMIT;
