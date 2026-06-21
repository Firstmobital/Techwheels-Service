-- Plan: SUPABASE-002
-- Purpose: Add deterministic fuel_tp to all_service_data_dynamic.
-- Rule: fuel_tp = 'EV' if product_line contains 'EV' (case-insensitive), else 'PV'.

BEGIN;

-- 1) Add new derived column on dynamic table.
ALTER TABLE public.all_service_data_dynamic
  ADD COLUMN IF NOT EXISTS fuel_tp text;

-- Optional guardrail for allowed values.
ALTER TABLE public.all_service_data_dynamic
  DROP CONSTRAINT IF EXISTS all_service_data_dynamic_fuel_tp_chk;

ALTER TABLE public.all_service_data_dynamic
  ADD CONSTRAINT all_service_data_dynamic_fuel_tp_chk
  CHECK (fuel_tp IN ('EV', 'PV'));

COMMENT ON COLUMN public.all_service_data_dynamic.fuel_tp
IS 'Deterministic from product_line: EV if product_line contains EV (case-insensitive), else PV.';

-- 2) Backfill existing rows.
UPDATE public.all_service_data_dynamic d
SET fuel_tp = CASE
  WHEN upper(COALESCE(d.product_line, '')) LIKE '%EV%' THEN 'EV'
  ELSE 'PV'
END
WHERE d.fuel_tp IS DISTINCT FROM CASE
  WHEN upper(COALESCE(d.product_line, '')) LIKE '%EV%' THEN 'EV'
  ELSE 'PV'
END;

-- 3) Keep realtime sync function aligned so future rows always populate fuel_tp.
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
      fuel_tp
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
      END
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_all_service_data_dynamic()
IS 'Maintains all_service_data_dynamic in realtime, including deterministic fuel_tp (EV if product_line contains EV, else PV).';

COMMIT;
