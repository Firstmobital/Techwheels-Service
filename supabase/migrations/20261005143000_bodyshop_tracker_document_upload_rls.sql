-- Bodyshop Tracker advisors could SELECT documents but INSERT/UPDATE upserts failed (re-upload after approve).
-- Align write policies with SELECT: allow has_module_modify('bodyshop_tracker').

DROP POLICY IF EXISTS bodyshop_repair_card_documents_insert_rbac_v4 ON public.bodyshop_repair_card_documents;
CREATE POLICY bodyshop_repair_card_documents_insert_rbac_v4
  ON public.bodyshop_repair_card_documents FOR INSERT TO authenticated
  WITH CHECK ((public.is_admin() OR (public.dealer_code_in_scope(dealer_code) AND (
    public.has_module_modify('service_advisor'::text)
    OR public.has_module_modify('reception'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_tracker'::text)
    OR (EXISTS (
      SELECT 1
      FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
      WHERE upper(replace(btrim(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
        AND public.employee_has_any_business_role(s.role, ARRAY['SA'::text, 'EDP'::text, 'SURVEY'::text])
    ))
  ))));

DROP POLICY IF EXISTS bodyshop_repair_card_documents_update_rbac_v4 ON public.bodyshop_repair_card_documents;
CREATE POLICY bodyshop_repair_card_documents_update_rbac_v4
  ON public.bodyshop_repair_card_documents FOR UPDATE TO authenticated
  USING ((public.is_admin() OR (public.dealer_code_in_scope(dealer_code) AND (
    public.has_module_modify('service_advisor'::text)
    OR public.has_module_modify('reception'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_tracker'::text)
    OR (EXISTS (
      SELECT 1
      FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
      WHERE upper(replace(btrim(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
        AND public.employee_has_any_business_role(s.role, ARRAY['SA'::text, 'EDP'::text, 'SURVEY'::text])
    ))
  ))))
  WITH CHECK ((public.is_admin() OR (public.dealer_code_in_scope(dealer_code) AND (
    public.has_module_modify('service_advisor'::text)
    OR public.has_module_modify('reception'::text)
    OR public.has_module_modify('bodyshop_repair'::text)
    OR public.has_module_modify('bodyshop_tracker'::text)
    OR (EXISTS (
      SELECT 1
      FROM public.get_my_bodyshop_employee_scope() s(employee_code, department, role, location, fuel_type)
      WHERE upper(replace(btrim(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
        AND public.employee_has_any_business_role(s.role, ARRAY['SA'::text, 'EDP'::text, 'SURVEY'::text])
    ))
  ))));
