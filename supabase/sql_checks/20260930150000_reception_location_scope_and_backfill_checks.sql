-- RECEPTION-003 / DBL-0088
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Read-only verification for 20260930150000_reception_location_scope_and_backfill.sql.

-- 1) Required helper functions exist with expected security posture.
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'reception_sa_location_key',
    'user_has_reception_location_scope_for_sa_code',
    'list_reception_entries_page',
    'list_reception_reg_created_since'
  )
ORDER BY p.proname, args;

-- 2) Legacy SA-code fallback contract.
SELECT
  public.reception_sa_location_key('3001440_001') AS ajmer_prefix,
  public.reception_sa_location_key('EPM_3001440') AS ajmer_suffix,
  public.reception_sa_location_key('3000840_001') AS sitapura_pv_prefix,
  public.reception_sa_location_key('EPM_3000840') AS sitapura_pv_suffix,
  public.reception_sa_location_key('500A840_001') AS sitapura_ev_prefix,
  public.reception_sa_location_key('EPM_500A840') AS sitapura_ev_suffix;

-- Expected:
-- ajmer_prefix/ajmer_suffix = AJMER ROAD
-- all Sitapura columns = SITAPURA

-- 3) Page/list function definitions must contain dedicated Reception location scope
-- and must not use Reception employee-code ownership for that dedicated branch.
SELECT
  position(
    'user_has_reception_location_scope_for_sa_code'
    IN pg_get_functiondef('public.list_reception_entries_page(timestamptz,timestamptz,integer,timestamptz,bigint,text[],text,boolean)'::regprocedure)
  ) > 0 AS page_has_location_scope,
  position(
    'user_has_reception_location_scope_for_sa_code'
    IN pg_get_functiondef('public.list_reception_reg_created_since(timestamptz)'::regprocedure)
  ) > 0 AS recent_reg_has_location_scope;

-- 4) Historical display-field backfill completeness for rows whose SA location can be resolved.
WITH resolved AS (
  SELECT
    r.id,
    public.reception_sa_location_key(r.sa_employee_code) AS location_key,
    NULLIF(btrim(r.branch), '') AS branch,
    NULLIF(btrim(r.location), '') AS location,
    NULLIF(btrim(r.branch_label), '') AS branch_label
  FROM public.service_reception_entries r
  WHERE NULLIF(btrim(coalesce(r.sa_employee_code, '')), '') IS NOT NULL
)
SELECT
  count(*) FILTER (WHERE location_key IN ('SITAPURA', 'AJMER ROAD')) AS resolvable_rows,
  count(*) FILTER (
    WHERE location_key IN ('SITAPURA', 'AJMER ROAD')
      AND (branch IS NULL OR location IS NULL OR branch_label IS NULL)
  ) AS resolvable_rows_still_missing_display_location
FROM resolved;

-- Expected: resolvable_rows_still_missing_display_location = 0.

-- 5) Backfill must not manufacture an unsupported location for known legacy dealer codes.
SELECT
  count(*) AS legacy_code_location_mismatches
FROM public.service_reception_entries r
WHERE NULLIF(btrim(coalesce(r.sa_employee_code, '')), '') IS NOT NULL
  AND (
    (
      upper(r.sa_employee_code) LIKE '%3001440%'
      AND public.normalize_employee_location_key(COALESCE(NULLIF(btrim(r.location), ''), NULLIF(btrim(r.branch), ''))) IS DISTINCT FROM 'AJMER ROAD'
    )
    OR
    (
      (upper(r.sa_employee_code) LIKE '%3000840%' OR upper(r.sa_employee_code) LIKE '%500A840%')
      AND public.normalize_employee_location_key(COALESCE(NULLIF(btrim(r.location), ''), NULLIF(btrim(r.branch), ''))) IS DISTINCT FROM 'SITAPURA'
    )
  );

-- Expected: 0, except where Employee Master intentionally overrides a legacy-code fallback.
-- If non-zero, inspect those employees before treating as failure:
SELECT
  r.id,
  r.sa_employee_code,
  r.branch,
  r.location,
  em.employee_code,
  em.location AS employee_master_location
FROM public.service_reception_entries r
LEFT JOIN public.employee_master em
  ON upper(btrim(em.employee_code)) = upper(btrim(r.sa_employee_code))
WHERE NULLIF(btrim(coalesce(r.sa_employee_code, '')), '') IS NOT NULL
  AND public.reception_sa_location_key(r.sa_employee_code) IS NOT NULL
  AND public.normalize_employee_location_key(COALESCE(NULLIF(btrim(r.location), ''), NULLIF(btrim(r.branch), '')))
      IS DISTINCT FROM public.reception_sa_location_key(r.sa_employee_code)
ORDER BY r.id
LIMIT 100;
