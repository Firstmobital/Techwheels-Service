-- Read-only verification checks for:
-- supabase/migrations/20260622124500_one_time_backfill_all_service_data_from_pv_ev_vehicle_data.sql
--
-- Run sequence:
-- 1) Run sections A+B before migration (preflight + impact preview).
-- 2) Apply migration.
-- 3) Run section C for post-apply verification.

-- ============================================================
-- A) Preflight quality checks
-- ============================================================

-- A1) Source duplicate keys by normalized chassis_no.
WITH source_union AS (
  SELECT upper(btrim(chassis_no)) AS chassis_key
  FROM public."EV_Vehicle_Data"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL
  UNION ALL
  SELECT upper(btrim(chassis_no)) AS chassis_key
  FROM public."PV_Vehicle_Data"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL
)
SELECT
  count(*) AS duplicate_key_groups
FROM (
  SELECT chassis_key
  FROM source_union
  GROUP BY chassis_key
  HAVING count(*) > 1
) d;

-- A2) How many source keys can match target all_service_data.
WITH source_union AS (
  SELECT upper(btrim(chassis_no)) AS chassis_key
  FROM public."EV_Vehicle_Data"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL
  UNION
  SELECT upper(btrim(chassis_no)) AS chassis_key
  FROM public."PV_Vehicle_Data"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL
)
SELECT
  count(*) AS source_keys_matching_target
FROM source_union s
JOIN public.all_service_data t
  ON upper(btrim(t.chassis_no)) = s.chassis_key;

-- ============================================================
-- B) Pre-apply impact preview (same update conditions)
-- ============================================================

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
    status,
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
    status,
    created_at,
    'PV'::text AS source_name
  FROM public."PV_Vehicle_Data"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL
),
source_status_flags AS (
  SELECT
    su.chassis_key,
    bool_or(lower(btrim(coalesce(su.status, ''))) = 'pending') AS has_pending,
    bool_or(lower(btrim(coalesce(su.status, ''))) <> 'pending' AND nullif(btrim(coalesce(su.status, '')), '') IS NOT NULL) AS has_non_pending
  FROM source_union su
  GROUP BY su.chassis_key
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
    x.created_at,
    CASE
      WHEN coalesce(ssf.has_non_pending, false) THEN true
      WHEN coalesce(ssf.has_pending, false) THEN NULL
      ELSE true
    END AS computed_updated_by_robot
  FROM (
    SELECT
      su.*,
      row_number() OVER (
        PARTITION BY su.chassis_key
        ORDER BY su.created_at DESC NULLS LAST, su.source_name
      ) AS rn
    FROM source_union su
  ) x
  JOIN source_status_flags ssf
    ON ssf.chassis_key = x.chassis_key
  WHERE x.rn = 1
)
SELECT
  count(*) AS rows_that_would_update
FROM public.all_service_data t
JOIN source_dedup s
  ON upper(btrim(t.chassis_no)) = s.chassis_key
WHERE
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
  OR t.updated_by_robot IS DISTINCT FROM s.computed_updated_by_robot
  OR t.updated_by_robot_at IS DISTINCT FROM CASE
    WHEN s.computed_updated_by_robot THEN s.created_at
    ELSE NULL
  END;

-- ============================================================
-- C) Post-apply verification
-- ============================================================

-- C1) For matched rows, robot audit columns should follow status rule:
--     updated_by_robot=NULL when available source statuses are pending-only; else true.
WITH source_union AS (
  SELECT upper(btrim(chassis_no)) AS chassis_key, created_at, status, 'EV'::text AS source_name
  FROM public."EV_Vehicle_Data"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL
  UNION ALL
  SELECT upper(btrim(chassis_no)) AS chassis_key, created_at, status, 'PV'::text AS source_name
  FROM public."PV_Vehicle_Data"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL
),
source_status_flags AS (
  SELECT
    su.chassis_key,
    bool_or(lower(btrim(coalesce(su.status, ''))) = 'pending') AS has_pending,
    bool_or(lower(btrim(coalesce(su.status, ''))) <> 'pending' AND nullif(btrim(coalesce(su.status, '')), '') IS NOT NULL) AS has_non_pending
  FROM source_union su
  GROUP BY su.chassis_key
),
source_dedup AS (
  SELECT
    x.chassis_key,
    x.created_at,
    CASE
      WHEN coalesce(ssf.has_non_pending, false) THEN true
      WHEN coalesce(ssf.has_pending, false) THEN NULL
      ELSE true
    END AS computed_updated_by_robot
  FROM (
    SELECT su.*,
           row_number() OVER (
             PARTITION BY su.chassis_key
             ORDER BY su.created_at DESC NULLS LAST, su.source_name
           ) AS rn
    FROM source_union su
  ) x
  JOIN source_status_flags ssf
    ON ssf.chassis_key = x.chassis_key
  WHERE x.rn = 1
)
SELECT
  count(*) AS matched_rows_missing_robot_audit
FROM public.all_service_data t
JOIN source_dedup s
  ON upper(btrim(t.chassis_no)) = s.chassis_key
WHERE t.updated_by_robot IS DISTINCT FROM s.computed_updated_by_robot
   OR t.updated_by_robot_at IS DISTINCT FROM CASE
     WHEN s.computed_updated_by_robot THEN s.created_at
     ELSE NULL
   END;

-- C2) Quick sample of recently robot-marked rows.
SELECT
  t.id,
  t.chassis_no,
  t.vehicle_registration_number,
  t.model,
  t.product_line,
  t.vehicle_sale_date,
  t.extended_warranty_end_date,
  t.engine_no,
  t.scheduled_next_service_type,
  t.updated_by_robot,
  t.updated_by_robot_at,
  t.last_updated_at
FROM public.all_service_data t
WHERE t.updated_by_robot = true
ORDER BY t.updated_by_robot_at DESC NULLS LAST
LIMIT 50;
