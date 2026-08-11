-- HELP-001 Phase 1: Help Tickets helpers + SECURITY DEFINER RPCs.
-- Dealer-agnostic: never filter by my_dealer_code() / raiser_dealer_code for ACL.

-- ═══════════════════════════════════════════════════════════════════════════
-- Helpers
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.help_ticket_require_employee()
RETURNS TABLE (
  user_id uuid,
  employee_code text,
  employee_name text,
  email text,
  department text,
  raiser_dealer_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_code := public.my_employee_code();
  IF v_code IS NULL OR btrim(v_code) = '' THEN
    RAISE EXCEPTION 'Employee link required';
  END IF;

  RETURN QUERY
  SELECT
    v_uid,
    v_code,
    COALESCE(NULLIF(btrim(em.employee_name), ''), NULLIF(btrim(u.full_name), ''), v_code),
    u.email,
    em.department,
    uel.dealer_code
  FROM public.users u
  LEFT JOIN public.user_employee_links uel
    ON uel.user_id = u.id
   AND uel.employee_code = v_code
   AND uel.is_active = true
   AND uel.is_primary = true
  LEFT JOIN public.employee_master em
    ON em.employee_code = v_code
  WHERE u.id = v_uid
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_require_support_view()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_view('help_tickets')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_require_support_modify()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('help_tickets')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_can_see(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text := public.my_employee_code();
  v_raiser text;
  v_assignee text;
BEGIN
  -- Org-wide support view / admin — NO dealer_code check
  IF public.is_admin() OR public.has_module_view('help_tickets') THEN
    RETURN true;
  END IF;

  IF v_code IS NULL THEN
    RETURN false;
  END IF;

  SELECT t.raised_by_employee_code, t.assigned_to_employee_code
    INTO v_raiser, v_assignee
  FROM public.help_tickets t
  WHERE t.id = p_ticket_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN v_code = v_raiser OR v_code = v_assignee;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_next_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n bigint;
BEGIN
  v_n := nextval('public.help_ticket_number_seq');
  RETURN 'HT-' || lpad(v_n::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_next_sequence_number(p_ticket_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next bigint;
BEGIN
  PERFORM 1 FROM public.help_tickets WHERE id = p_ticket_id FOR UPDATE;
  SELECT COALESCE(MAX(m.sequence_number), 0) + 1
    INTO v_next
  FROM public.help_ticket_messages m
  WHERE m.ticket_id = p_ticket_id;
  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_calculate_sla_targets(
  p_category_id uuid,
  p_priority text
)
RETURNS TABLE (
  response_minutes integer,
  resolution_minutes integer,
  response_at timestamptz,
  resolution_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_resp integer;
  v_res integer;
  v_mult numeric := 1;
BEGIN
  SELECT c.sla_response_minutes, c.sla_resolution_minutes
    INTO v_resp, v_res
  FROM public.help_ticket_categories c
  WHERE c.id = p_category_id;

  v_resp := COALESCE(v_resp, 240);
  v_res := COALESCE(v_res, 1440);

  IF p_priority = 'urgent' THEN
    v_mult := 0.5;
  ELSIF p_priority = 'high' THEN
    v_mult := 0.75;
  ELSIF p_priority = 'low' THEN
    v_mult := 1.5;
  END IF;

  v_resp := GREATEST(15, ceil(v_resp * v_mult)::integer);
  v_res := GREATEST(30, ceil(v_res * v_mult)::integer);

  RETURN QUERY SELECT
    v_resp,
    v_res,
    now() + make_interval(mins => v_resp),
    now() + make_interval(mins => v_res);
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_write_audit(
  p_ticket_id uuid,
  p_action_type text,
  p_old_value text DEFAULT NULL,
  p_new_value text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_employee_code text DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.help_ticket_audit_log (
    ticket_id, action_type, changed_by_user_id, changed_by_employee_code,
    changed_by_name, old_value, new_value, reason
  ) VALUES (
    p_ticket_id, p_action_type, p_user_id, p_employee_code,
    p_name, p_old_value, p_new_value, p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_emit_notification(
  p_ticket_id uuid,
  p_event_type text,
  p_recipient_type text,
  p_recipient_user_id uuid,
  p_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_recipient_user_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.help_ticket_notifications (
    ticket_id, event_type, recipient_type, recipient_user_id,
    channel, status, payload, sent_at
  ) VALUES (
    p_ticket_id, p_event_type, p_recipient_type, p_recipient_user_id,
    'in_app', 'sent', p_payload, now()
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'help_ticket_notifications outbox write skipped: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_notify_support_holders(
  p_ticket_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  -- Org-wide: all users with help_tickets view or modify (+ admins). No dealer filter.
  FOR r IN
    SELECT DISTINCT u.id AS uid
    FROM public.users u
    WHERE u.is_active = true
      AND (
        u.role = 'admin'
        OR EXISTS (
          SELECT 1
          FROM public.user_module_permissions ump
          JOIN public.modules m ON m.id = ump.module_id
          WHERE ump.user_id = u.id
            AND m.name = 'help_tickets'
            AND (COALESCE(ump.can_view, false) OR COALESCE(ump.can_modify, false))
        )
      )
  LOOP
    PERFORM public.help_ticket_emit_notification(
      p_ticket_id,
      p_event_type,
      CASE WHEN EXISTS (
        SELECT 1 FROM public.users au WHERE au.id = r.uid AND au.role = 'admin'
      ) THEN 'admin' ELSE 'support' END,
      r.uid,
      p_payload
    );
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'help_ticket_notify_support_holders skipped: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_user_id_for_employee(p_employee_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT uel.user_id
  FROM public.user_employee_links uel
  WHERE uel.employee_code = p_employee_code
    AND uel.is_active = true
  ORDER BY uel.is_primary DESC, uel.updated_at DESC
  LIMIT 1;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Employee RPCs
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.help_ticket_list_categories()
RETURNS SETOF public.help_ticket_categories
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM 1 FROM public.help_ticket_require_employee();
  RETURN QUERY
  SELECT c.*
  FROM public.help_ticket_categories c
  WHERE c.is_active = true
  ORDER BY c.label;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_create(
  p_category_key text,
  p_subject text,
  p_description text,
  p_priority text DEFAULT NULL,
  p_severity text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_cat public.help_ticket_categories%ROWTYPE;
  v_priority text;
  v_severity text;
  v_sla record;
  v_id uuid;
  v_number text;
BEGIN
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;

  IF NULLIF(btrim(p_subject), '') IS NULL OR NULLIF(btrim(p_description), '') IS NULL THEN
    RAISE EXCEPTION 'Subject and description are required';
  END IF;

  SELECT * INTO v_cat
  FROM public.help_ticket_categories
  WHERE key = btrim(p_category_key) AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  v_priority := COALESCE(NULLIF(btrim(p_priority), ''), v_cat.default_priority, 'normal');
  IF v_priority NOT IN ('low','normal','high','urgent') THEN
    RAISE EXCEPTION 'Invalid priority';
  END IF;

  v_severity := COALESCE(NULLIF(btrim(p_severity), ''), 'minor');
  IF v_severity NOT IN ('cosmetic','minor','major','critical') THEN
    RAISE EXCEPTION 'Invalid severity';
  END IF;

  SELECT * INTO v_sla
  FROM public.help_ticket_calculate_sla_targets(v_cat.id, v_priority);

  v_number := public.help_ticket_next_number();

  INSERT INTO public.help_tickets (
    ticket_number, raiser_dealer_code,
    raised_by_user_id, raised_by_employee_code, raised_by_name, raised_by_email, raised_by_department,
    category_id, category_key, subject, description,
    status, priority, severity,
    sla_response_target_minutes, sla_resolution_target_minutes,
    sla_response_at, sla_resolution_at
  ) VALUES (
    v_number, v_emp.raiser_dealer_code,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name, v_emp.email, v_emp.department,
    v_cat.id, v_cat.key, btrim(p_subject), btrim(p_description),
    'new', v_priority, v_severity,
    v_sla.response_minutes, v_sla.resolution_minutes,
    v_sla.response_at, v_sla.resolution_at
  )
  RETURNING id INTO v_id;

  PERFORM public.help_ticket_write_audit(
    v_id, 'created', NULL, 'new', NULL,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );

  PERFORM public.help_ticket_notify_support_holders(
    v_id,
    'raised',
    jsonb_build_object(
      'ticket_number', v_number,
      'subject', btrim(p_subject),
      'category_key', v_cat.key,
      'raised_by_name', v_emp.employee_name
    )
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'ticket_number', v_number,
    'status', 'new'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_list_mine(
  p_status text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS SETOF public.help_tickets
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;

  RETURN QUERY
  SELECT t.*
  FROM public.help_tickets t
  WHERE t.raised_by_employee_code = v_emp.employee_code
    AND (p_status IS NULL OR t.status = ANY (p_status))
    AND (p_cursor IS NULL OR t.created_at < p_cursor)
  ORDER BY t.created_at DESC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_get_detail(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_ticket public.help_tickets%ROWTYPE;
  v_is_support boolean;
  v_messages jsonb;
  v_attachments jsonb;
BEGIN
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;

  IF NOT public.help_ticket_can_see(p_ticket_id) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  SELECT * INTO v_ticket FROM public.help_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  v_is_support := public.is_admin() OR public.has_module_view('help_tickets');

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.sequence_number ASC), '[]'::jsonb)
    INTO v_messages
  FROM public.help_ticket_messages m
  WHERE m.ticket_id = p_ticket_id
    AND (v_is_support OR m.visibility = 'public');

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.uploaded_at ASC), '[]'::jsonb)
    INTO v_attachments
  FROM public.help_ticket_attachments a
  WHERE a.ticket_id = p_ticket_id;

  RETURN jsonb_build_object(
    'ticket', to_jsonb(v_ticket),
    'messages', v_messages,
    'attachments', v_attachments,
    'viewer', jsonb_build_object(
      'employee_code', v_emp.employee_code,
      'is_raiser', v_emp.employee_code = v_ticket.raised_by_employee_code,
      'is_support', v_is_support,
      'can_modify', public.is_admin() OR public.has_module_modify('help_tickets')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_send_message(
  p_ticket_id uuid,
  p_message_text text,
  p_visibility text DEFAULT 'public',
  p_parent_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_ticket public.help_tickets%ROWTYPE;
  v_is_support_modify boolean;
  v_is_raiser boolean;
  v_vis text;
  v_type text;
  v_role text;
  v_seq bigint;
  v_msg_id uuid;
  v_notify_uid uuid;
BEGIN
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;

  IF NOT public.help_ticket_can_see(p_ticket_id) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  SELECT * INTO v_ticket FROM public.help_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF v_ticket.status = 'closed' THEN
    RAISE EXCEPTION 'Ticket is closed';
  END IF;

  IF NULLIF(btrim(p_message_text), '') IS NULL THEN
    RAISE EXCEPTION 'Message text is required';
  END IF;

  v_is_support_modify := public.is_admin() OR public.has_module_modify('help_tickets');
  v_is_raiser := v_emp.employee_code = v_ticket.raised_by_employee_code;
  v_vis := COALESCE(NULLIF(btrim(p_visibility), ''), 'public');

  IF v_vis = 'internal' THEN
    IF NOT v_is_support_modify THEN
      RAISE EXCEPTION 'Insufficient permissions for internal notes';
    END IF;
    v_type := 'internal_note';
    v_role := 'support';
  ELSE
    IF NOT (v_is_raiser OR v_is_support_modify OR v_emp.employee_code = v_ticket.assigned_to_employee_code) THEN
      RAISE EXCEPTION 'Insufficient permissions';
    END IF;
    v_vis := 'public';
    v_type := 'user_comment';
    v_role := CASE
      WHEN v_is_support_modify THEN 'support'
      WHEN v_is_raiser THEN 'raiser'
      ELSE 'assignee'
    END;
  END IF;

  v_seq := public.help_ticket_next_sequence_number(p_ticket_id);

  INSERT INTO public.help_ticket_messages (
    ticket_id, created_by_user_id, created_by_employee_code, created_by_name,
    created_by_role, message_text, message_type, visibility, parent_message_id, sequence_number
  ) VALUES (
    p_ticket_id, v_emp.user_id, v_emp.employee_code, v_emp.employee_name,
    v_role, btrim(p_message_text), v_type, v_vis, p_parent_message_id, v_seq
  )
  RETURNING id INTO v_msg_id;

  -- First support public message: new → open; waiting_raiser → in_progress
  IF v_is_support_modify AND v_vis = 'public' THEN
    UPDATE public.help_tickets t SET
      status = CASE
        WHEN t.status = 'waiting_raiser' THEN 'in_progress'
        WHEN t.status = 'new' THEN 'open'
        ELSE t.status
      END,
      first_response_at = COALESCE(t.first_response_at, now()),
      sla_paused = CASE WHEN t.status = 'waiting_raiser' THEN false ELSE t.sla_paused END,
      updated_at = now()
    WHERE t.id = p_ticket_id;
  END IF;

  -- Raiser reply while waiting_raiser → in_progress
  IF v_is_raiser AND v_ticket.status = 'waiting_raiser' THEN
    UPDATE public.help_tickets SET
      status = 'in_progress',
      sla_paused = false,
      updated_at = now()
    WHERE id = p_ticket_id;
  END IF;

  UPDATE public.help_tickets SET updated_at = now() WHERE id = p_ticket_id;

  PERFORM public.help_ticket_write_audit(
    p_ticket_id, 'message_added', NULL, v_vis, NULL,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );

  IF v_vis = 'public' THEN
    IF v_is_raiser THEN
      IF v_ticket.assigned_to_employee_code IS NOT NULL THEN
        v_notify_uid := public.help_ticket_user_id_for_employee(v_ticket.assigned_to_employee_code);
        PERFORM public.help_ticket_emit_notification(
          p_ticket_id, 'message_added', 'assignee', v_notify_uid,
          jsonb_build_object('ticket_number', v_ticket.ticket_number)
        );
      ELSE
        PERFORM public.help_ticket_notify_support_holders(
          p_ticket_id, 'message_added',
          jsonb_build_object('ticket_number', v_ticket.ticket_number)
        );
      END IF;
    ELSE
      PERFORM public.help_ticket_emit_notification(
        p_ticket_id, 'message_added', 'raiser', v_ticket.raised_by_user_id,
        jsonb_build_object('ticket_number', v_ticket.ticket_number)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('message_id', v_msg_id, 'sequence_number', v_seq);
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_verify_resolution(
  p_ticket_id uuid,
  p_verified boolean,
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
  v_new_status text;
BEGIN
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;
  SELECT * INTO v_ticket FROM public.help_tickets WHERE id = p_ticket_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF v_ticket.raised_by_employee_code <> v_emp.employee_code THEN
    RAISE EXCEPTION 'Only ticket raiser can verify resolution';
  END IF;
  IF v_ticket.status NOT IN ('resolved', 'cannot_reproduce') THEN
    RAISE EXCEPTION 'Ticket must be resolved to verify';
  END IF;

  IF p_verified THEN
    v_new_status := 'closed';
    UPDATE public.help_tickets SET
      verification_status = 'verified',
      verified_at = now(),
      verified_by_employee_code = v_emp.employee_code,
      status = 'closed',
      closed_at = now(),
      closure_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'resolved'),
      updated_at = now()
    WHERE id = p_ticket_id;

    PERFORM public.help_ticket_write_audit(
      p_ticket_id, 'verified', v_ticket.status, 'closed', p_reason,
      v_emp.user_id, v_emp.employee_code, v_emp.employee_name
    );
    PERFORM public.help_ticket_notify_support_holders(
      p_ticket_id, 'closed',
      jsonb_build_object('ticket_number', v_ticket.ticket_number)
    );
  ELSE
    v_new_status := 'reopened';
    UPDATE public.help_tickets SET
      verification_status = 'rejected',
      status = 'reopened',
      reopen_count = reopen_count + 1,
      last_reopened_at = now(),
      last_reopened_by_employee_code = v_emp.employee_code,
      resolved_at = NULL,
      sla_paused = false,
      updated_at = now()
    WHERE id = p_ticket_id;

    PERFORM public.help_ticket_write_audit(
      p_ticket_id, 'reopened', v_ticket.status, 'reopened', p_reason,
      v_emp.user_id, v_emp.employee_code, v_emp.employee_name
    );
    PERFORM public.help_ticket_notify_support_holders(
      p_ticket_id, 'reopened',
      jsonb_build_object('ticket_number', v_ticket.ticket_number)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'status', v_new_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_attachment_create(
  p_ticket_id uuid,
  p_original_filename text,
  p_file_size_bytes integer,
  p_file_type text DEFAULT NULL,
  p_message_id uuid DEFAULT NULL,
  p_storage_staging_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_id uuid;
BEGIN
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;

  IF NOT public.help_ticket_can_see(p_ticket_id) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF NULLIF(btrim(p_original_filename), '') IS NULL THEN
    RAISE EXCEPTION 'Filename is required';
  END IF;
  IF p_file_size_bytes IS NULL OR p_file_size_bytes <= 0 OR p_file_size_bytes > 26214400 THEN
    RAISE EXCEPTION 'Invalid file size';
  END IF;

  INSERT INTO public.help_ticket_attachments (
    ticket_id, message_id,
    uploaded_by_user_id, uploaded_by_employee_code, uploaded_by_name,
    original_filename, file_size_bytes, file_type, storage_staging_path, status
  ) VALUES (
    p_ticket_id, p_message_id,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name,
    btrim(p_original_filename), p_file_size_bytes, p_file_type, p_storage_staging_path, 'uploading'
  )
  RETURNING id INTO v_id;

  PERFORM public.help_ticket_write_audit(
    p_ticket_id, 'attachment_added', NULL, v_id::text, NULL,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );

  RETURN jsonb_build_object('id', v_id, 'status', 'uploading');
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_attachment_mark_failed(
  p_attachment_id uuid,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_att public.help_ticket_attachments%ROWTYPE;
BEGIN
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;
  SELECT * INTO v_att FROM public.help_ticket_attachments WHERE id = p_attachment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attachment not found';
  END IF;
  IF v_att.uploaded_by_user_id <> v_emp.user_id
     AND NOT (public.is_admin() OR public.has_module_modify('help_tickets')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  UPDATE public.help_ticket_attachments SET
    status = 'upload_failed',
    error_message = left(COALESCE(p_error, 'upload failed'), 1000)
  WHERE id = p_attachment_id;

  RETURN jsonb_build_object('id', p_attachment_id, 'status', 'upload_failed');
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Support RPCs (web) — org-wide, no dealer ACL
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.help_ticket_list_admin(
  p_status text[] DEFAULT NULL,
  p_assignee_employee_code text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_category_key text DEFAULT NULL,
  p_raiser_dealer_code text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS SETOF public.help_tickets
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  PERFORM public.help_ticket_require_support_view();
  -- Optional raiser_dealer_code is a DISPLAY filter only, not a security gate.

  RETURN QUERY
  SELECT t.*
  FROM public.help_tickets t
  WHERE (p_status IS NULL OR t.status = ANY (p_status))
    AND (p_assignee_employee_code IS NULL OR t.assigned_to_employee_code = p_assignee_employee_code)
    AND (p_priority IS NULL OR t.priority = p_priority)
    AND (p_category_key IS NULL OR t.category_key = p_category_key)
    AND (p_raiser_dealer_code IS NULL OR t.raiser_dealer_code = p_raiser_dealer_code)
    AND (p_cursor IS NULL OR t.created_at < p_cursor)
  ORDER BY t.created_at DESC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_list_assigned_to_me(
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.help_tickets
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  PERFORM public.help_ticket_require_support_view();
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;

  RETURN QUERY
  SELECT t.*
  FROM public.help_tickets t
  WHERE t.assigned_to_employee_code = v_emp.employee_code
    AND t.status <> 'closed'
  ORDER BY t.created_at DESC
  LIMIT v_limit;
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
  v_assignee_name text;
  v_notify_uid uuid;
BEGIN
  PERFORM public.help_ticket_require_support_modify();
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;
  SELECT * INTO v_ticket FROM public.help_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  SELECT em.employee_name INTO v_assignee_name
  FROM public.employee_master em
  WHERE em.employee_code = btrim(p_assignee_employee_code);

  IF v_assignee_name IS NULL THEN
    RAISE EXCEPTION 'Assignee not found';
  END IF;

  UPDATE public.help_tickets SET
    assigned_to_employee_code = btrim(p_assignee_employee_code),
    assigned_to_name = v_assignee_name,
    assigned_at = now(),
    assigned_by_employee_code = v_emp.employee_code,
    status = CASE WHEN status = 'new' THEN 'open' ELSE status END,
    updated_at = now()
  WHERE id = p_ticket_id;

  PERFORM public.help_ticket_write_audit(
    p_ticket_id, 'assigned', v_ticket.assigned_to_employee_code, btrim(p_assignee_employee_code), p_reason,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );

  v_notify_uid := public.help_ticket_user_id_for_employee(btrim(p_assignee_employee_code));
  PERFORM public.help_ticket_emit_notification(
    p_ticket_id, 'assigned', 'assignee', v_notify_uid,
    jsonb_build_object('ticket_number', v_ticket.ticket_number, 'assigned_to_name', v_assignee_name)
  );
  PERFORM public.help_ticket_emit_notification(
    p_ticket_id, 'assigned', 'raiser', v_ticket.raised_by_user_id,
    jsonb_build_object('ticket_number', v_ticket.ticket_number, 'assigned_to_name', v_assignee_name)
  );

  RETURN jsonb_build_object('success', true, 'assigned_to_employee_code', btrim(p_assignee_employee_code));
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_update_status(
  p_ticket_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_resolution_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_ticket public.help_tickets%ROWTYPE;
  v_new text := btrim(p_new_status);
BEGIN
  PERFORM public.help_ticket_require_support_modify();
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;
  SELECT * INTO v_ticket FROM public.help_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  IF v_new NOT IN (
    'open','in_progress','waiting_raiser','on_hold','escalated',
    'resolved','cannot_reproduce','closed','reopened'
  ) THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  -- Raiser verification gate: support cannot force closed unless already verified/auto
  IF v_new = 'closed' AND v_ticket.verification_status NOT IN ('verified', 'auto_closed')
     AND v_ticket.status <> 'cannot_reproduce' THEN
    RAISE EXCEPTION 'Cannot close until raiser verifies (or use cannot_reproduce flow)';
  END IF;

  UPDATE public.help_tickets SET
    status = v_new,
    sla_paused = (v_new IN ('waiting_raiser', 'on_hold')),
    resolved_at = CASE WHEN v_new = 'resolved' THEN now()
                       WHEN v_new IN ('reopened', 'in_progress', 'open') THEN NULL
                       ELSE resolved_at END,
    verification_status = CASE
      WHEN v_new = 'resolved' THEN 'pending'
      WHEN v_new = 'closed' AND verification_status = 'pending' THEN verification_status
      ELSE verification_status
    END,
    resolution_notes = COALESCE(NULLIF(btrim(p_resolution_notes), ''), resolution_notes),
    closed_at = CASE WHEN v_new = 'closed' THEN COALESCE(closed_at, now()) ELSE closed_at END,
    updated_at = now()
  WHERE id = p_ticket_id;

  PERFORM public.help_ticket_write_audit(
    p_ticket_id, 'status_changed', v_ticket.status, v_new, p_reason,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );

  IF v_new = 'resolved' THEN
    PERFORM public.help_ticket_emit_notification(
      p_ticket_id, 'resolved', 'raiser', v_ticket.raised_by_user_id,
      jsonb_build_object('ticket_number', v_ticket.ticket_number)
    );
  ELSE
    PERFORM public.help_ticket_emit_notification(
      p_ticket_id, 'status_changed', 'raiser', v_ticket.raised_by_user_id,
      jsonb_build_object('ticket_number', v_ticket.ticket_number, 'status', v_new)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'status', v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_update_priority(
  p_ticket_id uuid,
  p_priority text,
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
  v_pri text := btrim(p_priority);
BEGIN
  PERFORM public.help_ticket_require_support_modify();
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;
  SELECT * INTO v_ticket FROM public.help_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF v_pri NOT IN ('low','normal','high','urgent') THEN
    RAISE EXCEPTION 'Invalid priority';
  END IF;

  UPDATE public.help_tickets SET priority = v_pri, updated_at = now() WHERE id = p_ticket_id;

  PERFORM public.help_ticket_write_audit(
    p_ticket_id, 'priority_changed', v_ticket.priority, v_pri, p_reason,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );

  RETURN jsonb_build_object('success', true, 'priority', v_pri);
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_hold(
  p_ticket_id uuid,
  p_hold_reason text,
  p_detail text DEFAULT NULL,
  p_expected_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
  v_ticket public.help_tickets%ROWTYPE;
BEGIN
  PERFORM public.help_ticket_require_support_modify();
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;
  SELECT * INTO v_ticket FROM public.help_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  UPDATE public.help_tickets SET
    status = 'on_hold',
    sla_paused = true,
    hold_reason = NULLIF(btrim(p_hold_reason), ''),
    hold_reason_detail = NULLIF(btrim(p_detail), ''),
    held_at = now(),
    due_date = COALESCE(p_expected_date, due_date),
    updated_at = now()
  WHERE id = p_ticket_id;

  PERFORM public.help_ticket_write_audit(
    p_ticket_id, 'held', v_ticket.status, 'on_hold', p_hold_reason,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );
  PERFORM public.help_ticket_emit_notification(
    p_ticket_id, 'held', 'raiser', v_ticket.raised_by_user_id,
    jsonb_build_object('ticket_number', v_ticket.ticket_number)
  );

  RETURN jsonb_build_object('success', true, 'status', 'on_hold');
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
  v_name text;
  v_notify_uid uuid;
BEGIN
  PERFORM public.help_ticket_require_support_modify();
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;
  SELECT * INTO v_ticket FROM public.help_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  SELECT em.employee_name INTO v_name
  FROM public.employee_master em
  WHERE em.employee_code = btrim(p_escalate_to_employee_code);

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Escalation target not found';
  END IF;

  UPDATE public.help_tickets SET
    status = 'escalated',
    is_escalated = true,
    escalated_to_employee_code = btrim(p_escalate_to_employee_code),
    escalated_at = now(),
    escalation_reason = NULLIF(btrim(p_reason), ''),
    assigned_to_employee_code = btrim(p_escalate_to_employee_code),
    assigned_to_name = v_name,
    assigned_at = now(),
    assigned_by_employee_code = v_emp.employee_code,
    updated_at = now()
  WHERE id = p_ticket_id;

  PERFORM public.help_ticket_write_audit(
    p_ticket_id, 'escalated', v_ticket.assigned_to_employee_code, btrim(p_escalate_to_employee_code), p_reason,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );

  v_notify_uid := public.help_ticket_user_id_for_employee(btrim(p_escalate_to_employee_code));
  PERFORM public.help_ticket_emit_notification(
    p_ticket_id, 'escalated', 'assignee', v_notify_uid,
    jsonb_build_object('ticket_number', v_ticket.ticket_number)
  );
  PERFORM public.help_ticket_emit_notification(
    p_ticket_id, 'escalated', 'raiser', v_ticket.raised_by_user_id,
    jsonb_build_object('ticket_number', v_ticket.ticket_number)
  );

  RETURN jsonb_build_object('success', true, 'status', 'escalated');
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_mark_duplicate(
  p_ticket_id uuid,
  p_duplicate_of_ticket_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp record;
BEGIN
  PERFORM public.help_ticket_require_support_modify();
  SELECT * INTO v_emp FROM public.help_ticket_require_employee() LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM public.help_tickets WHERE id = p_ticket_id) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.help_tickets WHERE id = p_duplicate_of_ticket_id) THEN
    RAISE EXCEPTION 'Original ticket not found';
  END IF;
  IF p_ticket_id = p_duplicate_of_ticket_id THEN
    RAISE EXCEPTION 'Cannot mark ticket as duplicate of itself';
  END IF;

  UPDATE public.help_tickets SET
    is_duplicate = true,
    duplicate_of_ticket_id = p_duplicate_of_ticket_id,
    status = 'closed',
    verification_status = 'auto_closed',
    closed_at = now(),
    closure_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'duplicate'),
    updated_at = now()
  WHERE id = p_ticket_id;

  PERFORM public.help_ticket_write_audit(
    p_ticket_id, 'closed', NULL, p_duplicate_of_ticket_id::text, p_reason,
    v_emp.user_id, v_emp.employee_code, v_emp.employee_name
  );

  RETURN jsonb_build_object('success', true, 'duplicate_of_ticket_id', p_duplicate_of_ticket_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.help_ticket_get_audit_log(p_ticket_id uuid)
RETURNS SETOF public.help_ticket_audit_log
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.help_ticket_require_support_view();
  IF NOT EXISTS (SELECT 1 FROM public.help_tickets WHERE id = p_ticket_id) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.help_ticket_audit_log a
  WHERE a.ticket_id = p_ticket_id
  ORDER BY a.changed_at DESC;
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
  SELECT em.employee_code, em.employee_name, em.department, em.role
  FROM public.employee_master em
  WHERE v_q IS NULL
     OR em.employee_code ILIKE '%' || v_q || '%'
     OR em.employee_name ILIKE '%' || v_q || '%'
  ORDER BY em.employee_name
  LIMIT 50;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Notification RPCs
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.list_my_help_ticket_notifications(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_include_dismissed boolean DEFAULT false
)
RETURNS TABLE (
  id bigint,
  ticket_id uuid,
  event_type text,
  recipient_type text,
  channel text,
  status text,
  payload jsonb,
  created_at timestamptz,
  seen_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    n.id, n.ticket_id, n.event_type, n.recipient_type, n.channel, n.status,
    n.payload, n.created_at, n.seen_at, n.read_at, n.dismissed_at
  FROM public.help_ticket_notifications n
  WHERE n.channel = 'in_app'
    AND n.recipient_user_id = auth.uid()
    AND (p_include_dismissed OR n.dismissed_at IS NULL)
  ORDER BY n.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.get_unread_help_ticket_notification_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM public.help_ticket_notifications n
  WHERE n.channel = 'in_app'
    AND n.recipient_user_id = auth.uid()
    AND n.dismissed_at IS NULL
    AND n.read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.mark_help_ticket_notification_read(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.help_ticket_notifications
  SET read_at = COALESCE(read_at, now()),
      seen_at = COALESCE(seen_at, now())
  WHERE id = p_id
    AND recipient_user_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_help_ticket_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.help_ticket_notifications
  SET read_at = COALESCE(read_at, now()),
      seen_at = COALESCE(seen_at, now())
  WHERE recipient_user_id = auth.uid()
    AND dismissed_at IS NULL
    AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'updated', v_count);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants
-- ═══════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.help_ticket_require_employee() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_require_support_view() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_require_support_modify() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_can_see(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_next_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_next_sequence_number(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_calculate_sla_targets(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_write_audit(uuid, text, text, text, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_emit_notification(uuid, text, text, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_notify_support_holders(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_user_id_for_employee(text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.help_ticket_list_categories() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_create(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_list_mine(text[], integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_get_detail(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_send_message(uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_verify_resolution(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_attachment_create(uuid, text, integer, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_attachment_mark_failed(uuid, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.help_ticket_list_admin(text[], text, text, text, text, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_list_assigned_to_me(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_assign(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_update_status(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_update_priority(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_hold(uuid, text, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_escalate(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_mark_duplicate(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_get_audit_log(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_list_assignees(text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_my_help_ticket_notifications(integer, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unread_help_ticket_notification_count() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_help_ticket_notification_read(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_all_help_ticket_notifications_read() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.help_ticket_require_employee() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.help_ticket_create(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.help_ticket_list_admin(text[], text, text, text, text, integer, timestamptz) FROM PUBLIC;
