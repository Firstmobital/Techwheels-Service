-- Read-only verification checks for:
-- supabase/migrations/20260622180000_all_service_data_realtime_sync_from_service_history.sql
--
-- Run sequence:
-- 1) Run sections A+B before migration (preflight + impact preview).
-- 2) Apply migration.
-- 3) Run section C for post-apply verification.

-- ============================================================
-- A) Preflight shape checks
-- ============================================================

-- A1) How many normalized Service-History chassis keys can match target all_service_data.
WITH source_keys AS (
  SELECT upper(btrim(chassis_no)) AS chassis_key
  FROM public."EV_Service_History"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL
  UNION
  SELECT upper(btrim(chassis_no)) AS chassis_key
  FROM public."PV_Service_History"
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL
)
SELECT
  count(*) AS service_history_keys_matching_target
FROM source_keys s
JOIN public.all_service_data t
  ON upper(btrim(t.chassis_no)) = s.chassis_key;

-- A2) Candidate selector preview (finalized one row per chassis).
WITH source_union AS (
  SELECT
    h.id,
    upper(btrim(h.chassis_no)) AS chassis_key,
    h.registration_no,
    h.odometer_reading,
    h.serviced_at_dealer,
    h.sr_type,
    h.service_date_time,
    h.contact_full_name,
    h.created_at,
    'EV'::text AS source_name,
    1::int AS source_rank
  FROM public."EV_Service_History" h
  WHERE nullif(btrim(h.chassis_no), '') IS NOT NULL

  UNION ALL

  SELECT
    h.id,
    upper(btrim(h.chassis_no)) AS chassis_key,
    h.registration_no,
    h.odometer_reading,
    h.serviced_at_dealer,
    h.sr_type,
    h.service_date_time,
    h.contact_full_name,
    h.created_at,
    'PV'::text AS source_name,
    2::int AS source_rank
  FROM public."PV_Service_History" h
  WHERE nullif(btrim(h.chassis_no), '') IS NOT NULL
),
ranked AS (
  SELECT
    su.*,
    CASE
      WHEN lower(coalesce(su.sr_type, '')) LIKE '%service%' THEN 0
      ELSE 1
    END AS service_priority,
    CASE
      WHEN btrim(coalesce(su.service_date_time, '')) ~* '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}\s+[0-9]{1,2}:[0-9]{2}\s*(AM|PM)$'
        THEN to_timestamp(upper(btrim(su.service_date_time)), 'DD/MM/YYYY HH12:MI AM')
      ELSE NULL
    END AS parsed_service_ts
  FROM source_union su
),
chosen AS (
  SELECT
    x.*
  FROM (
    SELECT
      r.*,
      row_number() OVER (
        PARTITION BY r.chassis_key
        ORDER BY
          r.service_priority ASC,
          r.parsed_service_ts DESC NULLS LAST,
          r.created_at DESC NULLS LAST,
          r.source_rank ASC,
          r.id DESC
      ) AS rn
    FROM ranked r
  ) x
  WHERE x.rn = 1
)
SELECT
  c.chassis_key,
  c.source_name,
  c.id,
  c.created_at,
  c.registration_no,
  c.odometer_reading,
  c.serviced_at_dealer,
  c.service_date_time,
  c.contact_full_name,
  c.sr_type,
  c.service_priority,
  c.parsed_service_ts
FROM chosen c
ORDER BY c.service_priority ASC, c.parsed_service_ts DESC NULLS LAST, c.chassis_key
LIMIT 100;

-- ============================================================
-- B) Pre-apply impact preview (same update conditions)
-- ============================================================

WITH source_union AS (
  SELECT
    h.id,
    upper(btrim(h.chassis_no)) AS chassis_key,
    h.registration_no,
    h.odometer_reading,
    h.serviced_at_dealer,
    h.sr_type,
    h.service_date_time,
    h.contact_full_name,
    h.created_at,
    1::int AS source_rank
  FROM public."EV_Service_History" h
  WHERE nullif(btrim(h.chassis_no), '') IS NOT NULL

  UNION ALL

  SELECT
    h.id,
    upper(btrim(h.chassis_no)) AS chassis_key,
    h.registration_no,
    h.odometer_reading,
    h.serviced_at_dealer,
    h.sr_type,
    h.service_date_time,
    h.contact_full_name,
    h.created_at,
    2::int AS source_rank
  FROM public."PV_Service_History" h
  WHERE nullif(btrim(h.chassis_no), '') IS NOT NULL
),
ranked AS (
  SELECT
    su.*,
    CASE
      WHEN lower(coalesce(su.sr_type, '')) LIKE '%service%' THEN 0
      ELSE 1
    END AS service_priority,
    CASE
      WHEN btrim(coalesce(su.service_date_time, '')) ~* '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}\s+[0-9]{1,2}:[0-9]{2}\s*(AM|PM)$'
        THEN to_timestamp(upper(btrim(su.service_date_time)), 'DD/MM/YYYY HH12:MI AM')
      ELSE NULL
    END AS parsed_service_ts
  FROM source_union su
),
chosen AS (
  SELECT
    x.chassis_key,
    x.registration_no,
    x.odometer_reading,
    x.serviced_at_dealer,
    x.sr_type,
    x.service_date_time,
    CASE
      WHEN x.parsed_service_ts IS NOT NULL THEN to_char(x.parsed_service_ts::date, 'DD/MM/YY')
      ELSE NULL
    END AS normalized_last_service_date,
    x.contact_full_name,
    x.created_at
  FROM (
    SELECT
      r.*,
      row_number() OVER (
        PARTITION BY r.chassis_key
        ORDER BY
          r.service_priority ASC,
          r.parsed_service_ts DESC NULLS LAST,
          r.created_at DESC NULLS LAST,
          r.source_rank ASC,
          r.id DESC
      ) AS rn
    FROM ranked r
  ) x
  WHERE x.rn = 1
)
SELECT
  count(*) AS rows_that_would_update
