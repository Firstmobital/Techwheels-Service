BEGIN;

-- Upload metadata upsert uses `.select(...)` in frontend.
-- Even with INSERT/UPDATE allowed, response fetch fails if SELECT policy is too strict.
-- Allow BODYSHOP SA/SSA/SURVEY role users (dealer-scoped) to read document rows.

DROP POLICY IF EXISTS bodyshop_repair_card_documents_select_rbac_v2 ON public.bodyshop_repair_card_documents;
DROP POLICY IF EXISTS bodyshop_repair_card_documents_select_rbac_v3 ON public.bodyshop_repair_card_documents;

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
        FROM public.get_my_bodyshop_employee_scope() s
        WHERE UPPER(REPLACE(BTRIM(COALESCE(s.department, '')), ' ', '')) = 'BODYSHOP'
          AND UPPER(BTRIM(COALESCE(s.role, ''))) IN ('SA', 'SSA', 'SURVEY')
      )
    )
  )
);

COMMIT;
