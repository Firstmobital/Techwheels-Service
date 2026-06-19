BEGIN;

-- Problem:
-- Some SA users can view assigned Accident rows in service_reception_entries,
-- but see 0 rows in bodyshop_repair_cards when dealer scope metadata is missing.
--
-- Fix:
-- Add employee-code ownership fallback (`public.user_has_employee_code(sa_employee_code)`)
-- to bodyshop_repair_cards select/insert/update policies.
--
-- This preserves existing dealer/module checks and only broadens access to cards
-- where the authenticated user is explicitly mapped to that SA employee code.

DROP POLICY IF EXISTS bodyshop_repair_cards_select_rbac_v2 ON public.bodyshop_repair_cards;

CREATE POLICY bodyshop_repair_cards_select_rbac_v3
ON public.bodyshop_repair_cards
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    (
      public.has_module_view('service_advisor'::text)
      OR public.has_module_view('reception'::text)
      OR public.has_module_view('bodyshop_floor'::text)
      OR public.has_module_view('bodyshop_repair'::text)
      OR public.has_module_view('bodyshop_tracker'::text)
    )
    AND (
      (
        reception_entry_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.service_reception_entries sre
          WHERE sre.id = bodyshop_repair_cards.reception_entry_id
            AND public.dealer_code_in_scope(sre.dealer_code)
        )
      )
      OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_'::text, 1))
      OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_'::text, 2))
      OR public.user_has_employee_code(sa_employee_code)
    )
  )
);

DROP POLICY IF EXISTS bodyshop_repair_cards_insert_rbac_v2 ON public.bodyshop_repair_cards;

CREATE POLICY bodyshop_repair_cards_insert_rbac_v3
ON public.bodyshop_repair_cards
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    (
      public.has_module_modify('service_advisor'::text)
      OR public.has_module_modify('reception'::text)
      OR public.has_module_modify('bodyshop_repair'::text)
    )
    AND (
      (
        reception_entry_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.service_reception_entries sre
          WHERE sre.id = bodyshop_repair_cards.reception_entry_id
            AND public.dealer_code_in_scope(sre.dealer_code)
        )
      )
      OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_'::text, 1))
      OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_'::text, 2))
      OR public.user_has_employee_code(sa_employee_code)
    )
  )
);

DROP POLICY IF EXISTS bodyshop_repair_cards_update_rbac_v2 ON public.bodyshop_repair_cards;

CREATE POLICY bodyshop_repair_cards_update_rbac_v3
ON public.bodyshop_repair_cards
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR (
    (
      public.has_module_modify('service_advisor'::text)
      OR public.has_module_modify('reception'::text)
      OR public.has_module_modify('bodyshop_repair'::text)
    )
    AND (
      (
        reception_entry_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.service_reception_entries sre
          WHERE sre.id = bodyshop_repair_cards.reception_entry_id
            AND public.dealer_code_in_scope(sre.dealer_code)
        )
      )
      OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_'::text, 1))
      OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_'::text, 2))
      OR public.user_has_employee_code(sa_employee_code)
    )
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    (
      public.has_module_modify('service_advisor'::text)
      OR public.has_module_modify('reception'::text)
      OR public.has_module_modify('bodyshop_repair'::text)
    )
    AND (
      (
        reception_entry_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.service_reception_entries sre
          WHERE sre.id = bodyshop_repair_cards.reception_entry_id
            AND public.dealer_code_in_scope(sre.dealer_code)
        )
      )
      OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_'::text, 1))
      OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_'::text, 2))
      OR public.user_has_employee_code(sa_employee_code)
    )
  )
);

COMMIT;
