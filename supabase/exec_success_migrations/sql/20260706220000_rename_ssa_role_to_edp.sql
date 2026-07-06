-- Rename employee_master role 'SSA' → 'EDP' everywhere:
-- 1. Data: update employee_master rows
-- 2. Functions: recreate both bodyshop surveyor functions with 'EDP'
-- 3. Policies: recreate bodyshop_repair_card_documents INSERT/SELECT/UPDATE with 'EDP'

-- ── 1. Data ──────────────────────────────────────────────────────────────────

UPDATE public.employee_master
  SET role = 'EDP'
  WHERE upper(btrim(role)) = 'SSA';

-- ── 2. Functions ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_access_bodyshop_surveyor_settings(target_dealer text)
  RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target text := UPPER(BTRIM(COALESCE(target_dealer, '')));
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
    WHERE UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'EDP', 'SURVEY')
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
      WHERE UPPER(BTRIM(COALESCE(dc.code, ''))) = v_target
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      WHERE uel.user_id = v_uid
        AND uel.is_active = true
        AND UPPER(BTRIM(COALESCE(uel.dealer_code, ''))) = v_target
    )
  )
  AND (v_has_module_access OR v_has_bodyshop_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_bodyshop_surveyor_catalog()
  RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  IF public.has_module_view('settings'::text)
    OR public.has_module_view('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
  THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.get_my_bodyshop_employee_scope() s
    WHERE UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'EDP', 'SURVEY')
  );
END;
$$;

-- ── 3. RLS Policies on bodyshop_repair_card_documents ────────────────────────

DROP POLICY IF EXISTS bodyshop_repair_card_documents_insert_rbac_v4 ON public.bodyshop_repair_card_documents;
CREATE POLICY bodyshop_repair_card_documents_insert_rbac_v4
  ON public.bodyshop_repair_card_documents FOR INSERT TO authenticated
  WITH CHECK ((public.is_admin() OR (public.dealer_code_in_scope(dealer_code) AND (
    public.has_module_modify('service_advisor'::text)
    OR public.has_module_modify('reception'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
    OR (EXISTS (
      SELECT 1
      FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
      WHERE upper(replace(btrim(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
        AND upper(btrim(COALESCE(s.role, ''))) = ANY (ARRAY['SA'::text, 'EDP'::text, 'SURVEY'::text])
    ))
  ))));

DROP POLICY IF EXISTS bodyshop_repair_card_documents_select_rbac_v4 ON public.bodyshop_repair_card_documents;
CREATE POLICY bodyshop_repair_card_documents_select_rbac_v4
  ON public.bodyshop_repair_card_documents FOR SELECT TO authenticated
  USING ((public.is_admin() OR (public.dealer_code_in_scope(dealer_code) AND (
    public.has_module_view('service_advisor'::text)
    OR public.has_module_view('reception'::text)
    OR public.has_module_view('bodyshop_floor'::text)
    OR public.has_module_view('bodyshop_repair'::text)
    OR public.has_module_view('bodyshop_tracker'::text)
    OR (EXISTS (
      SELECT 1
      FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
      WHERE upper(replace(btrim(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
        AND upper(btrim(COALESCE(s.role, ''))) = ANY (ARRAY['SA'::text, 'EDP'::text, 'SURVEY'::text])
    ))
  ))));

DROP POLICY IF EXISTS bodyshop_repair_card_documents_update_rbac_v4 ON public.bodyshop_repair_card_documents;
CREATE POLICY bodyshop_repair_card_documents_update_rbac_v4
  ON public.bodyshop_repair_card_documents FOR UPDATE TO authenticated
  USING ((public.is_admin() OR (public.dealer_code_in_scope(dealer_code) AND (
    public.has_module_modify('service_advisor'::text)
    OR public.has_module_modify('reception'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
    OR (EXISTS (
      SELECT 1
      FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
      WHERE upper(replace(btrim(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
        AND upper(btrim(COALESCE(s.role, ''))) = ANY (ARRAY['SA'::text, 'EDP'::text, 'SURVEY'::text])
    ))
  ))))
  WITH CHECK ((public.is_admin() OR (public.dealer_code_in_scope(dealer_code) AND (
    public.has_module_modify('service_advisor'::text)
    OR public.has_module_modify('reception'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
    OR (EXISTS (
      SELECT 1
      FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
      WHERE upper(replace(btrim(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
        AND upper(btrim(COALESCE(s.role, ''))) = ANY (ARRAY['SA'::text, 'EDP'::text, 'SURVEY'::text])
    ))
  ))));
