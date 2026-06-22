-- Read-only validation checks for column type correction migration:
-- supabase/migrations/20260622191000_correct_all_service_data_column_types_to_supabase_defaults.sql
--
-- Run sequence:
-- - Run sections A+B before migration (parse coverage baseline).
-- - Apply migration 20260622191000.
-- - Run sections C+D for post-apply verification.

-- ============================================================
-- A) Pre-apply: parse coverage for legacy text date columns
-- ============================================================

WITH parsing AS (
  SELECT
    id,
    vehicle_sale_date,
    CASE
      WHEN nullif(btrim(coalesce(vehicle_sale_date, '')), '') IS NULL THEN NULL::date
      WHEN btrim(vehicle_sale_date) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(btrim(vehicle_sale_date), 'DD/MM/YYYY')
      WHEN btrim(vehicle_sale_date) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$' THEN to_date(btrim(vehicle_sale_date), 'DD/MM/YY')
      WHEN btrim(vehicle_sale_date) ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{4}$' THEN to_date(initcap(lower(btrim(vehicle_sale_date))), 'DD-Mon-YYYY')
      WHEN btrim(vehicle_sale_date) ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{2}$' THEN to_date(initcap(lower(btrim(vehicle_sale_date))), 'DD-Mon-YY')
      WHEN btrim(vehicle_sale_date) ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}$' THEN to_date(btrim(vehicle_sale_date), 'DD-MM-YYYY')
      WHEN btrim(vehicle_sale_date) ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN to_date(btrim(vehicle_sale_date), 'DD-MM-YY')
      WHEN btrim(vehicle_sale_date) ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' THEN to_date(btrim(vehicle_sale_date), 'YYYY/MM/DD')
      WHEN btrim(vehicle_sale_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN to_date(btrim(vehicle_sale_date), 'YYYY-MM-DD')
      WHEN btrim(vehicle_sale_date) ~ '^[0-9]{5}$' THEN (DATE '1899-12-30' + btrim(vehicle_sale_date)::integer)
      WHEN btrim(vehicle_sale_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?$' THEN (btrim(vehicle_sale_date)::timestamp)::date
      ELSE NULL::date
    END AS parsed_vehicle_sale_on,

    scheduled_next_service_date,
    CASE
      WHEN nullif(btrim(coalesce(scheduled_next_service_date, '')), '') IS NULL THEN NULL::date
      WHEN btrim(scheduled_next_service_date) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(btrim(scheduled_next_service_date), 'DD/MM/YYYY')
      WHEN btrim(scheduled_next_service_date) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$' THEN to_date(btrim(scheduled_next_service_date), 'DD/MM/YY')
      WHEN btrim(scheduled_next_service_date) ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{4}$' THEN to_date(initcap(lower(btrim(scheduled_next_service_date))), 'DD-Mon-YYYY')
      WHEN btrim(scheduled_next_service_date) ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{2}$' THEN to_date(initcap(lower(btrim(scheduled_next_service_date))), 'DD-Mon-YY')
      WHEN btrim(scheduled_next_service_date) ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}$' THEN to_date(btrim(scheduled_next_service_date), 'DD-MM-YYYY')
      WHEN btrim(scheduled_next_service_date) ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN to_date(btrim(scheduled_next_service_date), 'DD-MM-YY')
      WHEN btrim(scheduled_next_service_date) ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' THEN to_date(btrim(scheduled_next_service_date), 'YYYY/MM/DD')
      WHEN btrim(scheduled_next_service_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN to_date(btrim(scheduled_next_service_date), 'YYYY-MM-DD')
      WHEN btrim(scheduled_next_service_date) ~ '^[0-9]{5}$' THEN (DATE '1899-12-30' + btrim(scheduled_next_service_date)::integer)
      WHEN btrim(scheduled_next_service_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?$' THEN (btrim(scheduled_next_service_date)::timestamp)::date
      ELSE NULL::date
    END AS parsed_scheduled_next_service_on,

    extended_warranty_start_date,
    CASE
      WHEN nullif(btrim(coalesce(extended_warranty_start_date, '')), '') IS NULL THEN NULL::date
      WHEN btrim(extended_warranty_start_date) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(btrim(extended_warranty_start_date), 'DD/MM/YYYY')
      WHEN btrim(extended_warranty_start_date) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$' THEN to_date(btrim(extended_warranty_start_date), 'DD/MM/YY')
      WHEN btrim(extended_warranty_start_date) ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{4}$' THEN to_date(initcap(lower(btrim(extended_warranty_start_date))), 'DD-Mon-YYYY')
      WHEN btrim(extended_warranty_start_date) ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{2}$' THEN to_date(initcap(lower(btrim(extended_warranty_start_date))), 'DD-Mon-YY')
      WHEN btrim(extended_warranty_start_date) ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}$' THEN to_date(btrim(extended_warranty_start_date), 'DD-MM-YYYY')
      WHEN btrim(extended_warranty_start_date) ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN to_date(btrim(extended_warranty_start_date), 'DD-MM-YY')
      WHEN btrim(extended_warranty_start_date) ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' THEN to_date(btrim(extended_warranty_start_date), 'YYYY/MM/DD')
      WHEN btrim(extended_warranty_start_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN to_date(btrim(extended_warranty_start_date), 'YYYY-MM-DD')
      WHEN btrim(extended_warranty_start_date) ~ '^[0-9]{5}$' THEN (DATE '1899-12-30' + btrim(extended_warranty_start_date)::integer)
      WHEN btrim(extended_warranty_start_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?$' THEN (btrim(extended_warranty_start_date)::timestamp)::date
      ELSE NULL::date
    END AS parsed_extended_warranty_start_on,

    extended_warranty_end_date,
    CASE
      WHEN nullif(btrim(coalesce(extended_warranty_end_date, '')), '') IS NULL THEN NULL::date
      WHEN btrim(extended_warranty_end_date) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(btrim(extended_warranty_end_date), 'DD/MM/YYYY')
      WHEN btrim(extended_warranty_end_date) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$' THEN to_date(btrim(extended_warranty_end_date), 'DD/MM/YY')
      WHEN btrim(extended_warranty_end_date) ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{4}$' THEN to_date(initcap(lower(btrim(extended_warranty_end_date))), 'DD-Mon-YYYY')
      WHEN btrim(extended_warranty_end_date) ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{2}$' THEN to_date(initcap(lower(btrim(extended_warranty_end_date))), 'DD-Mon-YY')
      WHEN btrim(extended_warranty_end_date) ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}$' THEN to_date(btrim(extended_warranty_end_date), 'DD-MM-YYYY')
      WHEN btrim(extended_warranty_end_date) ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN to_date(btrim(extended_warranty_end_date), 'DD-MM-YY')
      WHEN btrim(extended_warranty_end_date) ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' THEN to_date(btrim(extended_warranty_end_date), 'YYYY/MM/DD')
      WHEN btrim(extended_warranty_end_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN to_date(btrim(extended_warranty_end_date), 'YYYY-MM-DD')
      WHEN btrim(extended_warranty_end_date) ~ '^[0-9]{5}$' THEN (DATE '1899-12-30' + btrim(extended_warranty_end_date)::integer)
      WHEN btrim(extended_warranty_end_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?$' THEN (btrim(extended_warranty_end_date)::timestamp)::date
      ELSE NULL::date
    END AS parsed_extended_warranty_end_on
  FROM public.all_service_data
)
SELECT
  count(*) AS total_rows,
  count(*) FILTER (WHERE nullif(btrim(coalesce(vehicle_sale_date, '')), '') IS NOT NULL) AS vehicle_sale_date_non_null,
  count(*) FILTER (WHERE parsed_vehicle_sale_on IS NOT NULL) AS vehicle_sale_date_parseable,
  count(*) FILTER (WHERE nullif(btrim(coalesce(scheduled_next_service_date, '')), '') IS NOT NULL) AS scheduled_next_service_date_non_null,
  count(*) FILTER (WHERE parsed_scheduled_next_service_on IS NOT NULL) AS scheduled_next_service_date_parseable,
  count(*) FILTER (WHERE nullif(btrim(coalesce(extended_warranty_start_date, '')), '') IS NOT NULL) AS extended_warranty_start_date_non_null,
  count(*) FILTER (WHERE parsed_extended_warranty_start_on IS NOT NULL) AS extended_warranty_start_date_parseable,
  count(*) FILTER (WHERE nullif(btrim(coalesce(extended_warranty_end_date, '')), '') IS NOT NULL) AS extended_warranty_end_date_non_null,
  count(*) FILTER (WHERE parsed_extended_warranty_end_on IS NOT NULL) AS extended_warranty_end_date_parseable
FROM parsing;

-- ============================================================
-- B) Pre-apply: parse coverage for last_service_date (mixed format)
-- ============================================================

WITH parsing AS (
  SELECT
    last_service_date,
    CASE
      WHEN upper(btrim(coalesce(last_service_date, ''))) ~ '^([0-9]{2})/([0-9]{2})/([0-9]{4})\s+([0-9]{1,2}):([0-9]{2})\s*(AM|PM)$'
      THEN 'datetime_ist'
      WHEN btrim(last_service_date) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
        OR btrim(last_service_date) ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$'
        OR btrim(last_service_date) ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{4}$'
        OR btrim(last_service_date) ~ '^[0-9]{2}-[A-Za-z]{3}-[0-9]{2}$'
        OR btrim(last_service_date) ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$'
        OR btrim(last_service_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN 'date_only'
      ELSE 'unparseable'
    END AS format_detected
  FROM public.all_service_data
  WHERE nullif(btrim(coalesce(last_service_date, '')), '') IS NOT NULL
)
SELECT
  count(*) AS total_non_null_last_service_date,
  count(*) FILTER (WHERE format_detected = 'datetime_ist') AS datetime_ist_format,
  count(*) FILTER (WHERE format_detected = 'date_only') AS date_only_format,
  count(*) FILTER (WHERE format_detected = 'unparseable') AS unparseable_format
FROM parsing;

-- ============================================================
-- C) Post-apply: verify in-place column types on existing columns
-- ============================================================

SELECT
  c.column_name,
  c.data_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'all_service_data'
  AND c.column_name IN (
    'vehicle_sale_date',
    'scheduled_next_service_date',
    'extended_warranty_start_date',
    'extended_warranty_end_date',
    'last_service_date'
  )
ORDER BY c.column_name;

SELECT
  count(*) AS total_rows,
  count(*) FILTER (WHERE vehicle_sale_date IS NOT NULL) AS vehicle_sale_date_non_null_after,
  count(*) FILTER (WHERE scheduled_next_service_date IS NOT NULL) AS scheduled_next_service_date_non_null_after,
  count(*) FILTER (WHERE extended_warranty_start_date IS NOT NULL) AS extended_warranty_start_date_non_null_after,
  count(*) FILTER (WHERE extended_warranty_end_date IS NOT NULL) AS extended_warranty_end_date_non_null_after,
  count(*) FILTER (WHERE last_service_date IS NOT NULL) AS last_service_date_non_null_after
FROM public.all_service_data;

-- ============================================================
-- D) Post-apply: sample rows from in-place converted existing columns
-- ============================================================

SELECT
  id,
  vehicle_sale_date,
  scheduled_next_service_date,
  extended_warranty_start_date,
  extended_warranty_end_date,
  last_service_date,
  pg_typeof(last_service_date)::text AS last_service_date_type,
  updated_by_robot_at
FROM public.all_service_data
WHERE (
  vehicle_sale_date IS NOT NULL
  OR scheduled_next_service_date IS NOT NULL
  OR last_service_date IS NOT NULL
)
ORDER BY id DESC
LIMIT 10;
