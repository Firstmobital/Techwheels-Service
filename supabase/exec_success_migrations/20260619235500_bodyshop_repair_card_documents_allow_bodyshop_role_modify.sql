BEGIN;

-- Fix Survey Approval photo metadata upsert for BODYSHOP role users.
-- Root cause: upsert on bodyshop_repair_card_documents can hit UPDATE path,
-- and existing v3 modify policies rely on module-modify grants only.
-- For Survey-stage execution users, allow modify when user is mapped to
-- BODYSHOP SA/SSA/SURVEY role and dealer is in scope.

DROP POLICY IF EXISTS bodyshop_repair_card_documents_insert_rbac_v2 ON public.bodyshop_repair_card_documents;
DROP POLICY IF EXISTS bodyshop_repair_card_documents_insert_rbac_v3 ON public.bodyshop_repair_card_documents;

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
        FROM public.get_my_bodyshop_employee_scope() s
        WHERE UPPER(REPLACE(BTRIM(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
          AND UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'SSA', 'SURVEY')
      )
    )
  )
);

DROP POLICY IF EXISTS bodyshop_repair_card_documents_update_rbac_v2 ON public.bodyshop_repair_card_documents;
DROP POLICY IF EXISTS bodyshop_repair_card_documents_update_rbac_v3 ON public.bodyshop_repair_card_documents;

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
        FROM public.get_my_bodyshop_employee_scope() s
        WHERE UPPER(REPLACE(BTRIM(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
          AND UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'SSA', 'SURVEY')
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
        FROM public.get_my_bodyshop_employee_scope() s
        WHERE UPPER(REPLACE(BTRIM(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
          AND UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'SSA', 'SURVEY')
      )
    )
  )
);

COMMIT;