FROM public.all_service_data t
JOIN chosen c
  ON upper(btrim(t.chassis_no)) = c.chassis_key
WHERE
  t.vehicle_registration_number IS DISTINCT FROM COALESCE(c.registration_no, t.vehicle_registration_number)
  OR t.updated_by_robot IS DISTINCT FROM true
  OR t.updated_by_robot_at IS DISTINCT FROM c.created_at
  OR t.last_service_km IS DISTINCT FROM COALESCE(c.odometer_reading, t.last_service_km)
  OR t.last_service_dealer IS DISTINCT FROM COALESCE(c.serviced_at_dealer, t.last_service_dealer)
  OR t.last_service_date IS DISTINCT FROM COALESCE(c.normalized_last_service_date, t.last_service_date)
  OR t.first_name IS DISTINCT FROM COALESCE(c.contact_full_name, t.first_name)
  OR t.last_service_type IS DISTINCT FROM COALESCE(c.sr_type, t.last_service_type);

-- ============================================================
-- C) Post-apply verification
-- ============================================================

-- C1) Trigger presence check on both Service-History tables.
SELECT
  t.tgname AS trigger_name,
  c.relname AS table_name,
  t.tgenabled,
  pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('EV_Service_History', 'PV_Service_History')
  AND t.tgname IN (
    'trg_sync_all_service_data_from_ev_service_history',
    'trg_sync_all_service_data_from_pv_service_history'
  )
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- C2) Function presence check.
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_function_result(p.oid) AS returns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'refresh_all_service_data_from_service_history',
    'trg_sync_all_service_data_from_service_history'
  )
ORDER BY p.proname;

-- C3) Post-apply mismatch count for mapped fields and robot audit fields.
WITH source_union AS (
  SELECT
    h.id,
    upper(btrim(h.chassis_no)) AS chassis_key,
    h.registration_no,
    h.odometer_reading,
    h.serviced_at_dealer,
    h.sr_type,
    h.service_date_time,
    h.contact_full_name,
    h.created_at,
    1::int AS source_rank
  FROM public."EV_Service_History" h
  WHERE nullif(btrim(h.chassis_no), '') IS NOT NULL

  UNION ALL

  SELECT
    h.id,
    upper(btrim(h.chassis_no)) AS chassis_key,
    h.registration_no,
    h.odometer_reading,
    h.serviced_at_dealer,
    h.sr_type,
    h.service_date_time,
    h.contact_full_name,
    h.created_at,
    2::int AS source_rank
  FROM public."PV_Service_History" h
  WHERE nullif(btrim(h.chassis_no), '') IS NOT NULL
),
ranked AS (
  SELECT
    su.*,
    CASE
      WHEN lower(coalesce(su.sr_type, '')) LIKE '%service%' THEN 0
      ELSE 1
    END AS service_priority,
    CASE
      WHEN btrim(coalesce(su.service_date_time, '')) ~* '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}\s+[0-9]{1,2}:[0-9]{2}\s*(AM|PM)$'
        THEN to_timestamp(upper(btrim(su.service_date_time)), 'DD/MM/YYYY HH12:MI AM')
      ELSE NULL
    END AS parsed_service_ts
  FROM source_union su
),
chosen AS (
  SELECT
    x.chassis_key,
    x.registration_no,
    x.odometer_reading,
    x.serviced_at_dealer,
    x.sr_type,
    x.service_date_time,
    CASE
      WHEN x.parsed_service_ts IS NOT NULL THEN to_char(x.parsed_service_ts::date, 'DD/MM/YY')
      ELSE NULL
    END AS normalized_last_service_date,
    x.contact_full_name,
    x.created_at
  FROM (
    SELECT
      r.*,
      row_number() OVER (
        PARTITION BY r.chassis_key
        ORDER BY
          r.service_priority ASC,
          r.parsed_service_ts DESC NULLS LAST,
          r.created_at DESC NULLS LAST,
          r.source_rank ASC,
          r.id DESC
      ) AS rn
    FROM ranked r
  ) x
  WHERE x.rn = 1
)
SELECT
  count(*) AS matched_rows_with_mapped_field_mismatch
FROM public.all_service_data t
JOIN chosen c
  ON upper(btrim(t.chassis_no)) = c.chassis_key
WHERE
  t.vehicle_registration_number IS DISTINCT FROM COALESCE(c.registration_no, t.vehicle_registration_number)
  OR t.updated_by_robot IS DISTINCT FROM true
  OR t.updated_by_robot_at IS DISTINCT FROM c.created_at
  OR t.last_service_km IS DISTINCT FROM COALESCE(c.odometer_reading, t.last_service_km)
  OR t.last_service_dealer IS DISTINCT FROM COALESCE(c.serviced_at_dealer, t.last_service_dealer)
  OR t.last_service_date IS DISTINCT FROM COALESCE(c.normalized_last_service_date, t.last_service_date)
  OR t.first_name IS DISTINCT FROM COALESCE(c.contact_full_name, t.first_name)
  OR t.last_service_type IS DISTINCT FROM COALESCE(c.sr_type, t.last_service_type);
