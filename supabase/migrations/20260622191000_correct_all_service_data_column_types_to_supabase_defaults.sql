-- Purpose:
-- Correct all_service_data column types to match Supabase best practices.
-- All date-only fields → type date (no time, no timezone)
-- All date+time fields → type timestamptz (UTC with timezone conversion on read)
--
-- This migration corrects existing columns in-place (no new columns).
-- Parsing is safe: unparseable text values become NULL on conversion.
-- Type guards make reruns safe.

BEGIN;

-- Drop dependent trigger before altering last_service_date type.
DROP TRIGGER IF EXISTS trg_set_all_service_assumed_columns
  ON public.all_service_data;

-- Helper functions for safe parsing
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
    -- Excel serial date (1900 date system)
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
  v_extended_warranty_start_date_type text;
  v_extended_warranty_end_date_type text;
  v_last_service_date_type text;
BEGIN
  SELECT c.data_type INTO v_vehicle_sale_date_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'all_service_data'
    AND c.column_name = 'vehicle_sale_date';

  IF v_vehicle_sale_date_type IS DISTINCT FROM 'date' THEN
    EXECUTE $sql$
      ALTER TABLE public.all_service_data
      ALTER COLUMN vehicle_sale_date TYPE date
      USING public.parse_date_text(vehicle_sale_date::text)
    $sql$;
  END IF;

  SELECT c.data_type INTO v_scheduled_next_service_date_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'all_service_data'
    AND c.column_name = 'scheduled_next_service_date';

  IF v_scheduled_next_service_date_type IS DISTINCT FROM 'date' THEN
    EXECUTE $sql$
      ALTER TABLE public.all_service_data
      ALTER COLUMN scheduled_next_service_date TYPE date
      USING public.parse_date_text(scheduled_next_service_date::text)
    $sql$;
  END IF;

  SELECT c.data_type INTO v_extended_warranty_start_date_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'all_service_data'
    AND c.column_name = 'extended_warranty_start_date';

  IF v_extended_warranty_start_date_type IS DISTINCT FROM 'date' THEN
    EXECUTE $sql$
      ALTER TABLE public.all_service_data
      ALTER COLUMN extended_warranty_start_date TYPE date
      USING public.parse_date_text(extended_warranty_start_date::text)
    $sql$;
  END IF;

  SELECT c.data_type INTO v_extended_warranty_end_date_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'all_service_data'
    AND c.column_name = 'extended_warranty_end_date';

  IF v_extended_warranty_end_date_type IS DISTINCT FROM 'date' THEN
    EXECUTE $sql$
      ALTER TABLE public.all_service_data
      ALTER COLUMN extended_warranty_end_date TYPE date
      USING public.parse_date_text(extended_warranty_end_date::text)
    $sql$;
  END IF;

  SELECT c.data_type INTO v_last_service_date_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'all_service_data'
    AND c.column_name = 'last_service_date';

  IF v_last_service_date_type IS DISTINCT FROM 'timestamp with time zone' THEN
    EXECUTE $sql$
      ALTER TABLE public.all_service_data
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

-- Overload assumed-next-service calculator for timestamptz source column.
CREATE OR REPLACE FUNCTION public.calc_all_service_assumed_next_service_date(
  p_last_service_date timestamptz,
  p_last_service_type text,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  WITH normalized AS (
    SELECT lower(btrim(COALESCE(p_last_service_type, ''))) AS lst
  ), inferred_type AS (
    SELECT public.calc_all_service_assumed_next_service_type(p_last_service_type) AS assumed_type
  ), parsed AS (
    SELECT (p_last_service_date AT TIME ZONE 'Asia/Kolkata')::date AS last_service_dt
  )
  SELECT
    CASE
      WHEN it.assumed_type = 'Unknown' THEN NULL
      WHEN p.last_service_dt IS NULL THEN NULL
      ELSE p_as_of_date + (
        (
          CASE
            WHEN n.lst = '' OR n.lst = 'new' THEN 60
            WHEN n.lst IN ('first free service', 'tma-first free service') THEN 120
            ELSE 180
          END
        )
        - MOD(GREATEST(0, (p_as_of_date - p.last_service_dt)::int), 180)
      )
    END
  FROM parsed p
  CROSS JOIN normalized n
  CROSS JOIN inferred_type it;
$$;

-- Rebuild trigger function against current all_service_data column types.
CREATE OR REPLACE FUNCTION public.set_all_service_assumed_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.assumed_next_service_type := public.calc_all_service_assumed_next_service_type(
    NEW.last_service_type
  );

  NEW.assumed_next_service_date := public.calc_all_service_assumed_next_service_date(
    NEW.last_service_date,
    NEW.last_service_type,
    current_date
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_all_service_assumed_columns
BEFORE INSERT OR UPDATE OF last_service_type, last_service_date
ON public.all_service_data
FOR EACH ROW
EXECUTE FUNCTION public.set_all_service_assumed_columns();

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_all_service_data_vehicle_sale_date
  ON public.all_service_data (vehicle_sale_date);

CREATE INDEX IF NOT EXISTS idx_all_service_data_scheduled_next_service_date
  ON public.all_service_data (scheduled_next_service_date);

CREATE INDEX IF NOT EXISTS idx_all_service_data_extended_warranty_start_date
  ON public.all_service_data (extended_warranty_start_date);

CREATE INDEX IF NOT EXISTS idx_all_service_data_extended_warranty_end_date
  ON public.all_service_data (extended_warranty_end_date);

CREATE INDEX IF NOT EXISTS idx_all_service_data_last_service_date
  ON public.all_service_data (last_service_date);

COMMENT ON COLUMN public.all_service_data.vehicle_sale_date IS 'Type corrected to date (Supabase default).';
COMMENT ON COLUMN public.all_service_data.scheduled_next_service_date IS 'Type corrected to date (Supabase default).';
COMMENT ON COLUMN public.all_service_data.extended_warranty_start_date IS 'Type corrected to date (Supabase default).';
COMMENT ON COLUMN public.all_service_data.extended_warranty_end_date IS 'Type corrected to date (Supabase default).';
COMMENT ON COLUMN public.all_service_data.last_service_date IS 'Type corrected to timestamptz (Supabase default). Parsed from legacy text using IST-aware conversion rules.';

COMMIT;
