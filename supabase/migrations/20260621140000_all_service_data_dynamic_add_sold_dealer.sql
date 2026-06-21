-- Plan: SUPABASE-002 follow-up
-- Purpose: Add sold_dealer to all_service_data_dynamic and keep realtime sync aligned with source all_service_data.

BEGIN;

-- 1) Add source-projected column on dynamic table.
ALTER TABLE public.all_service_data_dynamic
  ADD COLUMN IF NOT EXISTS sold_dealer text;

COMMENT ON COLUMN public.all_service_data_dynamic.sold_dealer
IS 'Projected from public.all_service_data.sold_dealer.';

-- 2) Backfill existing dynamic rows from source table by id.
UPDATE public.all_service_data_dynamic d
SET sold_dealer = a.sold_dealer
FROM public.all_service_data a
WHERE a.id = d.id
  AND d.sold_dealer IS DISTINCT FROM a.sold_dealer;

-- 3) Keep realtime sync function aligned so future rows include sold_dealer.
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
      last_service_type,
      fuel_tp,
      sold_dealer
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
      NEW.last_service_type,
      CASE
        WHEN upper(COALESCE(NEW.product_line, '')) LIKE '%EV%' THEN 'EV'
        ELSE 'PV'
      END,
      NEW.sold_dealer
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_all_service_data_dynamic()
IS 'Maintains all_service_data_dynamic in realtime, including deterministic fuel_tp and source-projected sold_dealer.';

COMMIT;
