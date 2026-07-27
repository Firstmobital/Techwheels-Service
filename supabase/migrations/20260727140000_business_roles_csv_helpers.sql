-- RBAC-003: comma-separated Business Roles in employee_master.role (Option B)
-- Shared parse/normalize/match helpers + rewrite role-dependent functions/policies.

-- ── 1) Core helpers ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.normalize_business_role_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_token, '')) = '' THEN NULL
    WHEN upper(replace(btrim(p_token), ' ', '_')) IN ('SERVICE_ADVISOR') THEN 'SA'
    WHEN upper(btrim(p_token)) = 'SERVICE ADVISOR' THEN 'SA'
    WHEN upper(replace(btrim(p_token), ' ', '_')) IN ('SSA', 'SENIOR_SERVICE_ADVISOR') THEN 'EDP'
    WHEN upper(btrim(p_token)) = 'SENIOR SERVICE ADVISOR' THEN 'EDP'
    WHEN upper(replace(btrim(p_token), ' ', '_')) = 'SURVEYOR' THEN 'SURVEY'
    WHEN upper(btrim(p_token)) = 'FLOOR INCHARGE' THEN 'FLOOR_INCHARGE'
    WHEN upper(replace(btrim(p_token), ' ', '_')) = 'FLOOR_INCHARGE' THEN 'FLOOR_INCHARGE'
    WHEN upper(btrim(p_token)) = 'DENTOR HELPER' THEN 'DENTOR_HELPER'
    WHEN upper(btrim(p_token)) = 'PAINTER HELPER' THEN 'PAINTER_HELPER'
    WHEN upper(btrim(p_token)) = 'PARTS INCHARGE' THEN 'PARTS_INCHARGE'
    WHEN upper(replace(btrim(p_token), ' ', '_')) = 'DENTER' THEN 'DENTOR'
    ELSE upper(replace(btrim(p_token), ' ', '_'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.employee_business_roles(p_role text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    array_agg(DISTINCT normalized ORDER BY normalized),
    ARRAY[]::text[]
  )
  FROM (
    SELECT public.normalize_business_role_token(token) AS normalized
    FROM unnest(string_to_array(coalesce(p_role, ''), ',')) AS token
  ) parsed
  WHERE normalized IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.employee_has_business_role(p_role text, p_target text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT public.normalize_business_role_token(p_target) = ANY(public.employee_business_roles(p_role));
$$;

CREATE OR REPLACE FUNCTION public.employee_has_any_business_role(p_role text, p_targets text[])
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(public.employee_business_roles(p_role)) AS role_code
    WHERE role_code = ANY (
      SELECT public.normalize_business_role_token(t)
      FROM unnest(coalesce(p_targets, ARRAY[]::text[])) AS t
    )
  );
$$;

COMMENT ON FUNCTION public.normalize_business_role_token(text) IS
  'RBAC-003: normalize one Business Role token to canonical uppercase form (aliases included).';

COMMENT ON FUNCTION public.employee_business_roles(text) IS
  'RBAC-003: split comma-separated employee_master.role into canonical role codes.';

COMMENT ON FUNCTION public.employee_has_business_role(text, text) IS
  'RBAC-003: true when any parsed role on employee_master.role matches target.';

COMMENT ON FUNCTION public.employee_has_any_business_role(text, text[]) IS
  'RBAC-003: true when any parsed role matches any normalized target.';

GRANT EXECUTE ON FUNCTION public.normalize_business_role_token(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employee_business_roles(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employee_has_business_role(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employee_has_any_business_role(text, text[]) TO authenticated, service_role;

-- ── 2) Role-dependent functions ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_has_crm_dealer_scope(p_dealer_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel
    JOIN public.employee_master em ON em.employee_code = uel.employee_code
    WHERE uel.user_id = auth.uid()
      AND uel.is_active = true
      AND public.employee_has_business_role(em.role, 'CRM')
      AND upper(btrim(coalesce(uel.dealer_code, ''))) = upper(btrim(coalesce(p_dealer_code, '')))
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_crm_for_sa_code(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel
    JOIN public.employee_master em ON em.employee_code = uel.employee_code
    WHERE uel.user_id = auth.uid()
      AND uel.is_active = true
      AND public.employee_has_business_role(em.role, 'CRM')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_crm_for_dealer_sa(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links crm_link
    JOIN public.employee_master crm_em ON crm_em.employee_code = crm_link.employee_code
    WHERE crm_link.user_id = auth.uid()
      AND crm_link.is_active = true
      AND public.employee_has_business_role(crm_em.role, 'CRM')
      AND (
        upper(btrim(coalesce(crm_link.dealer_code, ''))) = upper(btrim(split_part(coalesce(p_sa_employee_code, ''), '_', 1)))
        OR upper(btrim(coalesce(crm_link.dealer_code, ''))) = upper(btrim(split_part(coalesce(p_sa_employee_code, ''), '_', 2)))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_technician_code(p_technician_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel
    JOIN public.employee_master em ON em.employee_code = uel.employee_code
    WHERE uel.user_id = auth.uid()
      AND uel.is_active = true
      AND upper(uel.employee_code) = upper(p_technician_code)
      AND public.employee_has_business_role(em.role, 'TECHNICIAN')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_floor_incharge_scope_for_sa_code(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel_fi
    JOIN public.employee_master fi ON fi.employee_code = uel_fi.employee_code
    JOIN public.employee_master sa ON sa.employee_code = p_sa_employee_code
    WHERE uel_fi.user_id = auth.uid()
      AND uel_fi.is_active = true
      AND public.employee_has_business_role(fi.role, 'FLOOR_INCHARGE')
      AND nullif(lower(btrim(coalesce(fi.fuel_type, ''))), '') IS NOT NULL
      AND lower(btrim(coalesce(fi.fuel_type, ''))) = lower(btrim(coalesce(sa.fuel_type, '')))
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_service_floor_incharge_scope_for_sa_code(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel_fi
    JOIN public.employee_master fi ON fi.employee_code = uel_fi.employee_code
    JOIN public.employee_master sa ON upper(btrim(coalesce(sa.employee_code, ''))) = upper(btrim(coalesce(p_sa_employee_code, '')))
    WHERE uel_fi.user_id = auth.uid()
      AND uel_fi.is_active = true
      AND public.employee_has_business_role(fi.role, 'FLOOR_INCHARGE')
      AND upper(replace(btrim(coalesce(fi.department, '')), ' ', '')) = 'SERVICE'
      AND nullif(lower(btrim(coalesce(fi.fuel_type, ''))), '') IS NOT NULL
      AND lower(btrim(coalesce(fi.fuel_type, ''))) = lower(btrim(coalesce(sa.fuel_type, '')))
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_bodyshop_floor_incharge_scope_for_sa_code(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH input_codes AS (
    SELECT
      upper(btrim(coalesce(p_sa_employee_code, ''))) AS code_upper,
      upper(btrim(coalesce(split_part(p_sa_employee_code, '_', 1), ''))) AS code_part1,
      upper(btrim(coalesce(split_part(p_sa_employee_code, '_', 2), ''))) AS code_part2
  ),
  sa_location AS (
    SELECT upper(btrim(coalesce(
      sa.location,
      CASE
        WHEN c.code_upper LIKE '%500A840%' OR c.code_part1 = '500A840' OR c.code_part2 = '500A840' THEN 'Sitapura'
        WHEN c.code_upper LIKE '%3000840%' OR c.code_part1 = '3000840' OR c.code_part2 = '3000840' THEN 'Sitapura'
        WHEN c.code_upper LIKE '%3001440%' OR c.code_part1 = '3001440' OR c.code_part2 = '3001440' THEN 'Ajmer Road'
        ELSE NULL
      END
    ))) AS location_upper
    FROM input_codes c
    LEFT JOIN LATERAL (
      SELECT em.location
      FROM public.employee_master em
      WHERE upper(btrim(coalesce(em.employee_code, ''))) IN (c.code_upper, c.code_part1, c.code_part2)
      ORDER BY CASE
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = c.code_upper THEN 1
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = c.code_part1 THEN 2
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = c.code_part2 THEN 3
        ELSE 9
      END
      LIMIT 1
    ) sa ON true
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel_fi
    JOIN public.employee_master fi ON fi.employee_code = uel_fi.employee_code
    CROSS JOIN sa_location sal
    WHERE uel_fi.user_id = auth.uid()
      AND uel_fi.is_active = true
      AND public.employee_has_business_role(fi.role, 'FLOOR_INCHARGE')
      AND upper(replace(btrim(coalesce(fi.department, '')), ' ', '')) = 'BODYSHOP'
      AND nullif(upper(btrim(coalesce(fi.location, ''))), '') IS NOT NULL
      AND nullif(sal.location_upper, '') IS NOT NULL
      AND upper(btrim(coalesce(fi.location, ''))) = sal.location_upper
  );
$$;

CREATE OR REPLACE FUNCTION public.is_income_assignment_eligible(
  p_module_key text,
  p_assignment_source text,
  p_employee_code text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_master em
    JOIN public.income_role_scope rs ON rs.is_active = true
     AND upper(btrim(rs.module_key)) = upper(btrim(coalesce(p_module_key, '')))
     AND upper(btrim(rs.assignment_source)) = upper(btrim(coalesce(p_assignment_source, '')))
    WHERE upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(p_employee_code, '')))
      AND public.employee_has_business_role(
        em.role,
        public.normalize_business_role_token(rs.employee_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_bodyshop_surveyor_catalog()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_bodyshop_role boolean := false;
BEGIN
  IF public.is_admin() THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.get_my_bodyshop_employee_scope() s
    WHERE public.employee_has_any_business_role(s.role, ARRAY['SA', 'EDP', 'SURVEY'])
  ) INTO v_has_bodyshop_role;

  RETURN (
    public.has_module_view('settings'::text)
    OR public.has_module_view('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
    OR v_has_bodyshop_role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_bodyshop_surveyor_settings(target_dealer text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target text := upper(btrim(coalesce(target_dealer, '')));
  v_has_bodyshop_role boolean := false;
  v_has_module_access boolean := false;
BEGIN
  IF v_uid IS NULL OR v_target = '' THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.get_my_bodyshop_employee_scope() s
    WHERE public.employee_has_any_business_role(s.role, ARRAY['SA', 'EDP', 'SURVEY'])
  ) INTO v_has_bodyshop_role;

  v_has_module_access := (
    public.has_module_view('settings'::text)
    OR public.has_module_view('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
  );

  RETURN (
    EXISTS (
      SELECT 1
      FROM unnest(public.my_effective_dealer_codes()) AS dc(code)
      WHERE upper(btrim(coalesce(dc.code, ''))) = v_target
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      WHERE uel.user_id = v_uid
        AND uel.is_active = true
        AND upper(btrim(coalesce(uel.dealer_code, ''))) = v_target
    )
  )
  AND (v_has_module_access OR v_has_bodyshop_role);
END;
$$;

-- ── 3) Bodyshop repair card document policies (inline s.role) ───────────────

DROP POLICY IF EXISTS bodyshop_repair_card_documents_insert_rbac_v4 ON public.bodyshop_repair_card_documents;
CREATE POLICY bodyshop_repair_card_documents_insert_rbac_v4
  ON public.bodyshop_repair_card_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.dealer_code_in_scope(dealer_code)
      AND (
        public.has_module_modify('service_advisor'::text)
        OR public.has_module_modify('reception'::text)
        OR public.has_module_modify('bodyshop_repair'::text)
        OR EXISTS (
          SELECT 1
          FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
          WHERE upper(replace(btrim(coalesce(s.department, '')), ' ', '')) = 'BODYSHOP'
            AND public.employee_has_any_business_role(s.role, ARRAY['SA', 'EDP', 'SURVEY'])
        )
      )
    )
  );

DROP POLICY IF EXISTS bodyshop_repair_card_documents_select_rbac_v4 ON public.bodyshop_repair_card_documents;
CREATE POLICY bodyshop_repair_card_documents_select_rbac_v4
  ON public.bodyshop_repair_card_documents
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.dealer_code_in_scope(dealer_code)
      AND (
        public.has_module_view('service_advisor'::text)
        OR public.has_module_view('reception'::text)
        OR public.has_module_view('bodyshop_floor'::text)
        OR public.has_module_view('bodyshop_repair'::text)
        OR public.has_module_view('bodyshop_tracker'::text)
        OR EXISTS (
          SELECT 1
          FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
          WHERE upper(replace(btrim(coalesce(s.department, '')), ' ', '')) = 'BODYSHOP'
            AND public.employee_has_any_business_role(s.role, ARRAY['SA', 'EDP', 'SURVEY'])
        )
      )
    )
  );

DROP POLICY IF EXISTS bodyshop_repair_card_documents_update_rbac_v4 ON public.bodyshop_repair_card_documents;
CREATE POLICY bodyshop_repair_card_documents_update_rbac_v4
  ON public.bodyshop_repair_card_documents
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      public.dealer_code_in_scope(dealer_code)
      AND (
        public.has_module_modify('service_advisor'::text)
        OR public.has_module_modify('reception'::text)
        OR public.has_module_modify('bodyshop_repair'::text)
        OR EXISTS (
          SELECT 1
          FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
          WHERE upper(replace(btrim(coalesce(s.department, '')), ' ', '')) = 'BODYSHOP'
            AND public.employee_has_any_business_role(s.role, ARRAY['SA', 'EDP', 'SURVEY'])
        )
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.dealer_code_in_scope(dealer_code)
      AND (
        public.has_module_modify('service_advisor'::text)
        OR public.has_module_modify('reception'::text)
        OR public.has_module_modify('bodyshop_repair'::text)
        OR EXISTS (
          SELECT 1
          FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
          WHERE upper(replace(btrim(coalesce(s.department, '')), ' ', '')) = 'BODYSHOP'
            AND public.employee_has_any_business_role(s.role, ARRAY['SA', 'EDP', 'SURVEY'])
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.generate_complaint_link(p_reception_entry_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dealer_code text;
  v_token text;
  v_link_id bigint;
  v_sa_employee_code text;
BEGIN
  SELECT dealer_code, sa_employee_code
    INTO v_dealer_code, v_sa_employee_code
  FROM public.service_reception_entries
  WHERE id = p_reception_entry_id;

  IF v_dealer_code IS NULL THEN
    RAISE EXCEPTION 'Reception entry not found';
  END IF;

  IF NOT (
    public.is_admin()
    OR public.has_module_modify('complaints')
    OR (
      public.has_module_modify('service_advisor')
      AND v_sa_employee_code IS NOT NULL
      AND (
        public.user_has_employee_code(v_sa_employee_code)
        OR public.user_is_crm_for_dealer_sa(v_sa_employee_code)
        OR EXISTS (
          SELECT 1
          FROM public.user_employee_links uel
          JOIN public.employee_master em
            ON em.employee_code = uel.employee_code
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND public.employee_has_any_business_role(em.role, ARRAY['SM', 'GM'])
        )
      )
    )
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_token := encode(gen_random_bytes(16), 'base64')
    || encode(gen_random_bytes(8), 'base64');
  v_token := REPLACE(REPLACE(REPLACE(v_token, '/', '_'), '+', '-'), '=', '');
  v_token := SUBSTRING(v_token FROM 1 FOR 24);

  INSERT INTO public.complaint_access_links (
    dealer_code, reception_entry_id, token, status
  ) VALUES (
    v_dealer_code, p_reception_entry_id, v_token, 'active'
  )
  ON CONFLICT (reception_entry_id) DO UPDATE
  SET token = v_token, status = 'active', created_at = now()
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object(
    'link_id', v_link_id,
    'token', v_token,
    'url', 'https://tw.care/c/' || v_token
  );
END;
$$;
