-- Plan: SUPABASE-002
-- Purpose: Refresh pruned all_service_data_dynamic column set to include assumed_next_service_date and assumed_next_service_type.
-- Scope: physical table shape + rebuild + realtime sync function column list.

BEGIN;

-- 1) Ensure the two newly required columns exist on the dynamic table.
ALTER TABLE public.all_service_data_dynamic
  ADD COLUMN IF NOT EXISTS assumed_next_service_date date,
  ADD COLUMN IF NOT EXISTS assumed_next_service_type text;

-- 2) Rebuild dynamic contents with refreshed pruned projection.
TRUNCATE TABLE public.all_service_data_dynamic;

INSERT INTO public.all_service_data_dynamic (
  id,
  chassis_no,
  vehicle_registration_number,
  model,
  product_line,
  scheduled_next_service_date,
  assumed_next_service_date,
  assumed_next_service_type,
  last_service_date,
  last_service_type
)
SELECT
  a.id,
  a.chassis_no,
  a.vehicle_registration_number,
  a.model,
  a.product_line,
  a.scheduled_next_service_date,
  a.assumed_next_service_date,
  a.assumed_next_service_type,
  a.last_service_date,
  a.last_service_type
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);

-- 3) Keep realtime sync aligned with refreshed pruned projection.
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
      scheduled_next_service_date,
      assumed_next_service_date,
      assumed_next_service_type,
      last_service_date,
      last_service_type
    )
    VALUES (
      NEW.id,
      NEW.chassis_no,
      NEW.vehicle_registration_number,
      NEW.model,
      NEW.product_line,
      NEW.scheduled_next_service_date,
      NEW.assumed_next_service_date,
      NEW.assumed_next_service_type,
      NEW.last_service_date,
      NEW.last_service_type
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_all_service_data_dynamic()
IS 'Maintains all_service_data_dynamic in realtime with pruned projection including assumed_next_service_date and assumed_next_service_type.';

COMMIT;
