-- ============================================================================
-- COMPLAINTS MODULE — PHASE 2: RPC FUNCTIONS (ANON & STAFF)
-- ============================================================================
-- Created: 2026-06-09
-- Scope: Customer-facing RPCs (SECURITY DEFINER, anon access)
--        Staff RPCs (authenticated, module-gated)
--        Utility & background job functions
-- Depends on: Phase 1 schema + Phase 1.1 triggers
-- ============================================================================

-- ============================================================================
-- SECTION A: ANONYMOUS (CUSTOMER) RPCs — SECURITY DEFINER
-- ============================================================================
-- These are the ONLY gateway for unauthenticated customer access.
-- Never grant anon direct table access; all flows go through these RPCs.

-- ============================================================================
-- A.1: get_complaint_by_token(p_token)
-- ============================================================================
-- Retrieves ticket summary + thread + status for a customer (anonymous).
-- Bumps view count. Returns mode ('raise' or 'view') + entry summary.

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
  
  -- Get entry summary (frozen at reception time)
  SELECT jsonb_build_object(
    'reception_entry_id', id,
    'reg_number', data->>'reg_number',
    'model', data->>'model',
    'customer_name', data->>'customer_name',
    'service_type', data->>'service_type',
    'branch', data->>'branch'
  ) INTO v_entry_summary
  FROM public.service_reception_entries
  WHERE id = v_entry_id;
  
  -- If in view mode, fetch the full ticket + messages + activity
  IF v_mode = 'view' THEN
    -- Ticket summary
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
        WHEN now() > resolution_due_at AND status NOT IN ('resolved','closed')
        THEN 'breached'
        WHEN now() > response_due_at AND first_response_at IS NULL
        THEN 'warning'
        ELSE 'ok'
      END
    ) INTO v_ticket
    FROM public.complaint_tickets
    WHERE id = v_complaint_id;
    
    -- Messages (exclude internal notes)
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'author_type', author_type,
      'author_name', author_name,
      'body', body,
      'created_at', created_at
    ) ORDER BY created_at)
    INTO v_messages
    FROM public.complaint_messages
    WHERE complaint_id = v_complaint_id AND is_internal = false;
    
    -- Activity (summary)
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

GRANT EXECUTE ON FUNCTION public.get_complaint_by_token(text) TO anon;

-- ============================================================================
-- A.2: raise_complaint(p_token, p_category, p_title, p_description, ...)
-- ============================================================================
-- Single-use raise. Rejects if link status ≠ 'active'.
-- Creates ticket, consumes link, writes activity & opening message.

