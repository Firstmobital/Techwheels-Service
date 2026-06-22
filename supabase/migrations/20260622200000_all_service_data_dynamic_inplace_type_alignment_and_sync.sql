-- Purpose:
-- Step 2 alignment for public.all_service_data_dynamic after source-table in-place type correction.
--
-- 1) Correct dynamic date/time columns in-place (no new columns):
--    - vehicle_sale_date text -> date
--    - scheduled_next_service_date text -> date
--    - last_service_date text -> timestamptz
-- 2) Update sync function so all_service_data -> all_service_data_dynamic remains type-consistent.
--
-- Notes:
-- - Parsing is safe: unparseable legacy text converts to NULL.
-- - Trigger is recreated to ensure function/trigger contract is current.

BEGIN;

-- Pause sync trigger during alignment to avoid transient type drift during conversion.
DROP TRIGGER IF EXISTS trg_sync_all_service_data_dynamic
  ON public.all_service_data;

-- Reuse parser helpers from Phase 0. Recreate defensively for idempotent deploys.
CREATE OR REPLACE FUNCTION public.parse_date_text(p_text text)
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
  ELSIF v ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{4}$' THEN
    RETURN to_date(initcap(lower(v)), 'DD-Mon-YYYY');
  ELSIF v ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{2}$' THEN
    RETURN to_date(initcap(lower(v)), 'DD-Mon-YY');
  ELSIF v ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}$' THEN
    RETURN to_date(v, 'DD-MM-YYYY');
  ELSIF v ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN to_date(v, 'DD-MM-YY');
  ELSIF v ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' THEN
    RETURN to_date(v, 'YYYY/MM/DD');
  ELSIF v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN to_date(v, 'YYYY-MM-DD');
  ELSIF v ~ '^[0-9]{5}$' THEN
    RETURN (DATE '1899-12-30' + v::integer);
  ELSIF v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?$' THEN
    RETURN (v::timestamp)::date;
  END IF;

  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.parse_datetime_ist(p_text text)
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

DO $$
DECLARE
  v_vehicle_sale_date_type text;
  v_scheduled_next_service_date_type text;
  v_last_service_date_type text;
BEGIN
  SELECT c.data_type INTO v_vehicle_sale_date_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'all_service_data_dynamic'
    AND c.column_name = 'vehicle_sale_date';

  IF v_vehicle_sale_date_type IS DISTINCT FROM 'date' THEN
    EXECUTE $sql$
      ALTER TABLE public.all_service_data_dynamic
      ALTER COLUMN vehicle_sale_date TYPE date
      USING public.parse_date_text(vehicle_sale_date::text)
    $sql$;
  END IF;

  SELECT c.data_type INTO v_scheduled_next_service_date_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'all_service_data_dynamic'
    AND c.column_name = 'scheduled_next_service_date';

  IF v_scheduled_next_service_date_type IS DISTINCT FROM 'date' THEN
    EXECUTE $sql$
      ALTER TABLE public.all_service_data_dynamic
      ALTER COLUMN scheduled_next_service_date TYPE date
      USING public.parse_date_text(scheduled_next_service_date::text)
    $sql$;
  END IF;

  SELECT c.data_type INTO v_last_service_date_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'all_service_data_dynamic'
    AND c.column_name = 'last_service_date';

  IF v_last_service_date_type IS DISTINCT FROM 'timestamp with time zone' THEN
    EXECUTE $sql$
      ALTER TABLE public.all_service_data_dynamic
      ALTER COLUMN last_service_date TYPE timestamptz
      USING COALESCE(
        public.parse_datetime_ist(last_service_date::text),
        CASE
          WHEN public.parse_date_text(last_service_date::text) IS NOT NULL
          THEN make_timestamptz(
            EXTRACT(YEAR FROM public.parse_date_text(last_service_date::text))::int,
            EXTRACT(MONTH FROM public.parse_date_text(last_service_date::text))::int,
            EXTRACT(DAY FROM public.parse_date_text(last_service_date::text))::int,
            0, 0, 0, 'Asia/Kolkata'
          )
          ELSE NULL
        END
      )
    $sql$;
  END IF;
END $$;

-- Keep sync projection type-consistent with source all_service_data.
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
      last_service_type,
      assumed_next_service_date,
      assumed_next_service_type,
      fuel_tp,
      sold_dealer,
      priority_bucket,
      priority_score,
      vehicle_sale_date,
      updated_by_robot,
      updated_by_robot_at
    )
    VALUES (
      NEW.id,
      NEW.chassis_no,
      NEW.vehicle_registration_number,
      NEW.model,
      NEW.product_line,
      NEW.scheduled_next_service_date,
      NEW.last_service_date,
      NEW.last_service_type,
      NEW.assumed_next_service_date,
      NEW.assumed_next_service_type,
      CASE
        WHEN upper(COALESCE(NEW.product_line, '')) LIKE '%EV%' THEN 'EV'
        ELSE 'PV'
      END,
      NEW.sold_dealer,
      public.calc_all_service_dynamic_priority_bucket(NEW.sold_dealer),
      public.calc_all_service_dynamic_priority_score(
        NEW.assumed_next_service_date,
        NEW.assumed_next_service_type,
        NEW.vehicle_sale_date::text
      ),
      NEW.vehicle_sale_date,
      NEW.updated_by_robot,
      NEW.updated_by_robot_at
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_all_service_data_dynamic
AFTER INSERT OR UPDATE OR DELETE
ON public.all_service_data
FOR EACH ROW
EXECUTE FUNCTION public.sync_all_service_data_dynamic();

COMMENT ON COLUMN public.all_service_data_dynamic.vehicle_sale_date IS 'Type aligned in-place to date to match source all_service_data.vehicle_sale_date.';
COMMENT ON COLUMN public.all_service_data_dynamic.scheduled_next_service_date IS 'Type aligned in-place to date to match source all_service_data.scheduled_next_service_date.';
COMMENT ON COLUMN public.all_service_data_dynamic.last_service_date IS 'Type aligned in-place to timestamptz to match source all_service_data.last_service_date.';

COMMIT;
