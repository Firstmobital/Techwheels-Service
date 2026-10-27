-- Running Repairs: FIFO round-robin Service Advisor allocation.
--
-- Eligible advisors: active employee_master rows with a Service Advisor role,
-- department SERVICE, matching location (Ajmer Road / Sitapura) and fuel type (EV / PV).
-- Rotation: fewest non-revisit Running Repairs entries today (IST) first; ties go to the
-- advisor allocated longest ago, then by employee code. Only Running Repairs count.

CREATE OR REPLACE FUNCTION public.pick_running_repair_sa(
  p_location text,
  p_portal text,
  p_lock boolean DEFAULT false
) RETURNS TABLE (employee_code text, employee_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_loc_key  text := public.normalize_employee_location_key(p_location);
  v_portal   text := upper(btrim(coalesce(p_portal, '')));
  v_day_from timestamptz := (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata';
BEGIN
  IF v_loc_key IS NULL OR v_portal NOT IN ('EV', 'PV') THEN
    RETURN;
  END IF;

  IF p_lock THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('running_repair_sa:' || v_loc_key || ':' || v_portal, 0));
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT upper(btrim(em.employee_code)) AS code, btrim(em.employee_name) AS name
      FROM public.employee_master em
     WHERE em.is_active
       AND public.normalize_employee_location_key(em.location) = v_loc_key
       AND upper(regexp_replace(btrim(coalesce(em.department, '')), '\s+', ' ', 'g')) = 'SERVICE'
       AND CASE WHEN upper(btrim(coalesce(em.fuel_type, ''))) LIKE '%EV%' THEN 'EV' ELSE 'PV' END = v_portal
       AND btrim(coalesce(em.fuel_type, '')) <> ''
       AND (
         public.employee_has_business_role(em.role, 'SA')
         OR public.employee_has_business_role(em.role, 'SERVICE ADVISOR')
         OR public.employee_has_business_role(em.role, 'SERVICE_ADVISOR')
       )
  ),
  load AS (
    SELECT upper(btrim(e.sa_employee_code)) AS code,
           count(*)          AS cnt,
           max(e.created_at) AS last_at
      FROM public.service_reception_entries e
     WHERE e.created_at >= v_day_from
       AND e.service_type = 'Running Repairs'
       AND NOT e.is_revisit
       AND upper(btrim(e.sa_employee_code)) IN (SELECT c.code FROM candidates c)
     GROUP BY 1
  )
  SELECT c.code, c.name
    FROM candidates c
    LEFT JOIN load l ON l.code = c.code
   ORDER BY coalesce(l.cnt, 0) ASC, l.last_at ASC NULLS FIRST, c.code ASC
   LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_running_repair_sa(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pick_running_repair_sa(text, text, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.pick_running_repair_sa(text, text, boolean) IS
  'Next Service Advisor in the Running Repairs round-robin for a location + EV/PV. p_lock=true serialises concurrent allocations (used by create_reception_entry).';

-- create_reception_entry: blank p_sa_employee_code + Running Repairs => server-side auto allocation.
-- p_branch is used as the location hint for allocation (the SA mapping trigger sets the final branch).
CREATE OR REPLACE FUNCTION public.create_reception_entry(
  p_reg_number text, p_model text, p_service_type text, p_sa_employee_code text,
  p_owner_name text, p_owner_phone text, p_source text,
  p_km_reading integer DEFAULT NULL::integer, p_jc_number text DEFAULT NULL::text,
  p_branch text DEFAULT NULL::text, p_portal text DEFAULT NULL::text
) RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $_$
DECLARE
  v_dealer_code  text;
  v_sa_name      text;
  v_sa_code      text;
  v_reg_number   text;
  v_service_type text;
  v_portal       text;
BEGIN
  v_dealer_code := public.my_dealer_code();

  IF NOT (
    public.is_admin()
    OR (
      public.has_module_modify('reception')
      AND public.dealer_code_in_scope(v_dealer_code)
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: requires reception modify or admin'
      USING ERRCODE = '42501';
  END IF;

  v_reg_number := upper(btrim(coalesce(p_reg_number, '')));
  v_service_type := NULLIF(btrim(coalesce(p_service_type, '')), '');
  v_portal := NULLIF(upper(btrim(coalesce(p_portal, ''))), '');
  v_sa_code := NULLIF(upper(btrim(coalesce(p_sa_employee_code, ''))), '');

  IF v_reg_number = '' THEN
    RAISE EXCEPTION 'registration number is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_model, '')), '') IS NULL THEN
    RAISE EXCEPTION 'model is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_owner_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'owner name is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_source, '')), '') IS NULL THEN
    RAISE EXCEPTION 'source is required' USING ERRCODE = '22023';
  END IF;
  IF p_owner_phone IS NULL OR btrim(p_owner_phone) !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'owner phone must be exactly 10 digits' USING ERRCODE = '22023';
  END IF;
  IF v_portal IS NOT NULL AND v_portal NOT IN ('EV', 'PV') THEN
    RAISE EXCEPTION 'portal must be EV or PV' USING ERRCODE = '22023';
  END IF;

  -- Auto-allocate the next advisor for Running Repairs when none was chosen.
  IF v_sa_code IS NULL AND v_service_type = 'Running Repairs' THEN
    SELECT r.employee_code INTO v_sa_code
      FROM public.pick_running_repair_sa(p_branch, v_portal, true) r;
    IF v_sa_code IS NULL THEN
      RAISE EXCEPTION 'no eligible service advisor found for auto allocation (location %, portal %)',
        coalesce(p_branch, '-'), coalesce(v_portal, '-')
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_sa_code IS NULL THEN
    RAISE EXCEPTION 'sa employee code is required' USING ERRCODE = '22023';
  END IF;

  SELECT em.employee_name
    INTO v_sa_name
    FROM public.employee_master em
   WHERE em.employee_code = v_sa_code;

  IF NOT FOUND OR NULLIF(btrim(coalesce(v_sa_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'employee code % not found', v_sa_code
      USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  INSERT INTO public.service_reception_entries (
    reg_number,
    model,
    service_type,
    sa_employee_code,
    sa_name,
    sa_display_name,
    owner_name,
    owner_phone,
    source,
    km_reading,
    jc_number,
    branch,
    portal,
    dealer_code
  ) VALUES (
    v_reg_number,
    NULLIF(btrim(p_model), ''),
    v_service_type,
    v_sa_code,
    v_sa_name,
    v_sa_name,
    NULLIF(btrim(p_owner_name), ''),
    btrim(p_owner_phone),
    NULLIF(btrim(p_source), ''),
    p_km_reading,
    NULLIF(upper(btrim(coalesce(p_jc_number, ''))), ''),
    NULLIF(btrim(coalesce(p_branch, '')), ''),
    v_portal,
    v_dealer_code
  )
  RETURNING *;
END;
$_$;