CREATE OR REPLACE FUNCTION public.raise_complaint(
  p_token text,
  p_category text,
  p_title text,
  p_description text,
  p_severity_self text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL
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
  v_entry_data jsonb;
  v_sa_code text;
  v_branch text;
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
  
  -- Get entry data
  SELECT (data->>'sa_employee_code'), (data->>'branch'), data
  INTO v_sa_code, v_branch, v_entry_data
  FROM public.service_reception_entries
  WHERE id = v_entry_id;
  
  -- Create the complaint ticket
  INSERT INTO public.complaint_tickets (
    dealer_code, reception_entry_id,
    reg_number, model, jc_number, service_type, branch,
    customer_name, customer_phone,
    category, title, description, severity_self,
    sa_employee_code
  ) VALUES (
    v_dealer_code, v_entry_id,
    v_entry_data->>'reg_number',
    v_entry_data->>'model',
    v_entry_data->>'jc_number',
    v_entry_data->>'service_type',
    v_branch,
    COALESCE(p_customer_name, v_entry_data->>'customer_name'),
    p_customer_phone,
    p_category, p_title, p_description, p_severity_self,
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
    v_dealer_code, v_ticket_id, 'customer', p_customer_name, p_description
  );
  
  -- Write activity: 'raised' event
  INSERT INTO public.complaint_activity (
    dealer_code, complaint_id, event_type, actor_type, actor_name, note
  ) VALUES (
    v_dealer_code, v_ticket_id, 'raised', 'customer', p_customer_name,
    'Complaint raised via secure link'
  );
  
  -- Return the newly created ticket in view mode
  RETURN public.get_complaint_by_token(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.raise_complaint(text, text, text, text, text, text, text) TO anon;

-- ============================================================================
-- A.3: add_customer_message(p_token, p_body)
-- ============================================================================
-- Customer adds a reply. Validates token, appends to thread.

CREATE OR REPLACE FUNCTION public.add_customer_message(p_token text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_complaint_id bigint;
  v_customer_name text;
  v_dealer_code text;
BEGIN
  SELECT complaint_id INTO v_complaint_id
  FROM public.complaint_access_links
  WHERE token = p_token AND status = 'consumed';
  
  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive complaint link';
  END IF;
  
  -- Get customer name and dealer from the ticket
  SELECT customer_name, dealer_code INTO v_customer_name, v_dealer_code
  FROM public.complaint_tickets
  WHERE id = v_complaint_id;
  
  -- Add customer message (never is_internal)
  INSERT INTO public.complaint_messages (
    dealer_code, complaint_id, author_type, author_name, body, is_internal
  ) VALUES (
    v_dealer_code, v_complaint_id, 'customer', v_customer_name, p_body, false
  );
  
  -- Return updated view
  RETURN public.get_complaint_by_token(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_customer_message(text, text) TO anon;

-- ============================================================================
-- A.4: submit_csat(p_token, p_rating, p_comment)
-- ============================================================================
-- Customer rates the resolution (1–5 stars).

CREATE OR REPLACE FUNCTION public.submit_csat(
  p_token text,
  p_rating integer,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_complaint_id bigint;
  v_dealer_code text;
BEGIN
  SELECT complaint_id INTO v_complaint_id
  FROM public.complaint_access_links
  WHERE token = p_token AND status = 'consumed';
  
  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'Invalid complaint link';
  END IF;
  
  SELECT dealer_code INTO v_dealer_code
  FROM public.complaint_tickets
  WHERE id = v_complaint_id;
  
  -- Update CSAT fields
  UPDATE public.complaint_tickets
  SET csat_rating = p_rating, csat_comment = p_comment, csat_at = now()
  WHERE id = v_complaint_id;
  
  -- Log activity
  INSERT INTO public.complaint_activity (
    dealer_code, complaint_id, event_type, to_value, actor_type, actor_name
  ) VALUES (
    v_dealer_code, v_complaint_id, 'csat',
    p_rating::text, 'customer', 'customer'
  );
  
  RETURN public.get_complaint_by_token(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_csat(text, integer, text) TO anon;

-- ============================================================================
-- A.5: reopen_complaint(p_token, p_reason)
-- ============================================================================
-- Customer reopens a resolved/closed ticket. Auto-escalates to branch manager.

CREATE OR REPLACE FUNCTION public.reopen_complaint(
  p_token text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_complaint_id bigint;
  v_dealer_code text;
  v_status text;
  v_customer_name text;
  v_priority text;
  v_resolution_mins integer;
BEGIN
  SELECT complaint_id INTO v_complaint_id
  FROM public.complaint_access_links
  WHERE token = p_token AND status = 'consumed';
  
  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'Invalid complaint link';
  END IF;
  
  SELECT dealer_code, status, customer_name, priority
  INTO v_dealer_code, v_status, v_customer_name, v_priority
  FROM public.complaint_tickets
  WHERE id = v_complaint_id;
  
  IF v_status NOT IN ('resolved', 'closed') THEN
    RAISE EXCEPTION 'Ticket is not in a reopenable state';
  END IF;
  
  -- Get SLA resolution time for this priority
  SELECT resolution_mins INTO v_resolution_mins
  FROM public.complaint_sla_policies
  WHERE dealer_code = v_dealer_code AND priority = v_priority;
  
  -- Reopen: status → reopened, escalate, restart resolution SLA
  UPDATE public.complaint_tickets
  SET
    status = 'reopened',
    reopened_at = now(),
    is_escalated = true,
    escalated_at = now(),
    escalation_reason = p_reason,
    resolution_due_at = now() + (COALESCE(v_resolution_mins, 1440) || ' minutes')::interval
  WHERE id = v_complaint_id;
  
  -- Log activity
  INSERT INTO public.complaint_activity (
    dealer_code, complaint_id, event_type, actor_type, actor_name, note
  ) VALUES (
    v_dealer_code, v_complaint_id, 'reopened', 'customer', v_customer_name,
    'Reopened by customer: ' || p_reason
  );
  
  -- Return updated view
  RETURN public.get_complaint_by_token(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_complaint(text, text) TO anon;

-- ============================================================================
-- SECTION B: STAFF RPCs — GATED BY has_module_modify('complaints')
-- ============================================================================

-- ============================================================================
-- B.1: acknowledge(p_complaint_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.acknowledge(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET status = 'acknowledged'
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('status', 'acknowledged');
END;
$$;

GRANT EXECUTE ON FUNCTION public.acknowledge(bigint) TO authenticated;

-- ============================================================================
-- B.2: start_progress(p_complaint_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_progress(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET status = 'in_progress'
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('status', 'in_progress');
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_progress(bigint) TO authenticated;

-- ============================================================================
-- B.3: resolve(p_complaint_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET status = 'resolved'
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('status', 'resolved');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve(bigint) TO authenticated;

-- ============================================================================
-- B.4: close(p_complaint_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.close(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET status = 'closed'
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('status', 'closed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.close(bigint) TO authenticated;

-- ============================================================================
-- B.5: set_priority(p_complaint_id, p_priority)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_priority(
  p_complaint_id bigint,
  p_priority text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET priority = p_priority
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('priority', p_priority);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_priority(bigint, text) TO authenticated;

-- ============================================================================
-- B.6: reassign(p_complaint_id, p_assigned_to_user_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reassign(
  p_complaint_id bigint,
  p_assigned_to_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET assigned_to = p_assigned_to_user_id
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('assigned_to', p_assigned_to_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign(bigint, uuid) TO authenticated;

-- ============================================================================
-- B.7: escalate(p_complaint_id, p_escalation_reason)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.escalate(
  p_complaint_id bigint,
  p_escalation_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET
    is_escalated = true,
    escalated_at = now(),
    escalation_reason = p_escalation_reason
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('is_escalated', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.escalate(bigint, text) TO authenticated;

-- ============================================================================
-- B.8: add_staff_message(p_complaint_id, p_body, p_is_internal)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_staff_message(
  p_complaint_id bigint,
  p_body text,
  p_is_internal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dealer_code text;
  v_staff_name text;
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  SELECT dealer_code INTO v_dealer_code
  FROM public.complaint_tickets
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  IF v_dealer_code IS NULL THEN
    RAISE EXCEPTION 'Complaint not found';
  END IF;
  
  SELECT full_name INTO v_staff_name FROM public.users WHERE id = auth.uid();
  
  INSERT INTO public.complaint_messages (
    dealer_code, complaint_id, author_type, author_id, author_name, body, is_internal
  ) VALUES (
    v_dealer_code, p_complaint_id, 'staff', auth.uid(), v_staff_name, p_body, p_is_internal
  );
  
  RETURN jsonb_build_object('message_added', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_staff_message(bigint, text, boolean) TO authenticated;

-- ============================================================================
-- SECTION C: UTILITY FUNCTIONS
-- ============================================================================

-- ============================================================================
-- C.1: generate_complaint_link(p_reception_entry_id)
-- ============================================================================
-- Mint a new customer URL token for a reception entry.

CREATE OR REPLACE FUNCTION public.generate_complaint_link(p_reception_entry_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dealer_code text;
  v_token text;
  v_link_id bigint;
BEGIN
  -- Require staff permission
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  SELECT dealer_code INTO v_dealer_code
  FROM public.service_reception_entries
  WHERE id = p_reception_entry_id;
  
  IF v_dealer_code IS NULL THEN
    RAISE EXCEPTION 'Reception entry not found';
  END IF;
  
  -- Generate a 128-bit random token (URL-safe base64)
  v_token := encode(gen_random_bytes(16), 'base64')
    || encode(gen_random_bytes(8), 'base64');
  
  -- Remove padding and special chars
  v_token := REPLACE(REPLACE(REPLACE(v_token, '/', '_'), '+', '-'), '=', '');
  v_token := SUBSTRING(v_token FROM 1 FOR 24);  -- truncate to reasonable length
  
  -- Insert or update the link (one per reception entry)
  INSERT INTO public.complaint_access_links (
    dealer_code, reception_entry_id, token, status
  ) VALUES (
    v_dealer_code, p_reception_entry_id, v_token, 'active'
  )
  ON CONFLICT (reception_entry_id) DO UPDATE
  SET token = v_token, status = 'active', created_at = now()
  RETURNING id INTO v_link_id;
  
  RETURN jsonb_build_object(
    'link_id', v_link_id,
    'token', v_token,
    'url', 'https://tw.care/c/' || v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_complaint_link(bigint) TO authenticated;

-- ============================================================================
-- C.2: check_complaint_sla_breaches()
-- ============================================================================
-- Background job: marks SLA breaches and auto-escalates.
-- Scheduled via pg_cron or edge function (runs every 15 minutes).

CREATE OR REPLACE FUNCTION public.check_complaint_sla_breaches()
RETURNS table(breached_count integer, escalated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_breached_count integer := 0;
  v_escalated_count integer := 0;
BEGIN
  -- Mark response breaches
  UPDATE public.complaint_tickets
  SET response_breached = true
  WHERE response_due_at < now()
    AND first_response_at IS NULL
    AND response_breached = false
    AND status IN ('new', 'acknowledged');
  
  GET DIAGNOSTICS v_breached_count = ROW_COUNT;
  
  -- Mark resolution breaches
  UPDATE public.complaint_tickets
  SET resolution_breached = true
  WHERE resolution_due_at < now()
    AND status NOT IN ('resolved', 'closed')
    AND resolution_breached = false;
  
  GET DIAGNOSTICS v_escalated_count = ROW_COUNT;
  
  -- Auto-escalate breached tickets
  UPDATE public.complaint_tickets
  SET
    is_escalated = true,
    escalated_at = now(),
    escalation_reason = 'SLA breached: auto-escalated'
  WHERE (response_breached = true OR resolution_breached = true)
    AND is_escalated = false;
  
  RETURN QUERY SELECT v_breached_count::integer, v_escalated_count::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_complaint_sla_breaches() TO service_role;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
