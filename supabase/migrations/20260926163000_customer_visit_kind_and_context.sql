-- MOBILE-015: Server-owned visit_kind + bundled customer_get_visit_context

CREATE OR REPLACE FUNCTION public.customer_resolve_visit_kind(p_job jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_job IS NULL THEN 'other'
    WHEN public.is_floor_incharge_service_type(p_job->>'service_type') THEN 'mechanical'
    WHEN COALESCE(p_job->>'source', '') = 'bodyshop' THEN 'bodyshop'
    WHEN COALESCE(p_job->>'service_type', '') = 'Accident' THEN 'bodyshop'
    WHEN lower(COALESCE(p_job->>'service_type', '')) LIKE '%accident%' THEN 'bodyshop'
    ELSE 'other'
  END;
$$;

COMMENT ON FUNCTION public.customer_resolve_visit_kind(jsonb) IS
  'Customer mobile visit classification from active job row (reception wins over bodyshop card).';

CREATE OR REPLACE FUNCTION public.customer_get_active_job(p_session_token text, p_reg_number text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  v_sess record;
  v_reg text;
  v_regs text[];
  v_job jsonb;
  v_vehicle jsonb;
BEGIN
  SELECT * INTO v_sess FROM public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);

  IF p_reg_number IS NOT NULL AND btrim(p_reg_number) <> '' THEN
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  END IF;

  SELECT jsonb_build_object(
    'id', s.id,
    'source', 'reception',
    'reg_number', s.reg_number,
    'reg_key', public.customer_norm_reg(s.reg_number),
    'model', s.model,
    'owner_name', s.owner_name,
    'owner_phone', s.owner_phone,
    'service_type', s.service_type,
    'sa_name', s.sa_name,
    'sa_display_name', s.sa_display_name,
    'jc_number', s.jc_number,
    'branch', s.branch,
    'created_at', s.created_at,
    'invoice_done_at', s.invoice_done_at,
    'km_reading', s.km_reading,
    'remark', s.remark,
    'estimate_storage_path', s.estimate_storage_path,
    'estimate_drive_url', s.estimate_drive_url,
    'invoice_storage_path', s.invoice_storage_path,
    'invoice_drive_url', s.invoice_drive_url,
    'status', CASE WHEN s.invoice_done_at IS NULL THEN 'in_service' ELSE 'delivered' END
  )
  INTO v_job
  FROM public.service_reception_entries s
  WHERE public.customer_norm_reg(s.reg_number) = ANY (v_regs)
    AND (v_reg IS NULL OR public.customer_norm_reg(s.reg_number) = v_reg)
  ORDER BY (s.invoice_done_at IS NULL) DESC, s.created_at DESC
  LIMIT 1;

  IF v_job IS NULL THEN
    SELECT jsonb_build_object(
      'id', b.id,
      'source', 'bodyshop',
      'reg_number', b.reg_number,
      'reg_key', public.customer_norm_reg(b.reg_number),
      'model', NULL,
      'owner_name', b.customer_name,
      'owner_phone', b.customer_phone,
      'service_type', 'Body & Paint',
      'sa_name', b.sa_name,
      'sa_display_name', b.sa_name,
      'jc_number', b.job_card_no,
      'branch', b.branch,
      'created_at', b.created_at,
      'invoice_done_at', b.delivered_at,
      'km_reading', NULL,
      'remark', b.overall_status,
      'status', CASE
        WHEN COALESCE(b.overall_status, '') IN ('delivered', 'closed') OR b.delivered_at IS NOT NULL
          THEN 'delivered'
        ELSE 'in_service'
      END
    )
    INTO v_job
    FROM public.bodyshop_repair_cards b
    WHERE public.customer_norm_reg(b.reg_number) = ANY (v_regs)
      AND (v_reg IS NULL OR public.customer_norm_reg(b.reg_number) = v_reg)
    ORDER BY b.created_at DESC
    LIMIT 1;
  END IF;

  SELECT v
  INTO v_vehicle
  FROM jsonb_array_elements(public.customer_collect_vehicles(v_sess.phone)) v
  WHERE v_reg IS NULL OR v->>'reg_key' = v_reg
  LIMIT 1;

  RETURN jsonb_build_object(
    'phone', v_sess.phone,
    'vehicle', v_vehicle,
    'job', v_job,
    'visit_kind', public.customer_resolve_visit_kind(v_job)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_get_visit_context(p_session_token text, p_reg_number text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  v_base jsonb;
  v_kind text;
BEGIN
  IF p_reg_number IS NULL OR btrim(p_reg_number) = '' THEN
    RAISE EXCEPTION 'reg_number required';
  END IF;

  v_base := public.customer_get_active_job(p_session_token, p_reg_number);
  v_kind := COALESCE(v_base->>'visit_kind', public.customer_resolve_visit_kind(v_base->'job'));

  IF v_kind = 'mechanical' THEN
    RETURN v_base
      || jsonb_build_object(
        'visit_kind', v_kind,
        'mechanical_case', public.customer_get_mechanical_case(p_session_token, p_reg_number),
        'repair_card', NULL
      );
  ELSIF v_kind = 'bodyshop' THEN
    RETURN v_base
      || jsonb_build_object(
        'visit_kind', v_kind,
        'mechanical_case', NULL,
        'repair_card', public.customer_get_repair_card(p_session_token, p_reg_number)
      );
  END IF;

  RETURN v_base
    || jsonb_build_object(
      'visit_kind', v_kind,
      'mechanical_case', NULL,
      'repair_card', NULL
    );
END;
$$;

COMMENT ON FUNCTION public.customer_get_visit_context(text, text) IS
  'Single customer portal payload: active job, visit_kind, and type-specific case (mechanical or bodyshop).';

REVOKE ALL ON FUNCTION public.customer_resolve_visit_kind(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_resolve_visit_kind(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_resolve_visit_kind(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_resolve_visit_kind(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.customer_get_visit_context(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO service_role;
