-- Plan: SUPABASE-002
-- Purpose: Create and maintain a physical dynamic table synced from public.all_service_data
-- Scope: Real-time trigger sync for rows where business columns are all NULL (excluding technical columns)

BEGIN;

-- 1) Physical dynamic table (structure clone only)
CREATE TABLE IF NOT EXISTS public.all_service_data_dynamic
AS
SELECT *
FROM public.all_service_data
WITH NO DATA;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'all_service_data_dynamic_pkey'
      AND conrelid = 'public.all_service_data_dynamic'::regclass
  ) THEN
    ALTER TABLE public.all_service_data_dynamic
      ADD CONSTRAINT all_service_data_dynamic_pkey PRIMARY KEY (id);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS all_service_data_dynamic_chassis_uq
  ON public.all_service_data_dynamic (chassis_no);

-- Keep grants aligned with existing open-access table style in this schema.
GRANT ALL ON TABLE public.all_service_data_dynamic TO anon;
GRANT ALL ON TABLE public.all_service_data_dynamic TO authenticated;
GRANT ALL ON TABLE public.all_service_data_dynamic TO service_role;

-- 2) Reusable predicate (exclude technical columns from NULL check)
CREATE OR REPLACE FUNCTION public.is_all_service_dynamic_match(r public.all_service_data)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.chassis_no IS NOT NULL
    AND COALESCE(
      (
        SELECT bool_and(e.value IS NULL)
        FROM jsonb_each(
          to_jsonb(r) - ARRAY['id','chassis_no','created_at','last_updated_at']
        ) AS e(key, value)
      ),
      true
    );
$$;

COMMENT ON FUNCTION public.is_all_service_dynamic_match(public.all_service_data)
IS 'Returns true when all non-technical columns are NULL for a source all_service_data row.';

-- 3) Initial load
TRUNCATE TABLE public.all_service_data_dynamic;

INSERT INTO public.all_service_data_dynamic
SELECT a.*
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);

-- 4) Real-time sync trigger
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

  -- For INSERT/UPDATE, remove stale row then insert only when condition matches.
  DELETE FROM public.all_service_data_dynamic d
  WHERE d.id = NEW.id;

  IF public.is_all_service_dynamic_match(NEW) THEN
    INSERT INTO public.all_service_data_dynamic
    SELECT (NEW).*;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_all_service_data_dynamic()
IS 'Maintains public.all_service_data_dynamic in real time from all_service_data row changes.';

DROP TRIGGER IF EXISTS trg_sync_all_service_data_dynamic
  ON public.all_service_data;

CREATE TRIGGER trg_sync_all_service_data_dynamic
AFTER INSERT OR UPDATE OR DELETE
ON public.all_service_data
FOR EACH ROW
EXECUTE FUNCTION public.sync_all_service_data_dynamic();

COMMIT;
