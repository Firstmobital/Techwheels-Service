-- Plan: SUPABASE-002
-- Purpose: Make tertiary vehicle_sale_date ordering exact (day-level) inside priority_score.
-- Notes:
--   - Upgrades priority_score to bigint to preserve room for day-level encoding.
--   - Keeps existing bucket behavior unchanged.

BEGIN;

-- 1) Expand score capacity for exact tertiary ordering.
ALTER TABLE public.all_service_data_dynamic
  ALTER COLUMN priority_score TYPE bigint
  USING priority_score::bigint;

-- PostgreSQL does not allow CREATE OR REPLACE when only return type changes.
-- Drop both overloads first, then recreate with bigint in this same transaction.
DROP FUNCTION IF EXISTS public.calc_all_service_dynamic_priority_score(date, text, text);
DROP FUNCTION IF EXISTS public.calc_all_service_dynamic_priority_score(date, text);

-- 2) Replace scorer with exact day-level vehicle_sale_date component.
CREATE OR REPLACE FUNCTION public.calc_all_service_dynamic_priority_score(
  p_assumed_next_service_date date,
  p_assumed_next_service_type text,
  p_vehicle_sale_date_text text
)
RETURNS bigint
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
        ELSE LEAST(99999, GREATEST(1, (p.vehicle_sale_dt - DATE '2000-01-01') + 1))
      END AS vehicle_sale_component
    FROM parsed p
  )
  SELECT
    (assumed_date_component::bigint * 10000000)
    + (type_component::bigint * 100000)
    + vehicle_sale_component::bigint
  FROM parts;
$$;

-- 3) Keep backward compatibility for existing 2-arg callers.
CREATE OR REPLACE FUNCTION public.calc_all_service_dynamic_priority_score(
  p_assumed_next_service_date date,
  p_assumed_next_service_type text
)
RETURNS bigint
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
IS 'Higher score = higher priority inside bucket. Encodes assumed_next_service_date asc (NULL last), then assumed_next_service_type rank, then exact vehicle_sale_date desc (new to old; NULL/unparseable last).';

COMMENT ON FUNCTION public.calc_all_service_dynamic_priority_score(date, text)
IS 'Compatibility wrapper that routes to the 3-arg scorer with NULL vehicle_sale_date.';

-- 4) Recompute dynamic rows under V3 scoring.
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

-- 5) Ensure realtime sync uses the same V3 scorer signature.
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
IS 'Maintains all_service_data_dynamic in realtime, including deterministic fuel_tp, sold_dealer, priority ordering fields (exact vehicle_sale_date tertiary scoring), and source-projected vehicle_sale_date.';

COMMIT;
