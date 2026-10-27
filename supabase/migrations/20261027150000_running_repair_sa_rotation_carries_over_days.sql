-- Running Repairs round-robin: carry the rotation across days (tie-break on last allocation over 30 days).
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
    -- cnt resets daily (IST); last_at spans 30 days so tomorrow's rotation continues
    -- from whoever was allocated longest ago instead of restarting at the first code.
    SELECT upper(btrim(e.sa_employee_code)) AS code,
           count(*) FILTER (WHERE e.created_at >= v_day_from) AS cnt,
           max(e.created_at) AS last_at
      FROM public.service_reception_entries e
     WHERE e.created_at >= v_day_from - interval '30 days'
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

