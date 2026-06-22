-- Purpose:
-- Long-term canonical date/time foundation for public.all_service_data.
--
-- This migration adds typed canonical columns and backfills them from legacy text fields.
-- Canonical choices:
-- - last_service_at timestamptz (IST wall-clock interpreted for source date-time text)
-- - scheduled_next_service_on date
-- - vehicle_sale_on date
--
-- It also extends public.all_service_data_dynamic with matching canonical typed columns
-- and updates public.sync_all_service_data_dynamic() projection.
--
-- Legacy text columns are retained for compatibility.

BEGIN;

CREATE OR REPLACE FUNCTION public.parse_legacy_date_text(p_text text)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
BEGIN
  v := nullif(btrim(coalesce(p_text, '')), '');

  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  IF v ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN
    RETURN to_date(v, 'DD/MM/YYYY');
  ELSIF v ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$' THEN
    RETURN to_date(v, 'DD/MM/YY');
  ELSIF v ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' THEN
    RETURN to_date(v, 'YYYY/MM/DD');
  ELSIF v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN to_date(v, 'YYYY-MM-DD');
  END IF;

  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.parse_service_history_datetime_ist(p_text text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
  m text[];
  dd integer;
  mm integer;
  yy integer;
  hh integer;
  mi integer;
  ampm text;
  hh24 integer;
BEGIN
  v := nullif(upper(btrim(coalesce(p_text, ''))), '');

  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  m := regexp_match(v, '^([0-9]{2})/([0-9]{2})/([0-9]{4})\s+([0-9]{1,2}):([0-9]{2})\s*(AM|PM)$');

  IF m IS NULL THEN
    RETURN NULL;
  END IF;

  dd := m[1]::integer;
  mm := m[2]::integer;
  yy := m[3]::integer;
  hh := m[4]::integer;
  mi := m[5]::integer;
  ampm := m[6];

  IF hh < 1 OR hh > 12 OR mi < 0 OR mi > 59 THEN
    RETURN NULL;
  END IF;

  IF ampm = 'AM' THEN
    hh24 := CASE WHEN hh = 12 THEN 0 ELSE hh END;
  ELSE
    hh24 := CASE WHEN hh = 12 THEN 12 ELSE hh + 12 END;
  END IF;

  RETURN make_timestamptz(yy, mm, dd, hh24, mi, 0, 'Asia/Kolkata');
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

ALTER TABLE public.all_service_data
  ADD COLUMN IF NOT EXISTS last_service_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_next_service_on date,
  ADD COLUMN IF NOT EXISTS vehicle_sale_on date;

ALTER TABLE public.all_service_data_dynamic
  ADD COLUMN IF NOT EXISTS last_service_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_next_service_on date,
  ADD COLUMN IF NOT EXISTS vehicle_sale_on date;

WITH parsed AS (
  SELECT
    t.id,
    public.parse_legacy_date_text(t.scheduled_next_service_date) AS parsed_scheduled_next_service_on,
    public.parse_legacy_date_text(t.vehicle_sale_date) AS parsed_vehicle_sale_on,
    public.parse_legacy_date_text(t.last_service_date) AS parsed_last_service_on,
    public.parse_service_history_datetime_ist(t.last_service_date) AS parsed_last_service_at_ist
  FROM public.all_service_data t
),
resolved AS (
  SELECT
    p.id,
    p.parsed_scheduled_next_service_on,
    p.parsed_vehicle_sale_on,
    COALESCE(
      p.parsed_last_service_at_ist,
      CASE
        WHEN p.parsed_last_service_on IS NOT NULL THEN make_timestamptz(
          EXTRACT(YEAR FROM p.parsed_last_service_on)::integer,
          EXTRACT(MONTH FROM p.parsed_last_service_on)::integer,
          EXTRACT(DAY FROM p.parsed_last_service_on)::integer,
          0,
          0,
          0,
          'Asia/Kolkata'
        )
        ELSE NULL
      END
    ) AS resolved_last_service_at
  FROM parsed p
)
UPDATE public.all_service_data t
SET
  scheduled_next_service_on = r.parsed_scheduled_next_service_on,
  vehicle_sale_on = r.parsed_vehicle_sale_on,
  last_service_at = r.resolved_last_service_at
FROM resolved r
WHERE t.id = r.id
  AND (
    t.scheduled_next_service_on IS DISTINCT FROM r.parsed_scheduled_next_service_on
    OR t.vehicle_sale_on IS DISTINCT FROM r.parsed_vehicle_sale_on
    OR t.last_service_at IS DISTINCT FROM r.resolved_last_service_at
  );

CREATE INDEX IF NOT EXISTS idx_all_service_data_last_service_at
  ON public.all_service_data (last_service_at);

CREATE INDEX IF NOT EXISTS idx_all_service_data_scheduled_next_service_on
  ON public.all_service_data (scheduled_next_service_on);

CREATE INDEX IF NOT EXISTS idx_all_service_data_vehicle_sale_on
  ON public.all_service_data (vehicle_sale_on);

CREATE INDEX IF NOT EXISTS idx_all_service_data_dynamic_last_service_at
  ON public.all_service_data_dynamic (last_service_at);

CREATE INDEX IF NOT EXISTS idx_all_service_data_dynamic_scheduled_next_service_on
  ON public.all_service_data_dynamic (scheduled_next_service_on);

CREATE INDEX IF NOT EXISTS idx_all_service_data_dynamic_vehicle_sale_on
  ON public.all_service_data_dynamic (vehicle_sale_on);

UPDATE public.all_service_data_dynamic d
SET
  last_service_at = s.last_service_at,
  scheduled_next_service_on = s.scheduled_next_service_on,
  vehicle_sale_on = s.vehicle_sale_on
FROM public.all_service_data s
WHERE s.id = d.id
  AND (
    d.last_service_at IS DISTINCT FROM s.last_service_at
    OR d.scheduled_next_service_on IS DISTINCT FROM s.scheduled_next_service_on
    OR d.vehicle_sale_on IS DISTINCT FROM s.vehicle_sale_on
  );

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
      vehicle_sale_on,
      scheduled_next_service_date,
      scheduled_next_service_on,
      assumed_next_service_date,
      assumed_next_service_type,
      last_service_date,
      last_service_at,
      last_service_type,
      fuel_tp,
      sold_dealer,
      updated_by_robot,
      updated_by_robot_at,
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
      NEW.vehicle_sale_on,
      NEW.scheduled_next_service_date,
      NEW.scheduled_next_service_on,
      NEW.assumed_next_service_date,
      NEW.assumed_next_service_type,
      NEW.last_service_date,
      NEW.last_service_at,
      NEW.last_service_type,
      CASE
        WHEN upper(COALESCE(NEW.product_line, '')) LIKE '%EV%' THEN 'EV'
        ELSE 'PV'
      END,
      NEW.sold_dealer,
      NEW.updated_by_robot,
      NEW.updated_by_robot_at,
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

COMMIT;
