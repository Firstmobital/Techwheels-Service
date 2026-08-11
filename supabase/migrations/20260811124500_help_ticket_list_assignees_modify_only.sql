-- HELP-001: Assign/Escalate dropdown only lists employees whose linked user
-- has help_tickets can_modify (edit), or is an admin. Never the full employee_master.

CREATE OR REPLACE FUNCTION public.help_ticket_list_assignees(p_search text DEFAULT NULL)
RETURNS TABLE (
  employee_code text,
  employee_name text,
  department text,
  role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_q text := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  PERFORM public.help_ticket_require_support_modify();

  RETURN QUERY
  SELECT DISTINCT
    em.employee_code,
    em.employee_name,
    em.department,
    em.role
  FROM public.employee_master em
  JOIN public.user_employee_links uel
    ON uel.employee_code = em.employee_code
   AND uel.is_active = true
  JOIN public.users u
    ON u.id = uel.user_id
   AND COALESCE(u.is_active, true) = true
  WHERE (
      u.role = 'admin'
      OR EXISTS (
        SELECT 1
        FROM public.user_module_permissions ump
        JOIN public.modules m ON m.id = ump.module_id
        WHERE ump.user_id = u.id
          AND m.name = 'help_tickets'
          AND COALESCE(ump.can_modify, false) = true
      )
    )
    AND (
      v_q IS NULL
      OR em.employee_code ILIKE '%' || v_q || '%'
      OR em.employee_name ILIKE '%' || v_q || '%'
    )
  ORDER BY em.employee_name
  LIMIT 100;
END;
$$;

COMMENT ON FUNCTION public.help_ticket_list_assignees(text) IS
  'Assignee picker for Help Tickets: only active linked employees whose user has help_tickets can_modify, or admin role.';

GRANT EXECUTE ON FUNCTION public.help_ticket_list_assignees(text) TO authenticated, service_role;
