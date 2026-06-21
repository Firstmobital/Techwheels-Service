-- Plan: SUPABASE-002
-- Purpose: Add Condition C to all_service_data_dynamic inclusion logic.
-- Condition C: include rows where last_service_type is NULL/blank OR does not contain 'Service' text.

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
    );
$$;

COMMENT ON FUNCTION public.is_all_service_dynamic_match(public.all_service_data)
IS 'Active include conditions: (1) chassis_no present and all non-technical columns are NULL OR (2) assumed_next_service_date = current_date + 2 OR (3) last_service_type is NULL/blank or does not contain Service text.';

-- Rebuild dynamic table under updated predicate semantics.
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
  last_service_type,
  fuel_tp,
  sold_dealer
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
  a.last_service_type,
  CASE
    WHEN upper(COALESCE(a.product_line, '')) LIKE '%EV%' THEN 'EV'
    ELSE 'PV'
  END AS fuel_tp,
  a.sold_dealer
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);

COMMIT;
