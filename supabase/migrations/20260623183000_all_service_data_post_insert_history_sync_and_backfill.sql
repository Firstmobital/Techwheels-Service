-- Durable fix for late-created targets:
-- 1) Add post-insert sync hook on all_service_data so newly created rows pull latest Service-History winner.
-- 2) Run one-time backfill replay for existing all_service_data rows that already have history entries.

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_refresh_all_service_data_from_history_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.refresh_all_service_data_from_service_history(NEW.chassis_no);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_refresh_all_service_data_from_history_on_insert() IS
'After INSERT on all_service_data, replays Service-History winner selection for NEW.chassis_no so late-created targets are auto-synced.';

DROP TRIGGER IF EXISTS trg_refresh_all_service_data_from_history_on_insert ON public.all_service_data;

CREATE TRIGGER trg_refresh_all_service_data_from_history_on_insert
AFTER INSERT ON public.all_service_data
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_all_service_data_from_history_on_insert();

-- One-time replay for old cases: existing all_service_data rows that already have history in *_test tables.
DO $$
DECLARE
  v_chassis_key text;
BEGIN
  FOR v_chassis_key IN
    SELECT DISTINCT upper(btrim(a.chassis_no)) AS chassis_key
    FROM public.all_service_data a
    WHERE nullif(btrim(a.chassis_no), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public."EV_service_history_test" e
          WHERE upper(btrim(e.chassis_no)) = upper(btrim(a.chassis_no))
        )
        OR EXISTS (
          SELECT 1
          FROM public."PV_service_history_test" p
          WHERE upper(btrim(p.chassis_no)) = upper(btrim(a.chassis_no))
        )
      )
  LOOP
    PERFORM public.refresh_all_service_data_from_service_history(v_chassis_key);
  END LOOP;
END;
$$;

COMMIT;
