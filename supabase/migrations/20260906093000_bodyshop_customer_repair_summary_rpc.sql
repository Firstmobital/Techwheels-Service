-- Body Shop Customer App: session validation helper + main read RPC.
--
-- bodyshop_customer_session_context() is the single place that re-validates
-- a session token; every customer-facing RPC in this and later migrations
-- calls it first so a leaked/guessed token can only ever reach the one
-- reception_entry_id it was minted for.

CREATE FUNCTION public.bodyshop_customer_session_context(p_session_token text)
RETURNS TABLE (dealer_code text, reception_entry_id bigint, mobile text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session record;
BEGIN
  SELECT s.dealer_code, s.reception_entry_id, s.mobile
  INTO v_session
  FROM public.bodyshop_customer_sessions s
  WHERE s.session_token = p_session_token
    AND s.status = 'active'
    AND s.expires_at > now();

  IF v_session.reception_entry_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session';
  END IF;

  UPDATE public.bodyshop_customer_sessions
  SET last_seen_at = now()
  WHERE session_token = p_session_token;

  RETURN QUERY SELECT v_session.dealer_code, v_session.reception_entry_id, v_session.mobile;
END;
$$;

COMMENT ON FUNCTION public.bodyshop_customer_session_context(text) IS
  'Validates a Body Shop Customer App session token and returns its scope. Called internally by every other customer RPC -- not intended to be called directly by the client.';

REVOKE ALL ON FUNCTION public.bodyshop_customer_session_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bodyshop_customer_session_context(text) TO anon, authenticated, service_role;

-- Shared status-mapping lookup (see src/components/customer-app/statusMap.ts
-- for the mirrored TypeScript copy used for any client-side display fallback).
CREATE FUNCTION public.bodyshop_map_stage_status(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_value
    WHEN 'not_required' THEN 'Not Required'
    WHEN 'work_inprocess' THEN 'In Progress'
    WHEN 'hold' THEN 'On Hold'
    WHEN 'completed' THEN 'Completed'
    ELSE 'Pending'
  END;
$$;

CREATE FUNCTION public.bodyshop_map_qc_status(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_value
    WHEN 'pass' THEN 'Passed'
    WHEN 'fail' THEN 'Requires Attention'
    ELSE 'Pending'
  END;
$$;

CREATE FUNCTION public.bodyshop_map_do_status(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_value
    WHEN 'received' THEN 'Received'
    WHEN 'not_received' THEN 'Not Received'
    ELSE 'Pending'
  END;
$$;

CREATE FUNCTION public.bodyshop_map_survey_status(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_value
    WHEN 'approved' THEN 'Approved'
    WHEN 'hold' THEN 'On Hold'
    ELSE 'Pending'
  END;
$$;

CREATE FUNCTION public.bodyshop_map_reinspection_status(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_value
    WHEN 'completed' THEN 'Completed'
    ELSE 'Pending'
  END;
$$;

CREATE FUNCTION public.bodyshop_map_pi_status(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_value
    WHEN 'in_progress' THEN 'In Progress'
    WHEN 'completed' THEN 'Completed'
    ELSE 'Not Started'
  END;
$$;

CREATE FUNCTION public.get_customer_repair_summary(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_entry jsonb;
  v_card record;
  v_card_json jsonb;
  v_assignment record;
  v_floor_incharge jsonb;
  v_surveyor_email text;
  v_invoice jsonb;
BEGIN
  SELECT * INTO v_ctx FROM public.bodyshop_customer_session_context(p_session_token);

  SELECT jsonb_build_object(
    'reg_number', reg_number,
    'model', model,
    'owner_name', owner_name,
    'owner_phone', owner_phone,
    'owner_email', owner_email,
    'km_reading', km_reading
  ) INTO v_entry
  FROM public.service_reception_entries
  WHERE id = v_ctx.reception_entry_id;

  SELECT * INTO v_card
  FROM public.bodyshop_repair_cards
  WHERE reception_entry_id = v_ctx.reception_entry_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_card.id IS NULL THEN
    RETURN jsonb_build_object('entry', v_entry, 'repair_card', NULL);
  END IF;

  IF v_card.surveyor_name IS NOT NULL THEN
    SELECT surveyor_email INTO v_surveyor_email
    FROM public.settings_bodyshop_surveyors
    WHERE dealer_code = v_ctx.dealer_code
      AND upper(btrim(surveyor_name)) = upper(btrim(v_card.surveyor_name))
    LIMIT 1;
  END IF;

  SELECT * INTO v_assignment
  FROM public.bodyshop_assignments
  WHERE job_card_number = v_card.job_card_no
    AND is_active = true
  ORDER BY assigned_at DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'employee_name', em.employee_name,
    'employee_mobile', em.mobile_number
  ) INTO v_floor_incharge
  FROM public.bodyshop_floor_support_assignments fsa
  JOIN public.employee_master em ON em.employee_code = fsa.employee_code
  WHERE fsa.job_card_number = v_card.job_card_no
    AND fsa.support_role = 'FLOOR_INCHARGE'
    AND fsa.is_active = true
  ORDER BY fsa.assigned_at DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'invoice_number', invoice_number,
    'invoice_date', invoice_date,
    'invoice_amount', invoice_amount,
    'do_status', public.bodyshop_map_do_status(do_status),
    'do_amount', do_amount
  ) INTO v_invoice
  FROM public.bodyshop_settlements
  WHERE repair_card_id = v_card.id
  ORDER BY created_at DESC
  LIMIT 1;

  v_card_json := jsonb_build_object(
    'job_card_no', v_card.job_card_no,
    'current_stage_name', v_card.current_stage_name,
    'overall_status', v_card.overall_status,
    'bodyshop_floor', v_card.bodyshop_floor,
    'floor_incharge', v_floor_incharge,

    'estimate_amount', v_card.estimated_amount,
    'estimate_date', v_card.estimation_at,
    'claim_intimation_no', v_card.claim_intimation_no,
    'claim_intimation_date', v_card.claim_intimation_date,
    'survey_date', v_card.survey_date,
    'surveyor_name', v_card.surveyor_name,
    'surveyor_mobile', v_card.surveyor_contact,
    'surveyor_email', v_surveyor_email,
    'survey_status', public.bodyshop_map_survey_status(v_card.survey_status),
    'approved_parts', v_card.approved_parts,
    'non_approved_parts', v_card.non_approved_parts,

    'stages', jsonb_build_object(
      'mechanical', public.bodyshop_map_stage_status(v_assignment.technician_work_status),
      'denting', public.bodyshop_map_stage_status(v_assignment.dentor_work_status),
      'painting', public.bodyshop_map_stage_status(v_assignment.painter_work_status),
      'rubbing', public.bodyshop_map_stage_status(v_assignment.rubbing_work_status),
      'edp', public.bodyshop_map_stage_status(v_assignment.edp_work_status),
      'qc', public.bodyshop_map_qc_status(v_card.qc_status),
      'reinspection', public.bodyshop_map_reinspection_status(v_card.reinspection_status)
    ),

    'pi_status', public.bodyshop_map_pi_status(v_card.pi_status),
    'pi_generated_at', v_card.pi_generated_at,

    'invoice', v_invoice,

    'received_at', v_card.received_at,
    'delivered_at', v_card.delivered_at
  );

  RETURN jsonb_build_object('entry', v_entry, 'repair_card', v_card_json);
END;
$$;

COMMENT ON FUNCTION public.get_customer_repair_summary(text) IS
  'Single main read RPC for the Body Shop Customer App. Returns customer-scoped, already status-mapped data -- never raw internal enum values or unrelated table rows. Job Card Date is intentionally NOT included here: no deterministic source has been confirmed (see SRD Section 8 / plan Section 11); it must be added once a canonical source is confirmed rather than silently substituted.';

GRANT EXECUTE ON FUNCTION public.get_customer_repair_summary(text) TO anon, authenticated;
