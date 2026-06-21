-- Plan: SUPABASE-002 Phase 4
-- Purpose: Enforce NULL assumed_next_service_date when assumed_next_service_type is Unknown.

BEGIN;

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
  ), inferred_type AS (
    SELECT public.calc_all_service_assumed_next_service_type(p_last_service_type) AS assumed_type
  )
  SELECT
    CASE
      WHEN it.assumed_type = 'Unknown' THEN NULL
      WHEN p.last_service_dt IS NULL THEN NULL
      ELSE p_as_of_date + (
        (
          CASE
            WHEN n.lst = 'new' THEN 60
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

COMMENT ON FUNCTION public.calc_all_service_assumed_next_service_date(text, text, date)
IS 'Implements approved Phase 4 rule: assumed_next_service_date = as_of_date + (target_days - MOD(GREATEST(0, as_of_date - parsed_last_service_date), 180)); target_days: 60 for new, 120 for first free/tma-first free, else 180. Additional guard: returns NULL when inferred assumed_next_service_type is Unknown.';

-- Recompute stored rows under Unknown-date-null guard.
UPDATE public.all_service_data a
SET assumed_next_service_date = public.calc_all_service_assumed_next_service_date(
  a.last_service_date,
  a.last_service_type,
  current_date
)
WHERE a.assumed_next_service_date IS DISTINCT FROM public.calc_all_service_assumed_next_service_date(
  a.last_service_date,
  a.last_service_type,
  current_date
);

COMMIT;
