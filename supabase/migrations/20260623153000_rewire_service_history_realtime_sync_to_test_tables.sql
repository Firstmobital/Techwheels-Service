-- Rewire Service-History realtime sync to *_test source tables from authoritative dump audit.
-- Also removes stale reference to non-existent all_service_data.last_service_at.

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_all_service_data_from_service_history(p_chassis_key text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
BEGIN
  v_key := nullif(upper(btrim(coalesce(p_chassis_key, ''))), '');

  IF v_key IS NULL THEN
    RETURN;
  END IF;

  WITH source_union AS (
    SELECT
      h.id,
      upper(btrim(h.chassis_no)) AS chassis_key,
      h.registration_no,
      h.odometer_reading,
      h.serviced_at_dealer,
      h.sr_type,
      h.service_date_time,
      COALESCE(
        NULLIF(btrim(to_jsonb(h) ->> 'contact_full_name'), ''),
        NULLIF(btrim(to_jsonb(h) ->> 'conatct_full_name'), '')
      ) AS contact_full_name,
      h.created_at,
      1::int AS source_rank
    FROM public."EV_service_history_test" h
    WHERE nullif(btrim(h.chassis_no), '') IS NOT NULL
      AND upper(btrim(h.chassis_no)) = v_key

    UNION ALL

    SELECT
      h.id,
      upper(btrim(h.chassis_no)) AS chassis_key,
      h.registration_no,
      h.odometer_reading,
      h.serviced_at_dealer,
      h.sr_type,
      h.service_date_time,
      COALESCE(
        NULLIF(btrim(to_jsonb(h) ->> 'contact_full_name'), ''),
        NULLIF(btrim(to_jsonb(h) ->> 'conatct_full_name'), '')
      ) AS contact_full_name,
      h.created_at,
      2::int AS source_rank
    FROM public."PV_service_history_test" h
    WHERE nullif(btrim(h.chassis_no), '') IS NOT NULL
      AND upper(btrim(h.chassis_no)) = v_key
  ),
  ranked AS (
    SELECT
      su.*,
      CASE
        WHEN lower(coalesce(su.sr_type, '')) LIKE '%service%' THEN 0
        ELSE 1
      END AS service_priority,
      su.service_date_time AS parsed_service_at
    FROM source_union su
  ),
  chosen AS (
    SELECT
      r.chassis_key,
      r.registration_no,
      r.odometer_reading,
      r.serviced_at_dealer,
      r.sr_type,
      r.parsed_service_at,
      r.contact_full_name,
      r.created_at
    FROM ranked r
    ORDER BY
      r.service_priority ASC,
      r.parsed_service_at DESC NULLS LAST,
      r.created_at DESC NULLS LAST,
      r.source_rank ASC,
      r.id DESC
    LIMIT 1
  )
  UPDATE public.all_service_data AS t
  SET
    vehicle_registration_number = COALESCE(c.registration_no, t.vehicle_registration_number),
    updated_by_robot = true,
    updated_by_robot_at = c.created_at,
    last_updated_at = now(),
    last_service_km = COALESCE(c.odometer_reading, t.last_service_km),
    last_service_dealer = COALESCE(c.serviced_at_dealer, t.last_service_dealer),
    last_service_date = COALESCE(c.parsed_service_at, t.last_service_date),
    first_name = COALESCE(c.contact_full_name, t.first_name),
    last_service_type = COALESCE(c.sr_type, t.last_service_type)
  FROM chosen c
  WHERE upper(btrim(t.chassis_no)) = c.chassis_key
    AND (
      t.vehicle_registration_number IS DISTINCT FROM COALESCE(c.registration_no, t.vehicle_registration_number)
      OR t.updated_by_robot IS DISTINCT FROM true
      OR t.updated_by_robot_at IS DISTINCT FROM c.created_at
      OR t.last_service_km IS DISTINCT FROM COALESCE(c.odometer_reading, t.last_service_km)
      OR t.last_service_dealer IS DISTINCT FROM COALESCE(c.serviced_at_dealer, t.last_service_dealer)
      OR t.last_service_date IS DISTINCT FROM COALESCE(c.parsed_service_at, t.last_service_date)
      OR t.first_name IS DISTINCT FROM COALESCE(c.contact_full_name, t.first_name)
      OR t.last_service_type IS DISTINCT FROM COALESCE(c.sr_type, t.last_service_type)
    );
END;
$$;

COMMENT ON FUNCTION public.refresh_all_service_data_from_service_history(text) IS
'Refreshes all_service_data from realtime Service-History test sources (EV_service_history_test/PV_service_history_test) using deterministic one-row-per-chassis selection.';

DROP TRIGGER IF EXISTS trg_sync_all_service_data_from_ev_service_history ON public."EV_Service_History";
DROP TRIGGER IF EXISTS trg_sync_all_service_data_from_pv_service_history ON public."PV_Service_History";
DROP TRIGGER IF EXISTS trg_sync_all_service_data_from_ev_service_history ON public."EV_service_history_test";
DROP TRIGGER IF EXISTS trg_sync_all_service_data_from_pv_service_history ON public."PV_service_history_test";

CREATE TRIGGER trg_sync_all_service_data_from_ev_service_history
AFTER INSERT OR UPDATE OR DELETE ON public."EV_service_history_test"
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_all_service_data_from_service_history();

CREATE TRIGGER trg_sync_all_service_data_from_pv_service_history
AFTER INSERT OR UPDATE OR DELETE ON public."PV_service_history_test"
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_all_service_data_from_service_history();

COMMIT;
