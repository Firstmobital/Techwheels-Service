-- Reusable one-time style backfill script for public.all_service_data
--
-- Behavior:
-- 1) Ensures required target columns exist (created once via IF NOT EXISTS).
-- 2) Updates all_service_data from PV/EV source tables using chassis_no match.
-- 3) Sets robot audit fields on touched rows.
-- 4) Safe to re-run: schema adds are idempotent, data update is change-detection based.
--
-- Run this script manually whenever needed.

BEGIN;

-- Ensure required columns exist only once.
ALTER TABLE public.all_service_data
  ADD COLUMN IF NOT EXISTS updated_by_robot boolean,
  ADD COLUMN IF NOT EXISTS updated_by_robot_at timestamptz,
  ADD COLUMN IF NOT EXISTS engine_no text,
  ADD COLUMN IF NOT EXISTS scheduled_next_service_type text;

-- Optional comments (idempotent; safe to keep on each run).
COMMENT ON COLUMN public.all_service_data.updated_by_robot
IS 'Robot update flag. PostgreSQL boolean input supports true/false, t/f, yes/no, on/off, 1/0.';

COMMENT ON COLUMN public.all_service_data.updated_by_robot_at
IS 'Timestamp with time zone when robot automation last updated this row.';

COMMENT ON COLUMN public.all_service_data.engine_no
IS 'Engine number projected from PV/EV source vehicle data during backfill workflows.';

COMMENT ON COLUMN public.all_service_data.scheduled_next_service_type
IS 'Scheduled next service type projected from PV/EV source vehicle data during backfill workflows.';

WITH source_union AS (
  SELECT
    upper(btrim(chassis_no)) AS chassis_key,
    registration_no,
    product_name,
    vehicle_type,
    resale_date,
    warranty_expiry_date,
    NULL::text AS engine_no,
    last_service_date,
    last_service_km,
    dealer,
    first_name,
    contact_phones,
    next_service_date,
    next_service_type,
    created_at,
    'EV'::text AS source_name
  FROM public."EV_Vehicle_Data"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL

  UNION ALL

  SELECT
    upper(btrim(chassis_no)) AS chassis_key,
    registration_no,
    product_name,
    vehicle_type,
    resale_date,
    warranty_expiry_date,
    engine_no,
    last_service_date,
    last_service_km,
    dealer,
    first_name,
    contact_phones,
    next_service_date,
    next_service_type,
    created_at,
    'PV'::text AS source_name
  FROM public."PV_Vehicle_Data"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL
),
source_dedup AS (
  SELECT
    x.chassis_key,
    x.registration_no,
    x.product_name,
    x.vehicle_type,
    x.resale_date,
    x.warranty_expiry_date,
    x.engine_no,
    x.last_service_date,
    x.last_service_km,
    x.dealer,
    x.first_name,
    x.contact_phones,
    x.next_service_date,
    x.next_service_type,
    x.created_at
  FROM (
    SELECT
      su.*,
      row_number() OVER (
        PARTITION BY su.chassis_key
        ORDER BY su.created_at DESC NULLS LAST, su.source_name
      ) AS rn
    FROM source_union su
  ) x
  WHERE x.rn = 1
),
updated_rows AS (
  UPDATE public.all_service_data AS t
  SET
    vehicle_registration_number = COALESCE(s.registration_no, t.vehicle_registration_number),
    model = COALESCE(s.product_name, t.model),
    product_line = COALESCE(s.vehicle_type, t.product_line),
    vehicle_sale_date = COALESCE(s.resale_date, t.vehicle_sale_date),
    extended_warranty_end_date = COALESCE(s.warranty_expiry_date, t.extended_warranty_end_date),
    engine_no = COALESCE(s.engine_no, t.engine_no),
    last_service_date = COALESCE(s.last_service_date, t.last_service_date),
    last_service_km = COALESCE(s.last_service_km, t.last_service_km),
    last_service_dealer = COALESCE(s.dealer, t.last_service_dealer),
    first_name = COALESCE(s.first_name, t.first_name),
    contact_phones = COALESCE(s.contact_phones, t.contact_phones),
    scheduled_next_service_date = COALESCE(s.next_service_date, t.scheduled_next_service_date),
    scheduled_next_service_type = COALESCE(s.next_service_type, t.scheduled_next_service_type),
    updated_by_robot = true,
    updated_by_robot_at = s.created_at,
    last_updated_at = now()
  FROM source_dedup s
  WHERE upper(btrim(t.chassis_no)) = s.chassis_key
    AND (
      t.vehicle_registration_number IS DISTINCT FROM COALESCE(s.registration_no, t.vehicle_registration_number)
      OR t.model IS DISTINCT FROM COALESCE(s.product_name, t.model)
      OR t.product_line IS DISTINCT FROM COALESCE(s.vehicle_type, t.product_line)
      OR t.vehicle_sale_date IS DISTINCT FROM COALESCE(s.resale_date, t.vehicle_sale_date)
      OR t.extended_warranty_end_date IS DISTINCT FROM COALESCE(s.warranty_expiry_date, t.extended_warranty_end_date)
      OR t.engine_no IS DISTINCT FROM COALESCE(s.engine_no, t.engine_no)
      OR t.last_service_date IS DISTINCT FROM COALESCE(s.last_service_date, t.last_service_date)
      OR t.last_service_km IS DISTINCT FROM COALESCE(s.last_service_km, t.last_service_km)
      OR t.last_service_dealer IS DISTINCT FROM COALESCE(s.dealer, t.last_service_dealer)
      OR t.first_name IS DISTINCT FROM COALESCE(s.first_name, t.first_name)
      OR t.contact_phones IS DISTINCT FROM COALESCE(s.contact_phones, t.contact_phones)
      OR t.scheduled_next_service_date IS DISTINCT FROM COALESCE(s.next_service_date, t.scheduled_next_service_date)
      OR t.scheduled_next_service_type IS DISTINCT FROM COALESCE(s.next_service_type, t.scheduled_next_service_type)
      OR t.updated_by_robot IS DISTINCT FROM true
      OR t.updated_by_robot_at IS DISTINCT FROM s.created_at
    )
  RETURNING t.id
)
SELECT count(*) AS affected_rows
FROM updated_rows;

COMMIT;
