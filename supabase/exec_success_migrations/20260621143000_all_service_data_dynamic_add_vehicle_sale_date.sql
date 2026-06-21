-- Plan: SUPABASE-002 follow-up
-- Purpose: Include vehicle_sale_date from source all_service_data into all_service_data_dynamic.

BEGIN;

ALTER TABLE public.all_service_data_dynamic
  ADD COLUMN IF NOT EXISTS vehicle_sale_date text;

COMMENT ON COLUMN public.all_service_data_dynamic.vehicle_sale_date
IS 'Projected from public.all_service_data.vehicle_sale_date.';

-- Backfill existing dynamic rows from source by id.
UPDATE public.all_service_data_dynamic d
SET vehicle_sale_date = a.vehicle_sale_date
FROM public.all_service_data a
WHERE a.id = d.id
  AND d.vehicle_sale_date IS DISTINCT FROM a.vehicle_sale_date;

-- Keep realtime sync function aligned so future rows include vehicle_sale_date.
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
      public.calc_all_service_dynamic_priority_bucket(NEW.sold_dealer),
      public.calc_all_service_dynamic_priority_score(
        NEW.assumed_next_service_date,
        NEW.assumed_next_service_type
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_all_service_data_dynamic()
IS 'Maintains all_service_data_dynamic in realtime, including deterministic fuel_tp, sold_dealer, priority ordering fields, and source-projected vehicle_sale_date.';

COMMIT;
