-- ============================================================
-- SUPABASE-002 Phase 3: Bodyshop RBAC + Grant Hardening
-- Created: 2026-06-11
-- Forward-only migration; rollback pair provided separately.
-- ============================================================

BEGIN;

-- 1) Replace permissive bodyshop_assignments policies with scoped predicates.
ALTER POLICY bodyshop_assignments_read
ON public.bodyshop_assignments
USING (
  public.is_admin()
  OR (
    (
      public.has_module_view('bodyshop_floor')
      OR public.has_module_modify('bodyshop_floor')
      OR public.has_module_view('bodyshop_repair')
      OR public.has_module_modify('bodyshop_repair')
    )
    AND EXISTS (
      SELECT 1
      FROM public.service_reception_entries sre
      WHERE upper(btrim(coalesce(sre.jc_number, ''))) = upper(btrim(coalesce(bodyshop_assignments.job_card_number, '')))
        AND sre.sa_employee_code IS NOT NULL
        AND (
          public.user_has_employee_code(sre.sa_employee_code)
          OR public.user_has_floor_incharge_scope_for_sa_code(sre.sa_employee_code)
          OR public.user_is_crm_for_dealer_sa(sre.sa_employee_code)
        )
    )
  )
);

ALTER POLICY bodyshop_assignments_insert
ON public.bodyshop_assignments
WITH CHECK (
  public.is_admin()
  OR (
    (
      public.has_module_modify('bodyshop_floor')
      OR public.has_module_modify('bodyshop_repair')
    )
    AND EXISTS (
      SELECT 1
      FROM public.service_reception_entries sre
      WHERE upper(btrim(coalesce(sre.jc_number, ''))) = upper(btrim(coalesce(bodyshop_assignments.job_card_number, '')))
        AND sre.sa_employee_code IS NOT NULL
        AND (
          public.user_has_employee_code(sre.sa_employee_code)
          OR public.user_has_floor_incharge_scope_for_sa_code(sre.sa_employee_code)
          OR public.user_is_crm_for_dealer_sa(sre.sa_employee_code)
        )
    )
  )
);

ALTER POLICY bodyshop_assignments_update
ON public.bodyshop_assignments
USING (
  public.is_admin()
  OR (
    (
      public.has_module_modify('bodyshop_floor')
      OR public.has_module_modify('bodyshop_repair')
    )
    AND EXISTS (
      SELECT 1
      FROM public.service_reception_entries sre
      WHERE upper(btrim(coalesce(sre.jc_number, ''))) = upper(btrim(coalesce(bodyshop_assignments.job_card_number, '')))
        AND sre.sa_employee_code IS NOT NULL
        AND (
          public.user_has_employee_code(sre.sa_employee_code)
          OR public.user_has_floor_incharge_scope_for_sa_code(sre.sa_employee_code)
          OR public.user_is_crm_for_dealer_sa(sre.sa_employee_code)
        )
    )
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    (
      public.has_module_modify('bodyshop_floor')
      OR public.has_module_modify('bodyshop_repair')
    )
    AND EXISTS (
      SELECT 1
      FROM public.service_reception_entries sre
      WHERE upper(btrim(coalesce(sre.jc_number, ''))) = upper(btrim(coalesce(bodyshop_assignments.job_card_number, '')))
        AND sre.sa_employee_code IS NOT NULL
        AND (
          public.user_has_employee_code(sre.sa_employee_code)
          OR public.user_has_floor_incharge_scope_for_sa_code(sre.sa_employee_code)
          OR public.user_is_crm_for_dealer_sa(sre.sa_employee_code)
        )
    )
  )
);

-- 2) Expand existing bodyshop_repair_cards policy to include scoped non-admin access.
--    Keep policy object name unchanged to avoid policy-object drift.
ALTER POLICY admin_unrestricted_all_ops_v1
ON public.bodyshop_repair_cards
USING (
  public.is_admin()
  OR (
    (
      public.has_module_view('bodyshop_repair')
      OR public.has_module_modify('bodyshop_repair')
      OR public.has_module_view('bodyshop_floor')
      OR public.has_module_modify('bodyshop_floor')
    )
    AND (
      (
        sa_employee_code IS NOT NULL
        AND (
          public.user_has_employee_code(sa_employee_code)
          OR public.user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
          OR public.user_is_crm_for_dealer_sa(sa_employee_code)
        )
      )
      OR (
        sa_employee_code IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.service_reception_entries sre
          WHERE upper(btrim(coalesce(sre.jc_number, ''))) = upper(btrim(coalesce(bodyshop_repair_cards.job_card_no, '')))
            AND sre.sa_employee_code IS NOT NULL
            AND (
              public.user_has_employee_code(sre.sa_employee_code)
              OR public.user_has_floor_incharge_scope_for_sa_code(sre.sa_employee_code)
              OR public.user_is_crm_for_dealer_sa(sre.sa_employee_code)
            )
        )
      )
    )
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    (
      public.has_module_modify('bodyshop_repair')
      OR public.has_module_modify('bodyshop_floor')
    )
    AND (
      (
        sa_employee_code IS NOT NULL
        AND (
          public.user_has_employee_code(sa_employee_code)
          OR public.user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
          OR public.user_is_crm_for_dealer_sa(sa_employee_code)
        )
      )
      OR (
        sa_employee_code IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.service_reception_entries sre
          WHERE upper(btrim(coalesce(sre.jc_number, ''))) = upper(btrim(coalesce(bodyshop_repair_cards.job_card_no, '')))
            AND sre.sa_employee_code IS NOT NULL
            AND (
              public.user_has_employee_code(sre.sa_employee_code)
              OR public.user_has_floor_incharge_scope_for_sa_code(sre.sa_employee_code)
              OR public.user_is_crm_for_dealer_sa(sre.sa_employee_code)
            )
        )
      )
    )
  )
);

-- 3) Remove anon grants from bodyshop objects.
REVOKE ALL ON TABLE public.bodyshop_assignments FROM anon;
REVOKE ALL ON TABLE public.bodyshop_repair_cards FROM anon;
REVOKE ALL ON SEQUENCE public.bodyshop_assignments_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.bodyshop_repair_cards_id_seq FROM anon;
REVOKE ALL ON FUNCTION public.update_bodyshop_assignments_updated_at() FROM anon;

COMMIT;
