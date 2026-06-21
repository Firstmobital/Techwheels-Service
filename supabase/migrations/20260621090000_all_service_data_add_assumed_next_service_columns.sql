-- Plan: SUPABASE-002 Phase 4 (Concrete v1)
-- Purpose: Add assumed_next_service_* columns and implement assumed_next_service_date logic.

BEGIN;

ALTER TABLE public.all_service_data
  ADD COLUMN IF NOT EXISTS assumed_next_service_date date,
  ADD COLUMN IF NOT EXISTS assumed_next_service_type text;

COMMENT ON COLUMN public.all_service_data.assumed_next_service_date
IS 'Derived daily projection: current_date + (target_days_by_last_service_type - done_days), where done_days = MOD(GREATEST(0, current_date - parsed_last_service_date), 180).';

COMMENT ON COLUMN public.all_service_data.assumed_next_service_type
IS 'Reserved for derived next service type mapping. Population logic pending separate business-rule approval.';

-- Parse all known date formats used across service datasets.
CREATE OR REPLACE FUNCTION public.parse_all_service_date_text(v text)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN nullif(btrim(v), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN to_date(nullif(btrim(v), ''), 'YYYY-MM-DD')
      WHEN nullif(btrim(v), '') ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$'
        THEN to_date(nullif(btrim(v), ''), 'YYYY/MM/DD')
      WHEN nullif(btrim(v), '') ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}$'
        THEN to_date(nullif(btrim(v), ''), 'DD-MM-YYYY')
      WHEN nullif(btrim(v), '') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
        THEN to_date(nullif(btrim(v), ''), 'DD/MM/YYYY')
      ELSE NULL
    END;
$$;

COMMENT ON FUNCTION public.parse_all_service_date_text(text)
IS 'Parses text date into date with support for YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY.';

CREATE OR REPLACE FUNCTION public.calc_all_service_assumed_next_service_date(
  p_last_service_date text,
  p_last_service_type text,
  p_as_of_date date DEFAULT current_date
)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  WITH parsed AS (
    SELECT public.parse_all_service_date_text(p_last_service_date) AS last_service_dt
  ), normalized AS (
    SELECT lower(btrim(COALESCE(p_last_service_type, ''))) AS lst
  )
  SELECT
    CASE
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
  CROSS JOIN normalized n;
$$;

COMMENT ON FUNCTION public.calc_all_service_assumed_next_service_date(text, text, date)
IS 'Implements approved Phase 4 rule: assumed_next_service_date = as_of_date + (target_days - MOD(GREATEST(0, as_of_date - parsed_last_service_date), 180)); target_days: 60 for new/null/empty, 120 for first free/tma-first free, else 180.';

-- Initial backfill snapshot as of migration run date.
UPDATE public.all_service_data a
SET
  assumed_next_service_date = public.calc_all_service_assumed_next_service_date(
    a.last_service_date,
    a.last_service_type,
    current_date
  ),
  assumed_next_service_type = NULL
WHERE
  a.assumed_next_service_date IS DISTINCT FROM public.calc_all_service_assumed_next_service_date(
    a.last_service_date,
    a.last_service_type,
    current_date
  )
  OR a.assumed_next_service_type IS NOT NULL;

COMMIT;
