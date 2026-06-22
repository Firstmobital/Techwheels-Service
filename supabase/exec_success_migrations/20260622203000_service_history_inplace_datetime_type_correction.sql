-- Purpose:
-- In-place type correction for Service_History datetime columns to Supabase defaults.
--
-- Policy:
-- - No companion columns.
-- - Convert existing columns in-place using ALTER COLUMN ... TYPE ... USING.
-- - Keep existing realtime sync function compatibility.
--
-- Target tables:
-- - public."EV_Service_History"
-- - public."PV_Service_History"
--
-- Type targets:
-- - service_date_time -> timestamptz
-- - created_at -> timestamptz (already canonical in most environments)

BEGIN;

-- Parser helper for legacy DD/MM/YYYY HH12:MI AM/PM service history values.
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

-- Compatibility overload:
-- Existing trigger paths call parse_service_history_datetime_ist(service_date_time).
-- After service_date_time becomes timestamptz, this overload keeps those calls valid.
CREATE OR REPLACE FUNCTION public.parse_service_history_datetime_ist(p_ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_ts;
$$;

-- Date parser fallback for date-only legacy text values.
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
  END IF;

  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  v_ev_service_date_type text;
  v_pv_service_date_type text;
  v_ev_created_at_type text;
  v_pv_created_at_type text;
BEGIN
  SELECT c.data_type INTO v_ev_service_date_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'EV_Service_History'
    AND c.column_name = 'service_date_time';

  IF v_ev_service_date_type IS DISTINCT FROM 'timestamp with time zone' THEN
    EXECUTE $sql$
      ALTER TABLE public."EV_Service_History"
      ALTER COLUMN service_date_time TYPE timestamptz
      USING COALESCE(
        public.parse_service_history_datetime_ist(service_date_time::text),
        CASE
          WHEN public.parse_date_text(service_date_time::text) IS NOT NULL
          THEN make_timestamptz(
            EXTRACT(YEAR FROM public.parse_date_text(service_date_time::text))::int,
            EXTRACT(MONTH FROM public.parse_date_text(service_date_time::text))::int,
            EXTRACT(DAY FROM public.parse_date_text(service_date_time::text))::int,
            0, 0, 0, 'Asia/Kolkata'
          )
          ELSE NULL
        END
      )
    $sql$;
  END IF;

  SELECT c.data_type INTO v_pv_service_date_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PV_Service_History'
    AND c.column_name = 'service_date_time';

  IF v_pv_service_date_type IS DISTINCT FROM 'timestamp with time zone' THEN
    EXECUTE $sql$
      ALTER TABLE public."PV_Service_History"
      ALTER COLUMN service_date_time TYPE timestamptz
      USING COALESCE(
        public.parse_service_history_datetime_ist(service_date_time::text),
        CASE
          WHEN public.parse_date_text(service_date_time::text) IS NOT NULL
          THEN make_timestamptz(
            EXTRACT(YEAR FROM public.parse_date_text(service_date_time::text))::int,
            EXTRACT(MONTH FROM public.parse_date_text(service_date_time::text))::int,
            EXTRACT(DAY FROM public.parse_date_text(service_date_time::text))::int,
            0, 0, 0, 'Asia/Kolkata'
          )
          ELSE NULL
        END
      )
    $sql$;
  END IF;

  -- created_at should already be timestamptz, keep guarded correction for drifted environments.
  SELECT c.data_type INTO v_ev_created_at_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'EV_Service_History'
    AND c.column_name = 'created_at';

  IF v_ev_created_at_type IS DISTINCT FROM 'timestamp with time zone' THEN
    EXECUTE $sql$
      ALTER TABLE public."EV_Service_History"
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at::timestamptz
    $sql$;
  END IF;

  SELECT c.data_type INTO v_pv_created_at_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PV_Service_History'
    AND c.column_name = 'created_at';

  IF v_pv_created_at_type IS DISTINCT FROM 'timestamp with time zone' THEN
    EXECUTE $sql$
      ALTER TABLE public."PV_Service_History"
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at::timestamptz
    $sql$;
  END IF;
END $$;

COMMENT ON COLUMN public."EV_Service_History".service_date_time IS
'In-place corrected to timestamptz from legacy text. Unparseable legacy values become NULL.';

COMMENT ON COLUMN public."PV_Service_History".service_date_time IS
'In-place corrected to timestamptz from legacy text. Unparseable legacy values become NULL.';

COMMENT ON COLUMN public."EV_Service_History".created_at IS
'Canonical type timestamptz (Supabase default).';

COMMENT ON COLUMN public."PV_Service_History".created_at IS
'Canonical type timestamptz (Supabase default).';

COMMIT;
