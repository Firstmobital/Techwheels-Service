-- Purpose:
-- One-time backfill of public.all_service_data from source master tables:
--   - public."PV_Vehicle_Data"
--   - public."EV_Vehicle_Data"
--
-- Scope:
-- 1) Update ONLY public.all_service_data (no direct write to all_service_data_dynamic).
-- 2) Match rows by chassis_no (case/trim normalized).
-- 3) Map source fields to matching target fields.
-- 4) Mark robot audit columns for touched rows:
--    - updated_by_robot = true
--    - updated_by_robot_at = source.created_at
--
-- Notes:
-- - This is intentionally one-time and data-only.
-- - all_service_data_dynamic will refresh indirectly via existing trigger on all_service_data.

BEGIN;

WITH source_union AS (
  SELECT
    upper(btrim(chassis_no)) AS chassis_key,
    registration_no,
    product_name,
    last_service_date,
    last_service_km,
    dealer,
    first_name,
    contact_phones,
    next_service_date,
    created_at,
    'EV'::text AS source_name
  FROM public."EV_Vehicle_Data"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL

  UNION ALL

  SELECT
    upper(btrim(chassis_no)) AS chassis_key,
    registration_no,
    product_name,
    last_service_date,
    last_service_km,
    dealer,
    first_name,
    contact_phones,
    next_service_date,
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
    x.last_service_date,
    x.last_service_km,
    x.dealer,
    x.first_name,
    x.contact_phones,
    x.next_service_date,
    x.created_at,
    x.source_name
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
)
UPDATE public.all_service_data AS t
SET
  vehicle_registration_number = COALESCE(s.registration_no, t.vehicle_registration_number),
  product_line = COALESCE(s.product_name, t.product_line),
  last_service_date = COALESCE(s.last_service_date, t.last_service_date),
  last_service_km = COALESCE(s.last_service_km, t.last_service_km),
  last_service_dealer = COALESCE(s.dealer, t.last_service_dealer),
  first_name = COALESCE(s.first_name, t.first_name),
  contact_phones = COALESCE(s.contact_phones, t.contact_phones),
  scheduled_next_service_date = COALESCE(s.next_service_date, t.scheduled_next_service_date),
  updated_by_robot = true,
  updated_by_robot_at = s.created_at,
  last_updated_at = now()
FROM source_dedup s
WHERE upper(btrim(t.chassis_no)) = s.chassis_key
  AND (
    t.vehicle_registration_number IS DISTINCT FROM COALESCE(s.registration_no, t.vehicle_registration_number)
    OR t.product_line IS DISTINCT FROM COALESCE(s.product_name, t.product_line)
    OR t.last_service_date IS DISTINCT FROM COALESCE(s.last_service_date, t.last_service_date)
    OR t.last_service_km IS DISTINCT FROM COALESCE(s.last_service_km, t.last_service_km)
    OR t.last_service_dealer IS DISTINCT FROM COALESCE(s.dealer, t.last_service_dealer)
    OR t.first_name IS DISTINCT FROM COALESCE(s.first_name, t.first_name)
    OR t.contact_phones IS DISTINCT FROM COALESCE(s.contact_phones, t.contact_phones)
    OR t.scheduled_next_service_date IS DISTINCT FROM COALESCE(s.next_service_date, t.scheduled_next_service_date)
    OR t.updated_by_robot IS DISTINCT FROM true
    OR t.updated_by_robot_at IS DISTINCT FROM s.created_at
  );

COMMIT;
