-- Purpose:
-- Task 2.8 + 2.9
-- 1) Add robot-audit projection columns on public.all_service_data_dynamic.
-- 2) Backfill existing dynamic rows from public.all_service_data.
-- 3) Keep realtime sync projection aligned via public.sync_all_service_data_dynamic().

BEGIN;

ALTER TABLE public.all_service_data_dynamic
  ADD COLUMN IF NOT EXISTS updated_by_robot boolean,
  ADD COLUMN IF NOT EXISTS updated_by_robot_at timestamptz;

COMMENT ON COLUMN public.all_service_data_dynamic.updated_by_robot
IS 'Projected from public.all_service_data.updated_by_robot.';

COMMENT ON COLUMN public.all_service_data_dynamic.updated_by_robot_at
IS 'Projected from public.all_service_data.updated_by_robot_at.';

-- Backfill existing dynamic rows by source id.
UPDATE public.all_service_data_dynamic AS d
SET
  updated_by_robot = a.updated_by_robot,
  updated_by_robot_at = a.updated_by_robot_at
FROM public.all_service_data AS a
WHERE a.id = d.id
  AND (
    d.updated_by_robot IS DISTINCT FROM a.updated_by_robot
    OR d.updated_by_robot_at IS DISTINCT FROM a.updated_by_robot_at
  );

-- Re-project robot-audit fields on every insert/update path.
CREATE OR REPLACE FUNCTION public.sync_all_service_data_dynamic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.all_service_data_dynamic d
    WHERE d.id = OLD.id;
    RETURN OLD;
  END IF;

  DELETE FROM public.all_service_data_dynamic d
  WHERE d.id = NEW.id;

  IF public.is_all_service_dynamic_match(NEW) THEN
    INSERT INTO public.all_service_data_dynamic (
      id,
      chassis_no,
      vehicle_registration_number,
      model,
      product_line,
      vehicle_sale_date,
      scheduled_next_service_date,
      assumed_next_service_date,
      assumed_next_service_type,
      last_service_date,
      last_service_type,
      fuel_tp,
      sold_dealer,
      updated_by_robot,
      updated_by_robot_at,
      priority_bucket,
      priority_score
    )
    VALUES (
      NEW.id,
      NEW.chassis_no,
      NEW.vehicle_registration_number,
      NEW.model,
      NEW.product_line,
      NEW.vehicle_sale_date,
      NEW.scheduled_next_service_date,
      NEW.assumed_next_service_date,
      NEW.assumed_next_service_type,
      NEW.last_service_date,
      NEW.last_service_type,
      CASE
        WHEN upper(COALESCE(NEW.product_line, '')) LIKE '%EV%' THEN 'EV'
        ELSE 'PV'
      END,
      NEW.sold_dealer,
      NEW.updated_by_robot,
      NEW.updated_by_robot_at,
      public.calc_all_service_dynamic_priority_bucket(NEW.sold_dealer),
      public.calc_all_service_dynamic_priority_score(
        NEW.assumed_next_service_date,
        NEW.assumed_next_service_type,
        NEW.vehicle_sale_date
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
