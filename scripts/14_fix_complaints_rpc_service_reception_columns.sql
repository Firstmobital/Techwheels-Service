-- ============================================================================
-- HOTFIX: complaints RPCs using removed service_reception_entries.data column
-- Scope: get_complaint_by_token, raise_complaint
-- Authority: local_folder/backups/full_database.sql chunks (service_reception_entries has direct columns)
-- Run: execute manually in Supabase SQL Editor
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_complaint_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link_id bigint;
  v_complaint_id bigint;
  v_entry_id bigint;
  v_status text;
  v_mode text;
  v_ticket jsonb;
  v_messages jsonb;
  v_activity jsonb;
  v_entry_summary jsonb;
BEGIN
  -- Find the link by token
  SELECT id, complaint_id, reception_entry_id, status
  INTO v_link_id, v_complaint_id, v_entry_id, v_status
  FROM public.complaint_access_links
  WHERE token = p_token;

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired complaint link';
  END IF;

  -- Bump view count and last_viewed_at
  UPDATE public.complaint_access_links
  SET view_count = view_count + 1, last_viewed_at = now()
  WHERE id = v_link_id;

  -- Determine mode: 'raise' if no complaint yet, 'view' if raised
  IF v_complaint_id IS NULL THEN
    v_mode := 'raise';
  ELSE
    v_mode := 'view';
  END IF;

  -- Get entry summary from direct columns (authoritative schema)
  SELECT jsonb_build_object(
    'reception_entry_id', id,
    'reg_number', reg_number,
    'jc_number', jc_number,
    'model', model,
    'customer_name', owner_name,
    'service_type', service_type,
    'branch', branch
  ) INTO v_entry_summary
  FROM public.service_reception_entries
  WHERE id = v_entry_id;

  -- If in view mode, fetch the full ticket + messages + activity
  IF v_mode = 'view' THEN
    SELECT jsonb_build_object(
      'id', id,
      'ticket_number', ticket_number,
      'status', status,
      'priority', priority,
      'category', category,
      'title', title,
      'description', description,
      'severity_self', severity_self,
      'created_at', created_at,
      'response_due_at', response_due_at,
      'resolution_due_at', resolution_due_at,
      'first_response_at', first_response_at,
      'resolved_at', resolved_at,
      'csat_rating', csat_rating,
      'assigned_to_name', (SELECT full_name FROM public.users WHERE id = complaint_tickets.assigned_to),
      'sla_status', CASE
        WHEN now() > resolution_due_at AND status NOT IN ('resolved','closed') THEN 'breached'
        WHEN now() > response_due_at AND first_response_at IS NULL THEN 'warning'
        ELSE 'ok'
      END
    ) INTO v_ticket
    FROM public.complaint_tickets
    WHERE id = v_complaint_id;

    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'author_type', author_type,
      'author_name', author_name,
      'body', body,
      'created_at', created_at
    ) ORDER BY created_at)
    INTO v_messages
    FROM public.complaint_messages
    WHERE complaint_id = v_complaint_id
      AND is_internal = false;

    SELECT jsonb_agg(jsonb_build_object(
      'event_type', event_type,
      'from_value', from_value,
      'to_value', to_value,
      'actor_name', actor_name,
      'created_at', created_at
    ) ORDER BY created_at)
    INTO v_activity
    FROM public.complaint_activity
    WHERE complaint_id = v_complaint_id;
  ELSE
    v_ticket := NULL;
    v_messages := NULL;
    v_activity := NULL;
  END IF;

  RETURN jsonb_build_object(
    'mode', v_mode,
    'link_token', p_token,
    'entry_summary', v_entry_summary,
    'ticket', v_ticket,
    'messages', v_messages,
    'activity', v_activity
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.raise_complaint(
  p_token text,
  p_category text,
  p_title text,
  p_description text,
  p_severity_self text DEFAULT NULL::text,
  p_customer_name text DEFAULT NULL::text,
  p_customer_phone text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link_id bigint;
  v_entry_id bigint;
  v_dealer_code text;
  v_status text;
  v_ticket_id bigint;
  v_sa_code text;
  v_branch text;
  v_reg_number text;
  v_model text;
  v_jc_number text;
  v_service_type text;
  v_owner_name text;
  v_owner_phone text;
  v_customer_name text;
BEGIN
  -- Find & validate link
  SELECT id, reception_entry_id, dealer_code, status
  INTO v_link_id, v_entry_id, v_dealer_code, v_status
  FROM public.complaint_access_links
  WHERE token = p_token;

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'Invalid complaint link';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'This link has already been used or revoked. Cannot raise another complaint.';
  END IF;

  -- Get entry data from direct columns (authoritative schema)
  SELECT
    sa_employee_code,
    branch,
    reg_number,
    model,
    jc_number,
    service_type,
    owner_name,
    owner_phone
  INTO
    v_sa_code,
    v_branch,
    v_reg_number,
    v_model,
    v_jc_number,
    v_service_type,
    v_owner_name,
    v_owner_phone
  FROM public.service_reception_entries
  WHERE id = v_entry_id;

  v_customer_name := COALESCE(NULLIF(btrim(p_customer_name), ''), NULLIF(btrim(v_owner_name), ''), 'Customer');

  INSERT INTO public.complaint_tickets (
    dealer_code,
    reception_entry_id,
    reg_number,
    model,
    jc_number,
    service_type,
    branch,
    customer_name,
    customer_phone,
    category,
    title,
    description,
    severity_self,
    sa_employee_code
  ) VALUES (
    v_dealer_code,
    v_entry_id,
    v_reg_number,
    v_model,
    v_jc_number,
    v_service_type,
    v_branch,
    v_customer_name,
    COALESCE(NULLIF(btrim(p_customer_phone), ''), v_owner_phone),
    p_category,
    p_title,
    p_description,
    p_severity_self,
    v_sa_code
  )
  RETURNING id INTO v_ticket_id;

  -- Mark link as consumed
  UPDATE public.complaint_access_links
  SET status = 'consumed', complaint_id = v_ticket_id, consumed_at = now()
  WHERE id = v_link_id;

  -- Write opening customer message
  INSERT INTO public.complaint_messages (
    dealer_code, complaint_id, author_type, author_name, body
  ) VALUES (
    v_dealer_code, v_ticket_id, 'customer', v_customer_name, p_description
  );

  -- Write activity: 'raised' event
  INSERT INTO public.complaint_activity (
    dealer_code, complaint_id, event_type, actor_type, actor_name, note
  ) VALUES (
    v_dealer_code, v_ticket_id, 'raised', 'customer', v_customer_name,
    'Complaint raised via secure link'
  );

  RETURN public.get_complaint_by_token(p_token);
END;
$$;

COMMIT;
