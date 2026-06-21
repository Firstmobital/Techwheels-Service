-- Plan: SUPABASE-002
-- Purpose: Pivot Condition B for all_service_data_dynamic from scheduled_next_service_date to assumed_next_service_date.
-- Scope: Predicate function + dynamic table rebuild under new predicate semantics.

BEGIN;

-- 1) Predicate pivot:
--    Condition A unchanged.
--    Condition B now evaluates assumed_next_service_date = current_date + 2.
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
    );
$$;

COMMENT ON FUNCTION public.is_all_service_dynamic_match(public.all_service_data)
IS 'Active include conditions: (1) chassis_no present and all non-technical columns are NULL OR (2) assumed_next_service_date = current_date + 2.';

-- 2) Rebuild dynamic table contents using new predicate.
-- NOTE: Keep current physical column-set unchanged in this migration.
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

COMMIT;
