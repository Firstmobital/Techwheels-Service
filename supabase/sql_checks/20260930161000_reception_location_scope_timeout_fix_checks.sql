-- RECEPTION-003 / DBL-0089
-- Read-only verification for 20260930161000_reception_location_scope_timeout_fix.sql.

-- 1) Both list RPCs must resolve Reception location once and must not call
--    the per-row scope helper in their Reception row predicates.
WITH defs AS (
  SELECT
    'page'::text AS fn,
    pg_get_functiondef(
      'public.list_reception_entries_page(timestamptz,timestamptz,integer,timestamptz,bigint,text[],text,boolean)'::regprocedure
    ) AS def
  UNION ALL
  SELECT
    'recent_reg'::text,
    pg_get_functiondef(
      'public.list_reception_reg_created_since(timestamptz)'::regprocedure
    )
)
SELECT
  fn,
  position('v_reception_location_key' IN def) > 0 AS has_one_time_location_key,
  position('normalize_employee_location_key(r.location)' IN def) > 0 AS filters_persisted_location,
  position('user_has_reception_location_scope_for_sa_code(r.sa_employee_code)' IN def) = 0
    AS no_per_row_reception_scope_helper
FROM defs
ORDER BY fn;

-- Expected: all three boolean columns true for both rows.

-- 2) DBL-0088 backfill remains complete for rows the SA-location resolver can classify.
WITH resolved AS (
  SELECT
    r.id,
    public.reception_sa_location_key(r.sa_employee_code) AS location_key,
    public.normalize_employee_location_key(
      COALESCE(NULLIF(btrim(r.location), ''), NULLIF(btrim(r.branch), ''))
    ) AS stored_location_key
  FROM public.service_reception_entries r
  WHERE NULLIF(btrim(coalesce(r.sa_employee_code, '')), '') IS NOT NULL
)
SELECT
  count(*) FILTER (WHERE location_key IS NOT NULL) AS resolvable_rows,
  count(*) FILTER (
    WHERE location_key IS NOT NULL
      AND stored_location_key IS NULL
  ) AS resolvable_rows_missing_persisted_location,
  count(*) FILTER (
    WHERE location_key IS NOT NULL
      AND stored_location_key IS DISTINCT FROM location_key
  ) AS resolved_location_mismatches
FROM resolved;

-- Expected: both defect counters = 0.

-- 3) Existing indexes that support time/page and location reads remain present.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'service_reception_entries'
  AND indexname IN (
    'idx_sre_created_at_id_desc',
    'idx_sre_location_portal',
    'idx_reception_entries_branch_created_at_desc'
  )
ORDER BY indexname;

-- Expected: 3 rows.

-- 4) No migration-side data mutation is present in DBL-0089.
-- Manual repository review should confirm the migration contains only
-- CREATE OR REPLACE FUNCTION / COMMENT statements and no INSERT/UPDATE/DELETE.
