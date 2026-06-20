-- Plan: SUPABASE-002
-- Purpose: Keep only required columns in public.all_service_data_dynamic
-- Requested columns:
--   id, chassis_no, vehicle_registration_number, model, product_line,
--   scheduled_next_service_date, last_service_date, last_service_type

BEGIN;

-- 1) Prune dynamic table to requested columns only.
ALTER TABLE public.all_service_data_dynamic
  DROP COLUMN IF EXISTS first_name,
  DROP COLUMN IF EXISTS last_name,
  DROP COLUMN IF EXISTS contact_phones,
  DROP COLUMN IF EXISTS vehicle_sale_date,
  DROP COLUMN IF EXISTS vehicle_age_in_years,
  DROP COLUMN IF EXISTS scheduled_next_service_kms,
  DROP COLUMN IF EXISTS last_service_customer_mobile_no,
  DROP COLUMN IF EXISTS last_service_dealer,
  DROP COLUMN IF EXISTS last_service_km,
  DROP COLUMN IF EXISTS extended_warranty_dealer,
  DROP COLUMN IF EXISTS extended_warranty_policy_no,
  DROP COLUMN IF EXISTS extended_warranty_product,
  DROP COLUMN IF EXISTS extended_warranty_service_product_period,
  DROP COLUMN IF EXISTS extended_warranty_order_no,
  DROP COLUMN IF EXISTS extended_warranty_order_status,
  DROP COLUMN IF EXISTS extended_warranty_start_date,
  DROP COLUMN IF EXISTS extended_warranty_end_date,
  DROP COLUMN IF EXISTS extended_warranty_end_kms,
  DROP COLUMN IF EXISTS extended_warranty_final_price_without_tax,
  DROP COLUMN IF EXISTS extended_warranty_final_price,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS last_updated_at,
  DROP COLUMN IF EXISTS ex_showroom_price,
  DROP COLUMN IF EXISTS idv,
  DROP COLUMN IF EXISTS last_insurance_expiry_date,
  DROP COLUMN IF EXISTS last_insurance_comapny,
  DROP COLUMN IF EXISTS last_insurance_policy_number;

-- 2) Rebuild current data with only requested columns.
TRUNCATE TABLE public.all_service_data_dynamic;

INSERT INTO public.all_service_data_dynamic (
  id,
  chassis_no,
  vehicle_registration_number,
  model,
  product_line,
  scheduled_next_service_date,
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
  a.last_service_date,
  a.last_service_type
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);

-- 3) Update trigger function so realtime sync writes only kept columns.
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
      NEW.last_service_date,
      NEW.last_service_type
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_all_service_data_dynamic()
IS 'Maintains all_service_data_dynamic realtime with a pruned column set requested by SUPABASE-002.';

COMMIT;
