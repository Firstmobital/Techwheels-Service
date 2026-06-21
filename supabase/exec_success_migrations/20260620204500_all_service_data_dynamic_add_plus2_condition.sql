-- Plan: SUPABASE-002
-- Purpose: Add second active inclusion condition for all_service_data_dynamic.
-- New condition: include rows where scheduled_next_service_date = current_date + 2.

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
      AND COALESCE(
        (
          CASE
            WHEN nullif(btrim(r.scheduled_next_service_date), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              THEN to_date(nullif(btrim(r.scheduled_next_service_date), ''), 'YYYY-MM-DD')
            WHEN nullif(btrim(r.scheduled_next_service_date), '') ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}$'
              THEN to_date(nullif(btrim(r.scheduled_next_service_date), ''), 'DD-MM-YYYY')
            WHEN nullif(btrim(r.scheduled_next_service_date), '') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
              THEN to_date(nullif(btrim(r.scheduled_next_service_date), ''), 'DD/MM/YYYY')
            ELSE NULL
          END
        ) = (current_date + 2),
        false
      )
    );
$$;

COMMENT ON FUNCTION public.is_all_service_dynamic_match(public.all_service_data)
IS 'Active include conditions: (1) chassis_no present and all non-technical columns are NULL OR (2) scheduled_next_service_date resolves to current_date + 2.';

-- Rebuild dynamic table so existing rows are re-evaluated under updated predicate.
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
