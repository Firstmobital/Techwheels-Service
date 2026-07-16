-- ============================================================
-- Fix: bodyshop_repair_cards UPDATE RLS policy
--
-- The existing policy (bodyshop_repair_cards_update_rbac_v2)
-- only allows updates by service_advisor / reception / bodyshop_repair
-- module holders. It does NOT include bodyshop_floor, which means
-- floor users cannot save QC details (qc_status, qc_checked_by, etc.)
-- on repair cards — causing "Failed to save QC details" error.
--
-- Fix: drop and recreate the policy, adding has_module_modify('bodyshop_floor').
-- ============================================================

-- Drop old policy
DROP POLICY IF EXISTS bodyshop_repair_cards_update_rbac_v2 ON public.bodyshop_repair_cards;

-- Recreate with bodyshop_floor included
CREATE POLICY bodyshop_repair_cards_update_rbac_v2 ON public.bodyshop_repair_cards
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_modify('service_advisor'::text)
        OR public.has_module_modify('reception'::text)
        OR public.has_module_modify('bodyshop_repair'::text)
        OR public.has_module_modify('bodyshop_floor'::text)
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
        OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''::text), '_'::text, 1))
        OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''::text), '_'::text, 2))
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
        OR public.has_module_modify('bodyshop_floor'::text)
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
        OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''::text), '_'::text, 1))
        OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''::text), '_'::text, 2))
      )
    )
  );
