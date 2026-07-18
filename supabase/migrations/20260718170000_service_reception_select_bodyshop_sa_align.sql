-- ⚠️ SUPERSEDED BY 20260718190000_revert_service_reception_rls_recursion.sql
-- DO NOT apply this migration alone. Policy service_reception_select_bodyshop_card_sa_v1
-- causes PostgreSQL 42P17 infinite recursion with bodyshop_repair_cards SELECT RLS.
--
-- Align service_reception_entries SELECT with bodyshop SA workflow.
--
-- Before: service_reception_select_sa required has_module_view + employee_code match.
--         service_reception_update_sa and bodyshop_save_reception_jc_km use modify + code.
--         SAs with modify (but not view) could save via RPC yet read 0 rows in the intake form.
--
-- Add two SELECT policies (OR'd with existing policies):
--   1) modify + own employee_code (mirrors update_sa core gate)
--   2) view/modify + linked bodyshop_repair_cards.sa_employee_code match

CREATE POLICY service_reception_select_sa_modify_v1
ON public.service_reception_entries
FOR SELECT
TO authenticated
USING (
  public.has_module_modify('service_advisor')
  AND sa_employee_code IS NOT NULL
  AND public.user_has_employee_code(sa_employee_code)
);

CREATE POLICY service_reception_select_bodyshop_card_sa_v1
ON public.service_reception_entries
FOR SELECT
TO authenticated
USING (
  (public.has_module_view('service_advisor') OR public.has_module_modify('service_advisor'))
  AND EXISTS (
    SELECT 1
    FROM public.bodyshop_repair_cards brc
    WHERE brc.reception_entry_id = service_reception_entries.id
      AND brc.sa_employee_code IS NOT NULL
      AND public.user_has_employee_code(brc.sa_employee_code)
  )
);
