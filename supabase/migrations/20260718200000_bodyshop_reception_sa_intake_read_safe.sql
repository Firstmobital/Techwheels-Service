-- Allow bodyshop SAs to READ reception JC/KM when they are SA on the linked repair card
-- but not on the source reception row (common when reception.service_type != Accident).
--
-- Evidence (authoritative dump full_database.sql):
--   reception id 3052  reg RJ60CG7594  sa_employee_code A6_3000840
--   bodyshop_repair_cards id 393  reception_entry_id 3052  sa_employee_code PAG1_3000840
--   Admin reads via admin_unrestricted_all_ops_v1; Aman fails service_reception_select_sa
--   because user_has_employee_code(A6_3000840) is false for PAG1_3000840.
--
-- bodyshop_save_reception_jc_km (full_metadata.sql) already authorizes WRITE via linked card SA.
-- This adds the matching READ path using SECURITY DEFINER to avoid the 42P17 recursion that
-- occurred when bodyshop_repair_cards was referenced directly inside an RLS policy.

CREATE OR REPLACE FUNCTION public.bodyshop_can_read_reception_via_linked_card(p_reception_entry_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_admin()
    OR (
      (public.has_module_view('service_advisor') OR public.has_module_modify('service_advisor'))
      AND EXISTS (
        SELECT 1
        FROM public.bodyshop_repair_cards brc
        WHERE brc.reception_entry_id = p_reception_entry_id
          AND brc.sa_employee_code IS NOT NULL
          AND public.user_has_employee_code(brc.sa_employee_code)
      )
    );
$$;

COMMENT ON FUNCTION public.bodyshop_can_read_reception_via_linked_card(p_reception_entry_id bigint) IS
  'SECURITY DEFINER intake read gate: true when caller is admin or mapped SA on a bodyshop_repair_cards row linked to this reception. Matches bodyshop_save_reception_jc_km write auth without cross-table RLS recursion.';

GRANT EXECUTE ON FUNCTION public.bodyshop_can_read_reception_via_linked_card(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bodyshop_can_read_reception_via_linked_card(bigint) TO service_role;

-- SA with modify (but not view) on own reception sa_employee_code — mirrors update_sa, no cross-table join.
CREATE POLICY service_reception_select_sa_modify_v1
ON public.service_reception_entries
FOR SELECT
TO authenticated
USING (
  public.has_module_modify('service_advisor')
  AND sa_employee_code IS NOT NULL
  AND public.user_has_employee_code(sa_employee_code)
);

-- Linked repair-card SA path (Aman on RJ60CG7594 / reception 3052).
CREATE POLICY service_reception_select_bodyshop_linked_sa_v1
ON public.service_reception_entries
FOR SELECT
TO authenticated
USING (public.bodyshop_can_read_reception_via_linked_card(id));
