-- HELP-001 hotfix: Assign/Escalate must include:
-- 1) linked employees with help_tickets.can_modify
-- 2) all active admin/super_admin users (employee link if present, else ADMIN:{uuid} synthetic identity)
-- Admin bypass must NOT require user_employee_links / employee_master mapping.

CREATE OR REPLACE FUNCTION public.help_ticket_admin_identity_code(p_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'ADMIN:' || replace(p_user_id::text, '-', '');
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_user_id_from_admin_identity(p_code text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_hex text;
BEGIN
  IF p_code IS NULL OR p_code NOT LIKE 'ADMIN:%' THEN
    RETURN NULL;
  END IF;
  v_hex := substr(btrim(p_code), 7);
  IF length(v_hex) <> 32 OR v_hex !~ '^[0-9a-fA-F]+$' THEN
    RETURN NULL;
  END IF;
  RETURN (
    substr(v_hex, 1, 8) || '-' ||
    substr(v_hex, 9, 4) || '-' ||
    substr(v_hex, 13, 4) || '-' ||
    substr(v_hex, 17, 4) || '-' ||
    substr(v_hex, 21, 12)
  )::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

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
  WITH eligible AS (
    -- Module edit holders (linked employees)
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
    WHERE EXISTS (
      SELECT 1
      FROM public.user_module_permissions ump
      JOIN public.modules m ON m.id = ump.module_id
      WHERE ump.user_id = u.id
        AND m.name = 'help_tickets'
        AND COALESCE(ump.can_modify, false) = true
    )

    UNION

    -- Admins: linked employee code when present, else synthetic ADMIN:{uuid}
    SELECT DISTINCT
      COALESCE(
        (
          SELECT uel.employee_code
          FROM public.user_employee_links uel
          WHERE uel.user_id = u.id
            AND uel.is_active = true
          ORDER BY uel.is_primary DESC NULLS LAST, uel.updated_at DESC NULLS LAST
          LIMIT 1
        ),
        public.help_ticket_admin_identity_code(u.id)
      ) AS employee_code,
      COALESCE(
        (
          SELECT NULLIF(btrim(em.employee_name), '')
          FROM public.user_employee_links uel
          JOIN public.employee_master em ON em.employee_code = uel.employee_code
          WHERE uel.user_id = u.id
            AND uel.is_active = true
          ORDER BY uel.is_primary DESC NULLS LAST, uel.updated_at DESC NULLS LAST
          LIMIT 1
        ),
        NULLIF(btrim(u.full_name), ''),
        NULLIF(btrim(u.email), ''),
        'Admin'
      ) AS employee_name,
      (
        SELECT em.department
        FROM public.user_employee_links uel
        JOIN public.employee_master em ON em.employee_code = uel.employee_code
        WHERE uel.user_id = u.id
          AND uel.is_active = true
        ORDER BY uel.is_primary DESC NULLS LAST, uel.updated_at DESC NULLS LAST
        LIMIT 1
      ) AS department,
      u.role
    FROM public.users u
    WHERE COALESCE(u.is_active, true) = true
      AND u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])
  )
  SELECT e.employee_code, e.employee_name, e.department, e.role
  FROM eligible e
  WHERE v_q IS NULL
     OR e.employee_code ILIKE '%' || v_q || '%'
     OR e.employee_name ILIKE '%' || v_q || '%'
  ORDER BY e.employee_name
  LIMIT 100;
END;
$$;

COMMENT ON FUNCTION public.help_ticket_list_assignees(text) IS
  'Assignee picker: help_tickets can_modify holders (linked) UNION all active admins (synthetic ADMIN: identity when unlinked).';

