-- Plan: SUPABASE-002
-- Purpose: Add deterministic priority ordering layer for third-party top-N reads.
-- Order contract:
--   1) sold_dealer: Techwheels first, Others second, NULL/other last
--   2) assumed_next_service_date: ascending, NULL last
--   3) assumed_next_service_type rank:
--      First Free Service, Second Free Service, Third Free Service,
--      Paid Service, Unknown, NULL/blank, others
--   4) id ascending final tie-breaker (query-level order)

BEGIN;

ALTER TABLE public.all_service_data_dynamic
  ADD COLUMN IF NOT EXISTS priority_bucket integer,
  ADD COLUMN IF NOT EXISTS priority_score integer;

COMMENT ON COLUMN public.all_service_data_dynamic.priority_bucket
IS 'Priority bucket: 1=Techwheels, 2=Others, 3=NULL/other. Lower value = higher priority.';

COMMENT ON COLUMN public.all_service_data_dynamic.priority_score
IS 'Priority score inside bucket. Higher value = higher rank; encodes assumed_next_service_date (NULL last) then assumed_next_service_type rank.';

CREATE OR REPLACE FUNCTION public.calc_all_service_dynamic_priority_bucket(
  p_sold_dealer text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(btrim(COALESCE(p_sold_dealer, ''))) = 'techwheels' THEN 1
    WHEN lower(btrim(COALESCE(p_sold_dealer, ''))) = 'others' THEN 2
    ELSE 3
  END;
$$;

COMMENT ON FUNCTION public.calc_all_service_dynamic_priority_bucket(text)
IS 'Priority bucket mapping: Techwheels=1, Others=2, NULL/other=3.';

CREATE OR REPLACE FUNCTION public.calc_all_service_dynamic_priority_score(
  p_assumed_next_service_date date,
  p_assumed_next_service_type text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  WITH parts AS (
    SELECT
      CASE
        WHEN p_assumed_next_service_date IS NULL THEN -1000000
        ELSE (100000 - (p_assumed_next_service_date - DATE '2000-01-01'))
      END AS date_component,
      CASE
        WHEN lower(btrim(COALESCE(p_assumed_next_service_type, ''))) = 'first free service' THEN 99
        WHEN lower(btrim(COALESCE(p_assumed_next_service_type, ''))) = 'second free service' THEN 98
        WHEN lower(btrim(COALESCE(p_assumed_next_service_type, ''))) = 'third free service' THEN 97
        WHEN lower(btrim(COALESCE(p_assumed_next_service_type, ''))) = 'paid service' THEN 96
        WHEN lower(btrim(COALESCE(p_assumed_next_service_type, ''))) = 'unknown' THEN 95
        WHEN NULLIF(btrim(COALESCE(p_assumed_next_service_type, '')), '') IS NULL THEN 94
        ELSE 93
      END AS type_component
  )
  SELECT (date_component * 100) + type_component
  FROM parts;
$$;

COMMENT ON FUNCTION public.calc_all_service_dynamic_priority_score(date, text)
IS 'Higher score = higher priority inside bucket. Encodes date asc (NULL last) then assumed_next_service_type rank: First, Second, Third, Paid, Unknown, NULL/blank, others.';

-- Backfill existing dynamic rows with deterministic priority fields.
UPDATE public.all_service_data_dynamic d
SET
  priority_bucket = public.calc_all_service_dynamic_priority_bucket(d.sold_dealer),
  priority_score = public.calc_all_service_dynamic_priority_score(
    d.assumed_next_service_date,
    d.assumed_next_service_type
  )
WHERE
  d.priority_bucket IS DISTINCT FROM public.calc_all_service_dynamic_priority_bucket(d.sold_dealer)
  OR d.priority_score IS DISTINCT FROM public.calc_all_service_dynamic_priority_score(
    d.assumed_next_service_date,
    d.assumed_next_service_type
  );

CREATE INDEX IF NOT EXISTS all_service_data_dynamic_priority_idx
  ON public.all_service_data_dynamic (priority_bucket ASC, priority_score DESC, id ASC);

-- Keep realtime sync aligned so every write maintains deterministic priority.
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
IS 'Maintains all_service_data_dynamic in realtime, including deterministic fuel_tp, sold_dealer, and priority ordering fields (priority_bucket/priority_score).';

COMMIT;
