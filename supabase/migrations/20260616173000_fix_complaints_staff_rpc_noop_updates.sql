-- Fix complaints staff RPCs that can return success without updating any rows.
--
-- Problem:
--   Existing functions update using dealer_code = my_dealer_code() and then
--   return success JSON even when UPDATE affects 0 rows.
--
-- Outcome:
--   1) Admin users can update by complaint id directly.
--   2) Non-admin users remain dealer-scoped.
--   3) All functions raise an error when no row is updated.

BEGIN;

CREATE OR REPLACE FUNCTION public.acknowledge(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean := public.is_admin();
  v_dealer_code text := public.my_dealer_code();
BEGIN
  IF NOT (v_is_admin OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF v_is_admin THEN
    UPDATE public.complaint_tickets
    SET status = 'acknowledged'
    WHERE id = p_complaint_id;
  ELSE
    UPDATE public.complaint_tickets
    SET status = 'acknowledged'
    WHERE id = p_complaint_id
      AND dealer_code = v_dealer_code;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint not found or not accessible';
  END IF;

  RETURN jsonb_build_object('status', 'acknowledged');
END;
$$;

CREATE OR REPLACE FUNCTION public.start_progress(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean := public.is_admin();
  v_dealer_code text := public.my_dealer_code();
BEGIN
  IF NOT (v_is_admin OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF v_is_admin THEN
    UPDATE public.complaint_tickets
    SET status = 'in_progress'
    WHERE id = p_complaint_id;
  ELSE
    UPDATE public.complaint_tickets
    SET status = 'in_progress'
    WHERE id = p_complaint_id
      AND dealer_code = v_dealer_code;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint not found or not accessible';
  END IF;

  RETURN jsonb_build_object('status', 'in_progress');
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean := public.is_admin();
  v_dealer_code text := public.my_dealer_code();
BEGIN
  IF NOT (v_is_admin OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF v_is_admin THEN
    UPDATE public.complaint_tickets
    SET status = 'resolved'
    WHERE id = p_complaint_id;
  ELSE
    UPDATE public.complaint_tickets
    SET status = 'resolved'
    WHERE id = p_complaint_id
      AND dealer_code = v_dealer_code;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint not found or not accessible';
  END IF;

  RETURN jsonb_build_object('status', 'resolved');
END;
$$;

CREATE OR REPLACE FUNCTION public.close(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean := public.is_admin();
  v_dealer_code text := public.my_dealer_code();
BEGIN
  IF NOT (v_is_admin OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF v_is_admin THEN
    UPDATE public.complaint_tickets
    SET status = 'closed'
    WHERE id = p_complaint_id;
  ELSE
    UPDATE public.complaint_tickets
    SET status = 'closed'
    WHERE id = p_complaint_id
      AND dealer_code = v_dealer_code;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint not found or not accessible';
  END IF;

  RETURN jsonb_build_object('status', 'closed');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_priority(
  p_complaint_id bigint,
  p_priority text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean := public.is_admin();
  v_dealer_code text := public.my_dealer_code();
BEGIN
  IF NOT (v_is_admin OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF v_is_admin THEN
    UPDATE public.complaint_tickets
    SET priority = p_priority
    WHERE id = p_complaint_id;
  ELSE
    UPDATE public.complaint_tickets
    SET priority = p_priority
    WHERE id = p_complaint_id
      AND dealer_code = v_dealer_code;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint not found or not accessible';
  END IF;

  RETURN jsonb_build_object('priority', p_priority);
END;
$$;

CREATE OR REPLACE FUNCTION public.reassign(
  p_complaint_id bigint,
  p_assigned_to_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean := public.is_admin();
  v_dealer_code text := public.my_dealer_code();
BEGIN
  IF NOT (v_is_admin OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF v_is_admin THEN
    UPDATE public.complaint_tickets
    SET assigned_to = p_assigned_to_user_id
    WHERE id = p_complaint_id;
  ELSE
    UPDATE public.complaint_tickets
    SET assigned_to = p_assigned_to_user_id
    WHERE id = p_complaint_id
      AND dealer_code = v_dealer_code;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint not found or not accessible';
  END IF;

  RETURN jsonb_build_object('assigned_to', p_assigned_to_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.escalate(
  p_complaint_id bigint,
  p_escalation_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean := public.is_admin();
  v_dealer_code text := public.my_dealer_code();
BEGIN
  IF NOT (v_is_admin OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF v_is_admin THEN
    UPDATE public.complaint_tickets
    SET
      is_escalated = true,
      escalated_at = now(),
      escalation_reason = p_escalation_reason
    WHERE id = p_complaint_id;
  ELSE
    UPDATE public.complaint_tickets
    SET
      is_escalated = true,
      escalated_at = now(),
      escalation_reason = p_escalation_reason
    WHERE id = p_complaint_id
      AND dealer_code = v_dealer_code;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint not found or not accessible';
  END IF;

  RETURN jsonb_build_object('is_escalated', true);
END;
$$;

COMMIT;
