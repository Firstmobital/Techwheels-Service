-- Visit classification: search bodyshop first.
-- Mechanical only when the open reception is not an accident/bodyshop case
-- and there is no active bodyshop repair card.
-- Matches Vinod's visit root (bodyshop before stale mechanical reception).

CREATE OR REPLACE FUNCTION public.customer_service_is_bodyshop(p_service_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_service_type IS NULL OR btrim(p_service_type) = '' THEN false
    WHEN btrim(p_service_type) IN ('Accident', 'Accidental', 'Rusting', 'Body & Paint') THEN true
    WHEN lower(btrim(p_service_type)) LIKE '%accident%' THEN true
    WHEN lower(btrim(p_service_type)) LIKE '%bodyshop%' THEN true
    WHEN lower(btrim(p_service_type)) LIKE '%body paint%' THEN true
    WHEN lower(btrim(p_service_type)) LIKE '%claim%' THEN true
    WHEN lower(btrim(p_service_type)) LIKE '%rusting%' THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.customer_get_active_job(p_session_token text, p_reg_number text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET row_security TO 'off'
AS $$
DECLARE
  v_sess record;
  v_reg text;
  v_regs text[];
  v_job jsonb;
  v_vehicle jsonb;
  v_card public.bodyshop_repair_cards%rowtype;
BEGIN
  SELECT * INTO v_sess FROM public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);

  IF p_reg_number IS NOT NULL AND btrim(p_reg_number) <> '' THEN
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  END IF;

  -- 1. Active bodyshop repair card wins over any reception row.
  SELECT b.*
  INTO v_card
  FROM public.bodyshop_repair_cards b
  WHERE public.customer_norm_reg(b.reg_number) = ANY (v_regs)
    AND (v_reg IS NULL OR public.customer_norm_reg(b.reg_number) = v_reg)
    AND COALESCE(b.overall_status, '') = 'active'
    AND b.delivered_at IS NULL
  ORDER BY b.updated_at DESC NULLS LAST, b.id DESC
  LIMIT 1;

  IF FOUND THEN
    v_job := jsonb_build_object(
      'id', v_card.id,
      'source', 'bodyshop',
      'reg_number', v_card.reg_number,
      'reg_key', public.customer_norm_reg(v_card.reg_number),
      'model', NULL,
      'owner_name', v_card.customer_name,
      'owner_phone', v_card.customer_phone,
      'service_type', 'Accident',
      'sa_name', v_card.sa_name,
      'sa_display_name', v_card.sa_name,
      'jc_number', v_card.job_card_no,
      'branch', v_card.branch,
      'created_at', v_card.created_at,
      'invoice_done_at', v_card.delivered_at,
      'km_reading', NULL,
      'remark', v_card.overall_status,
      'status', 'in_service'
    );
  ELSE
    -- 2. Open reception: accident/bodyshop before any other service type.
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
      'status', 'in_service'
    )
    INTO v_job
    FROM public.service_reception_entries s
    WHERE public.customer_norm_reg(s.reg_number) = ANY (v_regs)
      AND (v_reg IS NULL OR public.customer_norm_reg(s.reg_number) = v_reg)
      AND s.invoice_done_at IS NULL
    ORDER BY public.customer_service_is_bodyshop(s.service_type) DESC, s.created_at DESC
    LIMIT 1;

    -- 3. Nothing open. Mechanical only if a non-accident reception entry exists.
    --    Otherwise stay on the bodyshop card (default for this workshop).
    IF v_job IS NULL THEN
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
        AND NOT public.customer_service_is_bodyshop(s.service_type)
      ORDER BY (s.invoice_done_at IS NULL) DESC, s.created_at DESC
      LIMIT 1;
    END IF;

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
      ORDER BY (COALESCE(b.overall_status, '') = 'active') DESC, b.updated_at DESC NULLS LAST, b.id DESC
      LIMIT 1;
    END IF;

    IF v_job IS NULL THEN
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
    END IF;
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
SET search_path TO 'public', 'extensions'
SET row_security TO 'off'
AS $$
DECLARE
  v_base jsonb;
  v_kind text;
  v_card jsonb;
BEGIN
  IF p_reg_number IS NULL OR btrim(p_reg_number) = '' THEN
    RAISE EXCEPTION 'reg_number required';
  END IF;

  v_base := public.customer_get_active_job(p_session_token, p_reg_number);
  v_kind := COALESCE(v_base->>'visit_kind', public.customer_resolve_visit_kind(v_base->'job'));

  -- Bodyshop first. Mechanical case is loaded only when the active job is a non-accident reception.
  IF v_kind = 'bodyshop'
     OR COALESCE(v_base->'job'->>'source', '') = 'bodyshop'
     OR public.customer_service_is_bodyshop(v_base->'job'->>'service_type')
  THEN
    v_card := public.customer_get_repair_card(p_session_token, p_reg_number);
    IF v_card IS NOT NULL AND jsonb_typeof(v_base->'job') = 'object' THEN
      v_base := jsonb_set(
        v_base,
        '{job}',
        (v_base->'job') || jsonb_strip_nulls(jsonb_build_object(
          'claim_intimation_no', v_card->'claim_intimation_no',
          'insurance_company', v_card->'insurance_company',
          'insurance_policy_no', v_card->'insurance_policy_no',
          'surveyor_name', v_card->'surveyor_name',
          'surveyor_contact', v_card->'surveyor_contact',
          'estimated_amount', v_card->'estimated_amount',
          'customer_name', v_card->'customer_name',
          'owner_name', COALESCE(NULLIF(v_base->'job'->>'owner_name', ''), v_card->>'customer_name')
        ))
      );
    END IF;
    RETURN v_base || jsonb_build_object(
      'visit_kind', 'bodyshop',
      'mechanical_case', NULL,
      'repair_card', v_card
    );
  ELSIF v_kind = 'mechanical' THEN
    RETURN v_base || jsonb_build_object(
      'visit_kind', 'mechanical',
      'mechanical_case', public.customer_get_mechanical_case(p_session_token, p_reg_number),
      'repair_card', NULL
    );
  END IF;

  v_card := public.customer_get_repair_card(p_session_token, p_reg_number);
  IF v_card IS NOT NULL AND COALESCE(v_card->>'overall_status', '') = 'active' AND v_card->>'delivered_at' IS NULL THEN
    RETURN v_base || jsonb_build_object(
      'visit_kind', 'bodyshop',
      'mechanical_case', NULL,
      'repair_card', v_card
    );
  END IF;

  RETURN v_base || jsonb_build_object(
    'visit_kind', COALESCE(v_kind, 'other'),
    'mechanical_case', NULL,
    'repair_card', NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_service_is_bodyshop(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_get_active_job(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO anon, authenticated, service_role;
