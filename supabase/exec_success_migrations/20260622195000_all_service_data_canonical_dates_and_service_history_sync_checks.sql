-- Read-only validation checks for canonical date migration path:
-- 1) supabase/migrations/20260622193000_all_service_data_add_canonical_date_columns_backfill.sql
-- 2) supabase/migrations/20260622194000_service_history_sync_write_canonical_datetime_columns.sql
--
-- Run sequence:
-- - Run sections A+B before migrations (coverage + impact baseline).
-- - Apply migration 20260622193000.
-- - Apply migration 20260622194000.
-- - Run sections C+D+E for post-apply verification.

-- Session-local parser helpers so this checks file can run before migrations.
-- These do not persist after the SQL session ends.
CREATE OR REPLACE FUNCTION pg_temp.parse_legacy_date_text(p_text text)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
BEGIN
  v := nullif(btrim(coalesce(p_text, '')), '');

  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  IF v ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN
    RETURN to_date(v, 'DD/MM/YYYY');
  ELSIF v ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$' THEN
    RETURN to_date(v, 'DD/MM/YY');
  ELSIF v ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' THEN
    RETURN to_date(v, 'YYYY/MM/DD');
  ELSIF v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN to_date(v, 'YYYY-MM-DD');
  END IF;

  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.parse_service_history_datetime_ist(p_text text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
  m text[];
  dd integer;
  mm integer;
  yy integer;
  hh integer;
  mi integer;
  ampm text;
  hh24 integer;
BEGIN
  v := nullif(upper(btrim(coalesce(p_text, ''))), '');

  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  m := regexp_match(v, '^([0-9]{2})/([0-9]{2})/([0-9]{4})\s+([0-9]{1,2}):([0-9]{2})\s*(AM|PM)$');

  IF m IS NULL THEN
    RETURN NULL;
  END IF;

  dd := m[1]::integer;
  mm := m[2]::integer;
  yy := m[3]::integer;
  hh := m[4]::integer;
  mi := m[5]::integer;
  ampm := m[6];

  IF hh < 1 OR hh > 12 OR mi < 0 OR mi > 59 THEN
    RETURN NULL;
  END IF;

  IF ampm = 'AM' THEN
    hh24 := CASE WHEN hh = 12 THEN 0 ELSE hh END;
  ELSE
    hh24 := CASE WHEN hh = 12 THEN 12 ELSE hh + 12 END;
  END IF;

  RETURN make_timestamptz(yy, mm, dd, hh24, mi, 0, 'Asia/Kolkata');
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ============================================================
-- A) Authoritative parse coverage (all_service_data legacy text -> canonical typed)
-- ============================================================

SELECT
  count(*) AS total_rows,
  count(*) FILTER (WHERE nullif(btrim(coalesce(scheduled_next_service_date, '')), '') IS NOT NULL) AS scheduled_next_service_date_non_null,
  count(*) FILTER (
    WHERE nullif(btrim(coalesce(scheduled_next_service_date, '')), '') IS NOT NULL
      AND pg_temp.parse_legacy_date_text(scheduled_next_service_date) IS NOT NULL
  ) AS scheduled_next_service_date_parseable,

  count(*) FILTER (WHERE nullif(btrim(coalesce(vehicle_sale_date, '')), '') IS NOT NULL) AS vehicle_sale_date_non_null,
  count(*) FILTER (
    WHERE nullif(btrim(coalesce(vehicle_sale_date, '')), '') IS NOT NULL
      AND pg_temp.parse_legacy_date_text(vehicle_sale_date) IS NOT NULL
  ) AS vehicle_sale_date_parseable,

  count(*) FILTER (WHERE nullif(btrim(coalesce(last_service_date, '')), '') IS NOT NULL) AS last_service_date_non_null,
  count(*) FILTER (
    WHERE nullif(btrim(coalesce(last_service_date, '')), '') IS NOT NULL
      AND (
        pg_temp.parse_service_history_datetime_ist(last_service_date) IS NOT NULL
        OR pg_temp.parse_legacy_date_text(last_service_date) IS NOT NULL
      )
  ) AS last_service_date_parseable_to_canonical
FROM public.all_service_data;

-- ============================================================
-- B) Service_History source format coverage
-- ============================================================

WITH source_union AS (
  SELECT 'EV'::text AS source_name, service_date_time
  FROM public."EV_Service_History"
  UNION ALL
  SELECT 'PV'::text AS source_name, service_date_time
  FROM public."PV_Service_History"
)
SELECT
  source_name,
  count(*) AS total_rows,
  count(*) FILTER (WHERE nullif(btrim(coalesce(service_date_time, '')), '') IS NOT NULL) AS non_null_service_date_time,
  count(*) FILTER (
    WHERE nullif(btrim(coalesce(service_date_time, '')), '') IS NOT NULL
      AND pg_temp.parse_service_history_datetime_ist(service_date_time) IS NOT NULL
  ) AS parseable_service_date_time,
  count(*) FILTER (
    WHERE nullif(btrim(coalesce(service_date_time, '')), '') IS NOT NULL
      AND pg_temp.parse_service_history_datetime_ist(service_date_time) IS NULL
  ) AS non_parseable_service_date_time
FROM source_union
GROUP BY source_name
ORDER BY source_name;

