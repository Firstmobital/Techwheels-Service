-- Body Shop Customer App: Query / Complaint / Chat, reusing complaint_tickets /
-- complaint_messages / complaint_attachments / complaint_notifications
-- unchanged (see ticket_type column added in
-- 20260906090000_bodyshop_customer_app_schema_extensions.sql). No new
-- communication tables are introduced.

CREATE FUNCTION public.customer_list_threads(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_threads jsonb;
BEGIN
  SELECT * INTO v_ctx FROM public.bodyshop_customer_session_context(p_session_token);

  SELECT jsonb_agg(jsonb_build_object(
    'id', t.id,
    'ticket_number', t.ticket_number,
    'ticket_type', t.ticket_type,
    'title', t.title,
    'status', t.status,
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'message_count', (
      SELECT count(*) FROM public.complaint_messages m
      WHERE m.complaint_id = t.id AND m.is_internal = false
    )
  ) ORDER BY t.updated_at DESC)
  INTO v_threads
  FROM public.complaint_tickets t
  WHERE t.reception_entry_id = v_ctx.reception_entry_id;

  RETURN jsonb_build_object('threads', COALESCE(v_threads, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.customer_list_threads(text) IS
  'Lists Query/Complaint/Chat threads for the customer''s reception entry, session-scoped.';

GRANT EXECUTE ON FUNCTION public.customer_list_threads(text) TO anon, authenticated;

CREATE FUNCTION public.customer_get_thread(p_session_token text, p_ticket_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_ticket jsonb;
  v_messages jsonb;
BEGIN
  SELECT * INTO v_ctx FROM public.bodyshop_customer_session_context(p_session_token);

  SELECT jsonb_build_object(
    'id', id, 'ticket_number', ticket_number, 'ticket_type', ticket_type,
    'title', title, 'description', description, 'status', status, 'created_at', created_at
  ) INTO v_ticket
  FROM public.complaint_tickets
  WHERE id = p_ticket_id AND reception_entry_id = v_ctx.reception_entry_id;

  IF v_ticket IS NULL THEN
    RAISE EXCEPTION 'Thread not found';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', m.id,
    'author_type', m.author_type,
    'author_name', m.author_name,
    'body', m.body,
    'created_at', m.created_at,
    'attachments', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'file_name', a.file_name, 'content_type', a.content_type
      ))
      FROM public.complaint_attachments a
      WHERE a.message_id = m.id
    )
  ) ORDER BY m.created_at)
  INTO v_messages
  FROM public.complaint_messages m
  WHERE m.complaint_id = p_ticket_id AND m.is_internal = false;

  RETURN jsonb_build_object('ticket', v_ticket, 'messages', COALESCE(v_messages, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_get_thread(text, bigint) TO anon, authenticated;

CREATE FUNCTION public.customer_submit_thread(
  p_session_token text,
  p_ticket_type text,
  p_title text,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_entry record;
  v_ticket_id bigint;
  v_ticket_number text;
BEGIN
  IF p_ticket_type NOT IN ('query', 'complaint', 'chat') THEN
    RAISE EXCEPTION 'Invalid ticket_type';
  END IF;

  SELECT * INTO v_ctx FROM public.bodyshop_customer_session_context(p_session_token);

  SELECT reg_number, model, jc_number, service_type, branch, owner_name, owner_phone, sa_employee_code
  INTO v_entry
  FROM public.service_reception_entries
  WHERE id = v_ctx.reception_entry_id;

  INSERT INTO public.complaint_tickets (
    dealer_code, reception_entry_id, reg_number, model, jc_number, service_type, branch,
    customer_name, customer_phone, category, title, description, sa_employee_code,
    ticket_type, channel, created_by
  ) VALUES (
    v_ctx.dealer_code, v_ctx.reception_entry_id, v_entry.reg_number, v_entry.model,
    v_entry.jc_number, v_entry.service_type, v_entry.branch,
    v_entry.owner_name, v_entry.owner_phone, 'other', p_title, p_description, v_entry.sa_employee_code,
    p_ticket_type, 'customer_app', 'customer:' || v_ctx.mobile
  )
  RETURNING id, ticket_number INTO v_ticket_id, v_ticket_number;

  INSERT INTO public.complaint_messages (dealer_code, complaint_id, author_type, author_name, body, is_internal)
  VALUES (v_ctx.dealer_code, v_ticket_id, 'customer', v_entry.owner_name, p_description, false);

  INSERT INTO public.complaint_notifications (dealer_code, complaint_id, event_type, recipient_type, channel, status)
  VALUES (v_ctx.dealer_code, v_ticket_id, 'raised', 'staff', 'in_app', 'pending');

  RETURN jsonb_build_object('ticket_id', v_ticket_id, 'ticket_number', v_ticket_number);
END;
$$;

COMMENT ON FUNCTION public.customer_submit_thread(text, text, text, text) IS
  'Creates a Query/Complaint/Chat thread. category is set to ''other'' since it is an unrelated topic-classification axis (see complaint_tickets.category vs. ticket_type) -- staff can reclassify it same as any other ticket.';

GRANT EXECUTE ON FUNCTION public.customer_submit_thread(text, text, text, text) TO anon, authenticated;

CREATE FUNCTION public.customer_post_message(p_session_token text, p_ticket_id bigint, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_entry record;
  v_message_id bigint;
BEGIN
  SELECT * INTO v_ctx FROM public.bodyshop_customer_session_context(p_session_token);

  IF NOT EXISTS (
    SELECT 1 FROM public.complaint_tickets
    WHERE id = p_ticket_id AND reception_entry_id = v_ctx.reception_entry_id
  ) THEN
    RAISE EXCEPTION 'Thread not found';
  END IF;

  SELECT owner_name INTO v_entry FROM public.service_reception_entries WHERE id = v_ctx.reception_entry_id;

  INSERT INTO public.complaint_messages (dealer_code, complaint_id, author_type, author_name, body, is_internal)
  VALUES (v_ctx.dealer_code, p_ticket_id, 'customer', v_entry.owner_name, p_body, false)
  RETURNING id INTO v_message_id;

  UPDATE public.complaint_tickets SET updated_at = now() WHERE id = p_ticket_id;

  INSERT INTO public.complaint_notifications (dealer_code, complaint_id, event_type, recipient_type, channel, status)
  VALUES (v_ctx.dealer_code, p_ticket_id, 'raised', 'staff', 'in_app', 'pending');

  RETURN jsonb_build_object('message_id', v_message_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_post_message(text, bigint, text) TO anon, authenticated;