-- Resolve assignee display name + notify user for employee_master OR ADMIN: identity
CREATE OR REPLACE FUNCTION public.help_ticket_resolve_assignee(p_code text)
RETURNS TABLE (
  employee_code text,
  employee_name text,
  notify_user_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text := btrim(COALESCE(p_code, ''));
  v_admin_uid uuid;
  v_name text;
  v_uid uuid;
BEGIN
  IF v_code = '' THEN
    RAISE EXCEPTION 'Assignee is required';
  END IF;

  -- Synthetic admin identity (no employee_master required)
  IF v_code LIKE 'ADMIN:%' THEN
    v_admin_uid := public.help_ticket_user_id_from_admin_identity(v_code);
    IF v_admin_uid IS NULL THEN
      RAISE EXCEPTION 'Assignee not found';
    END IF;
    SELECT
      COALESCE(NULLIF(btrim(u.full_name), ''), NULLIF(btrim(u.email), ''), 'Admin'),
      u.id
      INTO v_name, v_uid
    FROM public.users u
    WHERE u.id = v_admin_uid
      AND COALESCE(u.is_active, true) = true
      AND u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]);
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Assignee not found';
    END IF;
    employee_code := v_code;
    employee_name := v_name;
    notify_user_id := v_uid;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT em.employee_name INTO v_name
  FROM public.employee_master em
  WHERE em.employee_code = v_code;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Assignee not found';
  END IF;

  v_uid := public.help_ticket_user_id_for_employee(v_code);

  employee_code := v_code;
  employee_name := v_name;
  notify_user_id := v_uid;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_assign(
  p_ticket_id uuid,
  p_assignee_employee_code text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_ticket public.help_tickets%ROWTYPE;
  v_assignee record;
BEGIN
  PERFORM public.help_ticket_require_support_modify();
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;
  SELECT * INTO v_ticket FROM public.help_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  SELECT * INTO v_assignee
  FROM public.help_ticket_resolve_assignee(p_assignee_employee_code)
  LIMIT 1;

  UPDATE public.help_tickets SET
    assigned_to_employee_code = v_assignee.employee_code,
    assigned_to_name = v_assignee.employee_name,
    assigned_at = now(),
    assigned_by_employee_code = v_emp.employee_code,
    status = CASE WHEN status = 'new' THEN 'open' ELSE status END,
    updated_at = now()
  WHERE id = p_ticket_id;

  PERFORM public.help_ticket_write_audit(
    p_ticket_id, 'assigned', v_ticket.assigned_to_employee_code, v_assignee.employee_code, p_reason,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );

  PERFORM public.help_ticket_emit_notification(
    p_ticket_id, 'assigned', 'assignee', v_assignee.notify_user_id,
    jsonb_build_object('ticket_number', v_ticket.ticket_number, 'assigned_to_name', v_assignee.employee_name)
  );
  PERFORM public.help_ticket_emit_notification(
    p_ticket_id, 'assigned', 'raiser', v_ticket.raised_by_user_id,
    jsonb_build_object('ticket_number', v_ticket.ticket_number, 'assigned_to_name', v_assignee.employee_name)
  );

  RETURN jsonb_build_object('success', true, 'assigned_to_employee_code', v_assignee.employee_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_escalate(
  p_ticket_id uuid,
  p_escalate_to_employee_code text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_ticket public.help_tickets%ROWTYPE;
  v_target record;
BEGIN
  PERFORM public.help_ticket_require_support_modify();
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;
  SELECT * INTO v_ticket FROM public.help_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  SELECT * INTO v_target
  FROM public.help_ticket_resolve_assignee(p_escalate_to_employee_code)
  LIMIT 1;

  UPDATE public.help_tickets SET
    status = 'escalated',
    is_escalated = true,
    escalated_to_employee_code = v_target.employee_code,
    escalated_at = now(),
    escalation_reason = NULLIF(btrim(p_reason), ''),
    assigned_to_employee_code = v_target.employee_code,
    assigned_to_name = v_target.employee_name,
    assigned_at = now(),
    assigned_by_employee_code = v_emp.employee_code,
    updated_at = now()
  WHERE id = p_ticket_id;

  PERFORM public.help_ticket_write_audit(
    p_ticket_id, 'escalated', v_ticket.assigned_to_employee_code, v_target.employee_code, p_reason,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );

  PERFORM public.help_ticket_emit_notification(
    p_ticket_id, 'escalated', 'assignee', v_target.notify_user_id,
    jsonb_build_object('ticket_number', v_ticket.ticket_number)
  );
  PERFORM public.help_ticket_emit_notification(
    p_ticket_id, 'escalated', 'raiser', v_ticket.raised_by_user_id,
    jsonb_build_object('ticket_number', v_ticket.ticket_number)
  );

  RETURN jsonb_build_object('success', true, 'status', 'escalated');
END;
$$;

GRANT EXECUTE ON FUNCTION public.help_ticket_admin_identity_code(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_user_id_from_admin_identity(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_resolve_assignee(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_list_assignees(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_assign(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_escalate(uuid, text, text) TO authenticated, service_role;
