-- DBL-0091 / RECEPTION-003
-- Align Reception edit authorization with the location-scoped visibility contract.
--
-- Problem found in production UAT:
-- dedicated RECEPTION users can view same-location historical entries across
-- Sitapura dealer codes, but update_reception_entry still authorized only by
-- the historical row dealer_code. That caused 403 on edit despite Reception
-- MODIFY permission.
--
-- Contract:
-- * admin remains unrestricted;
-- * dedicated RECEPTION identities (same criteria as DBL-0089 list scope)
--   may edit only entries in their one active Employee Master location;
-- * the selected target SA must resolve to that same location;
-- * non-dedicated Reception-capable users keep the existing dealer-code scope;
-- * no table/RLS/policy/data rewrite.

CREATE OR REPLACE FUNCTION public.update_reception_entry(p_reception_entry_id bigint, p_reg_number text, p_model text, p_service_type text, p_sa_employee_code text, p_owner_name text, p_owner_phone text, p_source text, p_km_reading integer DEFAULT NULL::integer, p_jc_number text DEFAULT NULL::text, p_branch text DEFAULT NULL::text, p_portal text DEFAULT NULL::text) RETURNS SETOF public.service_reception_entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_dealer_code                  text;
  v_existing_location_key        text;
  v_reception_location_key       text;
  v_is_admin                     boolean;
  v_reception_location_only      boolean;
  v_sa_name                      text;
  v_reg_number                   text;
  v_service_type                 text;
  v_portal                       text;
BEGIN
  SELECT
      sre.dealer_code,
      COALESCE(
        public.normalize_employee_location_key(sre.location),
        public.normalize_employee_location_key(sre.branch),
        public.reception_sa_location_key(sre.sa_employee_code)
      )
    INTO
      v_dealer_code,
      v_existing_location_key
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := public.is_admin();

  SELECT CASE
           WHEN count(DISTINCT public.normalize_employee_location_key(em.location)) = 1
             THEN min(public.normalize_employee_location_key(em.location))
           ELSE NULL
         END
    INTO v_reception_location_key
    FROM public.user_employee_links uel
    JOIN public.employee_master em
      ON upper(btrim(em.employee_code)) = upper(btrim(uel.employee_code))
   WHERE uel.user_id = auth.uid()
     AND uel.is_active = true
     AND em.is_active = true
     AND public.employee_has_business_role(em.role, 'RECEPTION')
     AND public.normalize_employee_location_key(em.location) IS NOT NULL;

  -- Keep edit authorization aligned with DBL-0089 Reception read scope.
  -- A dedicated receptionist uses Employee Master location, not the row's
  -- historical dealer_code. Other Reception-capable users retain the
  -- existing dealer-scoped authorization path.
  v_reception_location_only :=
    NOT v_is_admin
    AND public.has_module_modify('reception'::text)
    AND NOT public.has_module_view('service_advisor'::text)
    AND NOT public.has_module_modify('service_advisor'::text)
    AND NOT public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text)
    AND v_reception_location_key IS NOT NULL;

  IF NOT (
    v_is_admin
    OR (
      public.has_module_modify('reception')
      AND (
        (
          v_reception_location_only
          AND v_existing_location_key = v_reception_location_key
        )
        OR (
          NOT v_reception_location_only
          AND public.dealer_code_in_scope(v_dealer_code)
        )
      )
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: reception entry is outside your edit scope'
      USING ERRCODE = '42501';
  END IF;

  v_reg_number := upper(btrim(coalesce(p_reg_number, '')));
  v_service_type := NULLIF(btrim(coalesce(p_service_type, '')), '');
  v_portal := NULLIF(upper(btrim(coalesce(p_portal, ''))), '');

  IF v_reg_number = '' THEN
    RAISE EXCEPTION 'registration number is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_model, '')), '') IS NULL THEN
    RAISE EXCEPTION 'model is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_sa_employee_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'sa employee code is required' USING ERRCODE = '22023';
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

  SELECT em.employee_name
    INTO v_sa_name
    FROM public.employee_master em
   WHERE em.employee_code = upper(btrim(p_sa_employee_code));

  IF NOT FOUND OR NULLIF(btrim(coalesce(v_sa_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'employee code % not found', p_sa_employee_code
      USING ERRCODE = 'P0002';
  END IF;

  IF v_reception_location_only
     AND public.reception_sa_location_key(p_sa_employee_code) IS DISTINCT FROM v_reception_location_key
  THEN
    RAISE EXCEPTION 'permission denied: selected Service Advisor is outside your Reception location scope'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.service_reception_entries sre
     SET reg_number       = v_reg_number,
         model            = NULLIF(btrim(p_model), ''),
         service_type     = v_service_type,
         sa_employee_code = upper(btrim(p_sa_employee_code)),
         sa_name          = v_sa_name,
         sa_display_name  = v_sa_name,
         owner_name       = NULLIF(btrim(p_owner_name), ''),
         owner_phone      = btrim(p_owner_phone),
         source           = NULLIF(btrim(p_source), ''),
         km_reading       = p_km_reading,
         jc_number        = NULLIF(upper(btrim(coalesce(p_jc_number, ''))), ''),
         branch           = NULLIF(btrim(coalesce(p_branch, '')), ''),
         portal           = COALESCE(v_portal, sre.portal),
         updated_at       = now()
   WHERE sre.id = p_reception_entry_id
   RETURNING sre.*;
END;
$_$;

COMMENT ON FUNCTION public.update_reception_entry(
  bigint, text, text, text, text, text, text, text, integer, text, text, text
) IS
  'DBL-0091 / RECEPTION-003: Reception update RPC. Admin bypasses. Dedicated RECEPTION identities with modify permission authorize by their single active Employee Master location for both existing entry and selected SA; other Reception-capable users retain dealer-code scope.';
