-- Plan: SUPABASE-002 Phase 4 (Concrete v2)
-- Purpose: Implement assumed_next_service_type mapping, sync trigger, and backfill.

BEGIN;

-- Keep migration idempotent in case v1 was not applied yet.
ALTER TABLE public.all_service_data
  ADD COLUMN IF NOT EXISTS assumed_next_service_date date,
  ADD COLUMN IF NOT EXISTS assumed_next_service_type text;

CREATE OR REPLACE FUNCTION public.calc_all_service_assumed_next_service_type(
  p_last_service_type text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH normalized AS (
    SELECT lower(btrim(COALESCE(p_last_service_type, ''))) AS lst
  )
  SELECT
    CASE
      WHEN n.lst = '' THEN NULL
      WHEN n.lst = 'new' THEN 'First Free Service'
      WHEN n.lst = 'first free service' THEN 'Second Free Service'
      WHEN n.lst = 'second free service' THEN 'Third Free Service'
      WHEN n.lst = 'tma-first free service' THEN 'Second Free Service'
      WHEN n.lst = 'tma-second free service' THEN 'Third Free Service'
      WHEN n.lst = 'tma-third free service' THEN 'Paid Service'
      WHEN n.lst = 'schedule service' THEN 'Paid Service'
      WHEN n.lst LIKE '%service%' THEN 'Paid Service'
      ELSE 'Paid Service'
    END
  FROM normalized n;
$$;

COMMENT ON FUNCTION public.calc_all_service_assumed_next_service_type(text)
IS 'Maps last_service_type to assumed_next_service_type: New->First Free Service, First->Second, Second->Third, TMA-First->Second, TMA-Second->Third, TMA-Third->Paid, Schedule Service->Paid, any other non-blank service-related (and fallback) -> Paid Service, blank -> NULL.';

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

COMMENT ON FUNCTION public.set_all_service_assumed_columns()
IS 'Maintains assumed_next_service_type and assumed_next_service_date on INSERT/UPDATE of last_service_type/last_service_date.';

DROP TRIGGER IF EXISTS trg_set_all_service_assumed_columns
  ON public.all_service_data;

CREATE TRIGGER trg_set_all_service_assumed_columns
BEFORE INSERT OR UPDATE OF last_service_type, last_service_date
ON public.all_service_data
FOR EACH ROW
EXECUTE FUNCTION public.set_all_service_assumed_columns();

-- One-time deterministic backfill snapshot as of migration run date.
UPDATE public.all_service_data a
SET
  assumed_next_service_type = public.calc_all_service_assumed_next_service_type(a.last_service_type),
  assumed_next_service_date = public.calc_all_service_assumed_next_service_date(
    a.last_service_date,
    a.last_service_type,
    current_date
  )
WHERE
  a.assumed_next_service_type IS DISTINCT FROM public.calc_all_service_assumed_next_service_type(a.last_service_type)
  OR a.assumed_next_service_date IS DISTINCT FROM public.calc_all_service_assumed_next_service_date(
    a.last_service_date,
    a.last_service_type,
    current_date
  );

COMMIT;
