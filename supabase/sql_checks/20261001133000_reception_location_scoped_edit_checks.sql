-- RECEPTION-003 / DBL-0091
-- Read-only verification for 20261001133000_reception_location_scoped_edit.sql.

-- 1) update_reception_entry must retain SECURITY DEFINER and contain the
-- dedicated Reception location authorization path.
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  position('v_reception_location_only' IN pg_get_functiondef(p.oid)) > 0
    AS has_dedicated_reception_edit_scope,
  position('v_existing_location_key = v_reception_location_key' IN pg_get_functiondef(p.oid)) > 0
    AS checks_existing_entry_location,
  position('reception_sa_location_key(p_sa_employee_code) IS DISTINCT FROM v_reception_location_key' IN pg_get_functiondef(p.oid)) > 0
    AS checks_selected_sa_location,
  position('dealer_code_in_scope(v_dealer_code)' IN pg_get_functiondef(p.oid)) > 0
    AS preserves_dealer_scoped_fallback
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid = 'public.update_reception_entry(bigint,text,text,text,text,text,text,text,integer,text,text,text)'::regprocedure;

-- Expected: one row; all boolean columns true.

-- 2) Existing helper contracts required by the edit authorization must exist.
SELECT
  p.proname,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'reception_sa_location_key',
    'normalize_employee_location_key',
    'employee_has_business_role'
  )
ORDER BY p.proname;

-- Expected: three rows. reception_sa_location_key is SECURITY DEFINER.
-- normalize_employee_location_key / employee_has_business_role retain their
-- existing security posture.

-- 3) Authorization must still require Reception MODIFY for non-admin callers.
SELECT
  position(
    'public.has_module_modify(''reception''::text)'
    IN pg_get_functiondef(
      'public.update_reception_entry(bigint,text,text,text,text,text,text,text,integer,text,text,text)'::regprocedure
    )
  ) > 0 AS requires_reception_modify;

-- Expected: true.

-- 4) No data/schema/table/policy mutation is part of DBL-0091.
-- Manual repository review should confirm the migration only replaces
-- update_reception_entry() and its COMMENT.
