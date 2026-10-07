-- Paired checks: supabase/migrations/20261007120000_busy_parts_source_status_rpc.sql

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_busy_parts_source_status'
) AS get_busy_parts_source_status_exists;

SELECT
  p.prosecdef AS security_definer,
  pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_busy_parts_source_status';

-- Staff with busy module view (non platform-admin)
DO $$
DECLARE
  v_staff uuid := '69543aef-3bd7-4280-a0a3-292c523c3f35';
  v_payload jsonb;
  v_pv_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff::text, 'role', 'authenticated')::text,
    true
  );

  IF NOT public.has_module_view('busy') THEN
    RAISE EXCEPTION 'fixture staff must have busy view';
  END IF;
  IF public.is_admin() THEN
    RAISE EXCEPTION 'fixture staff must not be platform admin';
  END IF;

  v_payload := public.get_busy_parts_source_status();
  v_pv_count := (v_payload -> 'pv' ->> 'count')::integer;
  IF v_pv_count IS NULL OR v_pv_count < 0 THEN
    RAISE EXCEPTION 'unexpected pv count %', v_pv_count;
  END IF;
END;
$$;

-- Admin-module-only user (no busy view) must be denied
DO $$
DECLARE
  v_admin_module uuid := 'b8c2c7b7-9519-40bb-9d23-15639dbb47da';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_admin_module::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_module::text, 'role', 'authenticated')::text,
    true
  );

  IF public.has_module_view('busy') THEN
    RAISE EXCEPTION 'fixture user must not have busy view';
  END IF;

  BEGIN
    PERFORM public.get_busy_parts_source_status();
    RAISE EXCEPTION 'expected permission denied for admin-module-only user';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE <> '42501' THEN
        RAISE;
      END IF;
  END;
END;
$$;
