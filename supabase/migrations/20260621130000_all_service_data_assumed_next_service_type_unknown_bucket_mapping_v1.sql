-- Plan: SUPABASE-002 Phase 4
-- Purpose: Reduce Unknown bucket by explicitly mapping observed high-volume last_service_type values.

BEGIN;

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
      WHEN n.lst = 'third free service' THEN 'Paid Service'
      WHEN n.lst = 'fourth free service' THEN 'Paid Service'
      WHEN n.lst = 'fifth free service' THEN 'Paid Service'
      WHEN n.lst = 'sixth free service' THEN 'Paid Service'
      WHEN n.lst = 'seventh free service' THEN 'Paid Service'
      WHEN n.lst = 'tenth free service' THEN 'Paid Service'
      WHEN n.lst = 'paid service' THEN 'Paid Service'
      WHEN n.lst = 'schedule service' THEN 'Paid Service'

      -- Explicit Unknown-bucket mappings from production audit (2026-06-21)
      WHEN n.lst = 'running repairs' THEN 'Paid Service'
      WHEN n.lst = 'accident' THEN 'Paid Service'
      WHEN n.lst = 'campaign' THEN 'Paid Service'
      WHEN n.lst = 'amc - tm' THEN 'Paid Service'
      WHEN n.lst = 'e breakdown' THEN 'Paid Service'

      -- Keep non-standard/unclassified values visible for future policy decisions.
      ELSE 'Unknown'
    END
  FROM normalized n;
$$;

COMMENT ON FUNCTION public.calc_all_service_assumed_next_service_type(text)
IS 'Maps known last_service_type values to assumed_next_service_type. Explicitly maps Running Repairs/Accident/Campaign/AMC - TM/E Breakdown to Paid Service; other non-blank unmapped values remain Unknown.';

-- Recompute existing rows under explicit bucket mapping policy.
UPDATE public.all_service_data a
SET assumed_next_service_type = public.calc_all_service_assumed_next_service_type(a.last_service_type)
WHERE a.assumed_next_service_type IS DISTINCT FROM public.calc_all_service_assumed_next_service_type(a.last_service_type);

COMMIT;
