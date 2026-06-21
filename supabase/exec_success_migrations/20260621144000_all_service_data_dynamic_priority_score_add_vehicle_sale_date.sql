-- Plan: SUPABASE-002
-- Purpose: Extend dynamic priority scoring to include vehicle_sale_date as tertiary score component.
-- Rule inside each bucket:
--   1) assumed_next_service_date ASC (NULL last)
--   2) assumed_next_service_type rank
--   3) vehicle_sale_date DESC (new to old, NULL/unparseable last)

BEGIN;

-- V2 scorer with tertiary vehicle_sale_date component.
CREATE OR REPLACE FUNCTION public.calc_all_service_dynamic_priority_score(
  p_assumed_next_service_date date,
  p_assumed_next_service_type text,
  p_vehicle_sale_date_text text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  WITH parsed AS (
    SELECT public.parse_all_service_date_text(p_vehicle_sale_date_text) AS vehicle_sale_dt
  ), parts AS (
    SELECT
      -- Higher component = earlier assumed_next_service_date; NULL dates are lowest.
      CASE
        WHEN p_assumed_next_service_date IS NULL THEN 0
        ELSE GREATEST(1, 36500 - LEAST(36499, (p_assumed_next_service_date - DATE '2000-01-01')))
      END AS assumed_date_component,
      CASE
        WHEN lower(btrim(COALESCE(p_assumed_next_service_type, ''))) = 'first free service' THEN 99
        WHEN lower(btrim(COALESCE(p_assumed_next_service_type, ''))) = 'second free service' THEN 98
        WHEN lower(btrim(COALESCE(p_assumed_next_service_type, ''))) = 'third free service' THEN 97
        WHEN lower(btrim(COALESCE(p_assumed_next_service_type, ''))) = 'paid service' THEN 96
        WHEN lower(btrim(COALESCE(p_assumed_next_service_type, ''))) = 'unknown' THEN 95
        WHEN NULLIF(btrim(COALESCE(p_assumed_next_service_type, '')), '') IS NULL THEN 94
        ELSE 93
      END AS type_component,
      -- Newer vehicle_sale_date gets higher component; NULL/unparseable is lowest.
      CASE
        WHEN p.vehicle_sale_dt IS NULL THEN 0
        ELSE LEAST(99, GREATEST(1, ((p.vehicle_sale_dt - DATE '2000-01-01') / 365) + 1))
      END AS vehicle_sale_component
    FROM parsed p
  )
  SELECT
    (assumed_date_component * 10000)
    + (type_component * 100)
    + vehicle_sale_component
  FROM parts;
$$;

-- Keep backward compatibility for existing callers that still use 2 args.
CREATE OR REPLACE FUNCTION public.calc_all_service_dynamic_priority_score(
  p_assumed_next_service_date date,
  p_assumed_next_service_type text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.calc_all_service_dynamic_priority_score(
    p_assumed_next_service_date,
    p_assumed_next_service_type,
    NULL
  );
$$;

COMMENT ON FUNCTION public.calc_all_service_dynamic_priority_score(date, text, text)
IS 'Higher score = higher priority inside bucket. Encodes assumed_next_service_date asc (NULL last), then assumed_next_service_type rank, then vehicle_sale_date desc (new to old; NULL/unparseable last).';

COMMENT ON FUNCTION public.calc_all_service_dynamic_priority_score(date, text)
IS 'Compatibility wrapper that routes to the 3-arg scorer with NULL vehicle_sale_date.';

-- Recompute existing dynamic rows under V2 scoring.
UPDATE public.all_service_data_dynamic d
SET priority_score = public.calc_all_service_dynamic_priority_score(
  d.assumed_next_service_date,
  d.assumed_next_service_type,
  d.vehicle_sale_date
)
WHERE d.priority_score IS DISTINCT FROM public.calc_all_service_dynamic_priority_score(
  d.assumed_next_service_date,
  d.assumed_next_service_type,
  d.vehicle_sale_date
);

-- Keep realtime sync aligned with V2 scoring.
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
        NEW.assumed_next_service_type,
        NEW.vehicle_sale_date
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_all_service_data_dynamic()
IS 'Maintains all_service_data_dynamic in realtime, including deterministic fuel_tp, sold_dealer, priority ordering fields (with vehicle_sale_date tertiary scoring), and source-projected vehicle_sale_date.';

COMMIT;