-- ============================================================
-- C) Post-apply mismatches for canonical backfill columns
-- ============================================================

WITH expected AS (
  SELECT
    t.id,
    pg_temp.parse_legacy_date_text(t.scheduled_next_service_date) AS expected_scheduled_next_service_on,
    pg_temp.parse_legacy_date_text(t.vehicle_sale_date) AS expected_vehicle_sale_on,
    COALESCE(
      pg_temp.parse_service_history_datetime_ist(t.last_service_date),
      CASE
        WHEN pg_temp.parse_legacy_date_text(t.last_service_date) IS NOT NULL THEN make_timestamptz(
          EXTRACT(YEAR FROM pg_temp.parse_legacy_date_text(t.last_service_date))::integer,
          EXTRACT(MONTH FROM pg_temp.parse_legacy_date_text(t.last_service_date))::integer,
          EXTRACT(DAY FROM pg_temp.parse_legacy_date_text(t.last_service_date))::integer,
          0,
          0,
          0,
          'Asia/Kolkata'
        )
        ELSE NULL
      END
    ) AS expected_last_service_at
  FROM public.all_service_data t
)
SELECT
  count(*) FILTER (
    WHERE t.scheduled_next_service_on IS DISTINCT FROM e.expected_scheduled_next_service_on
  ) AS scheduled_next_service_on_mismatch,
  count(*) FILTER (
    WHERE t.vehicle_sale_on IS DISTINCT FROM e.expected_vehicle_sale_on
  ) AS vehicle_sale_on_mismatch,
  count(*) FILTER (
    WHERE t.last_service_at IS DISTINCT FROM e.expected_last_service_at
  ) AS last_service_at_mismatch
FROM public.all_service_data t
JOIN expected e ON e.id = t.id;

-- ============================================================
-- D) Post-apply mismatches for Service_History-driven sync result
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
    pg_temp.parse_service_history_datetime_ist(su.service_date_time) AS parsed_service_at
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
    x.contact_full_name,
    x.created_at,
    x.parsed_service_at,
    CASE
      WHEN x.parsed_service_at IS NOT NULL
        THEN to_char((x.parsed_service_at AT TIME ZONE 'Asia/Kolkata')::date, 'DD/MM/YY')
      ELSE NULL
    END AS expected_last_service_date_text
  FROM (
    SELECT
      r.*,
      row_number() OVER (
        PARTITION BY r.chassis_key
        ORDER BY
          r.service_priority ASC,
          r.parsed_service_at DESC NULLS LAST,
          r.created_at DESC NULLS LAST,
          r.source_rank ASC,
          r.id DESC
      ) AS rn
    FROM ranked r
  ) x
  WHERE x.rn = 1
)
SELECT
  count(*) AS matched_rows,
  count(*) FILTER (
    WHERE t.vehicle_registration_number IS DISTINCT FROM COALESCE(c.registration_no, t.vehicle_registration_number)
  ) AS vehicle_registration_number_mismatch,
  count(*) FILTER (
    WHERE t.updated_by_robot IS DISTINCT FROM true
  ) AS updated_by_robot_mismatch,
  count(*) FILTER (
    WHERE t.updated_by_robot_at IS DISTINCT FROM c.created_at
  ) AS updated_by_robot_at_mismatch,
  count(*) FILTER (
    WHERE t.last_service_km IS DISTINCT FROM COALESCE(c.odometer_reading, t.last_service_km)
  ) AS last_service_km_mismatch,
  count(*) FILTER (
    WHERE t.last_service_dealer IS DISTINCT FROM COALESCE(c.serviced_at_dealer, t.last_service_dealer)
  ) AS last_service_dealer_mismatch,
  count(*) FILTER (
    WHERE t.last_service_at IS DISTINCT FROM COALESCE(c.parsed_service_at, t.last_service_at)
  ) AS last_service_at_mismatch,
  count(*) FILTER (
    WHERE t.last_service_date IS DISTINCT FROM COALESCE(c.expected_last_service_date_text, t.last_service_date)
  ) AS last_service_date_text_mismatch,
  count(*) FILTER (
    WHERE t.first_name IS DISTINCT FROM COALESCE(c.contact_full_name, t.first_name)
  ) AS first_name_mismatch,
  count(*) FILTER (
    WHERE t.last_service_type IS DISTINCT FROM COALESCE(c.sr_type, t.last_service_type)
  ) AS last_service_type_mismatch
FROM public.all_service_data t
JOIN chosen c
  ON upper(btrim(t.chassis_no)) = c.chassis_key;

-- ============================================================
-- E) Post-apply parity for canonical typed columns in dynamic table
-- ============================================================

SELECT
  count(*) AS dynamic_rows_checked,
  count(*) FILTER (
    WHERE d.last_service_at IS DISTINCT FROM s.last_service_at
  ) AS dynamic_last_service_at_mismatch,
  count(*) FILTER (
    WHERE d.scheduled_next_service_on IS DISTINCT FROM s.scheduled_next_service_on
  ) AS dynamic_scheduled_next_service_on_mismatch,
  count(*) FILTER (
    WHERE d.vehicle_sale_on IS DISTINCT FROM s.vehicle_sale_on
  ) AS dynamic_vehicle_sale_on_mismatch
FROM public.all_service_data_dynamic d
JOIN public.all_service_data s
  ON s.id = d.id;
