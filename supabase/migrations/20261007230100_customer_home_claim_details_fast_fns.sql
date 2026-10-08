-- Home claim details were late because every visit load scanned all_service_data
-- (75k rows, unnest on every contact_phones value) several times, then waited on
-- customer_get_repair_card (documents, worklist, photos) before copying
-- claim_intimation_no / insurance / surveyor off a row that was already in hand.

CREATE INDEX IF NOT EXISTS idx_all_service_data_last_service_phone10
  ON public.all_service_data (public.customer_last10_digits(last_service_customer_mobile_no));

CREATE OR REPLACE FUNCTION public.customer_collect_vehicles(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_phone text := public.customer_last10_digits(p_phone);
  v_rows jsonb := '[]'::jsonb;
begin
  if v_phone is null then
    return '[]'::jsonb;
  end if;

  with rec as (
    select
      1 as src_rank,
      s.id::text as source_id,
      'reception'::text as source,
      public.customer_norm_reg(s.reg_number) as reg_key,
      s.reg_number,
      s.model,
      null::text as vin,
      s.owner_name,
      s.owner_phone,
      s.service_type,
      s.sa_name,
      s.sa_display_name,
      s.jc_number,
      s.branch,
      s.created_at,
      s.invoice_done_at,
      s.km_reading::numeric as km_reading,
      s.remark,
      s.estimate_storage_path,
      s.estimate_drive_url,
      s.invoice_storage_path,
      s.invoice_drive_url
    from public.service_reception_entries s
    where public.customer_last10_digits(s.owner_phone) = v_phone
      and public.customer_norm_reg(s.reg_number) is not null
  ),
  veh as (
    select
      2 as src_rank,
      public.customer_norm_reg(v.reg_number) as source_id,
      'vehicles'::text as source,
      public.customer_norm_reg(v.reg_number) as reg_key,
      v.reg_number,
      v.model,
      v.vin,
      v.owner_name,
      v.owner_phone,
      null::text as service_type,
      null::text as sa_name,
      null::text as sa_display_name,
      null::text as jc_number,
      null::text as branch,
      v.created_at,
      null::timestamptz as invoice_done_at,
      null::numeric as km_reading,
      null::text as remark,
      null::text as estimate_storage_path,
      null::text as estimate_drive_url,
      null::text as invoice_storage_path,
      null::text as invoice_drive_url
    from public.vehicles v
    where public.customer_last10_digits(v.owner_phone) = v_phone
      and public.customer_norm_reg(v.reg_number) is not null
  ),
  bs as (
    select
      3 as src_rank,
      b.id::text as source_id,
      'bodyshop'::text as source,
      public.customer_norm_reg(b.reg_number) as reg_key,
      b.reg_number,
      null::text as model,
      null::text as vin,
      b.customer_name as owner_name,
      b.customer_phone as owner_phone,
      'Body & Paint'::text as service_type,
      b.sa_name,
      b.sa_name as sa_display_name,
      b.job_card_no as jc_number,
      b.branch,
      b.created_at,
      b.delivered_at as invoice_done_at,
      null::numeric as km_reading,
      b.overall_status as remark,
      null::text as estimate_storage_path,
      null::text as estimate_drive_url,
      null::text as invoice_storage_path,
      null::text as invoice_drive_url
    from public.bodyshop_repair_cards b
    where public.customer_last10_digits(b.customer_phone) = v_phone
      and public.customer_norm_reg(b.reg_number) is not null
  ),
  asd as (
    select
      4 as src_rank,
      a.id::text as source_id,
      'all_service_data'::text as source,
      public.customer_norm_reg(a.vehicle_registration_number) as reg_key,
      a.vehicle_registration_number as reg_number,
      a.model,
      a.chassis_no as vin,
      nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), '') as owner_name,
      coalesce(public.customer_last10_digits(a.last_service_customer_mobile_no), v_phone) as owner_phone,
      a.last_service_type as service_type,
      a.last_service_dealer as sa_name,
      a.last_service_dealer as sa_display_name,
      a.extended_warranty_order_no as jc_number,
      a.sold_dealer as branch,
      coalesce(a.last_service_date::timestamptz, a.created_at) as created_at,
      a.last_service_date::timestamptz as invoice_done_at,
      nullif(regexp_replace(coalesce(a.last_service_km, ''), '[^0-9]', '', 'g'), '')::numeric as km_reading,
      a.product_line as remark,
      null::text as estimate_storage_path,
      null::text as estimate_drive_url,
      null::text as invoice_storage_path,
      null::text as invoice_drive_url
    from public.all_service_data a
    where public.customer_norm_reg(a.vehicle_registration_number) is not null
      and public.customer_last10_digits(a.last_service_customer_mobile_no) = v_phone
  ),
  united as (
    select * from rec
    union all
    select * from veh
    union all
    select * from bs
    union all
    select * from asd
  ),
  picked as (
    select distinct on (reg_key)
      source_id, source, reg_key, reg_number, model, vin, owner_name, owner_phone,
      service_type, sa_name, sa_display_name, jc_number, branch, created_at,
      invoice_done_at, km_reading, remark, estimate_storage_path, estimate_drive_url,
      invoice_storage_path, invoice_drive_url
    from united
    where reg_key is not null
    order by reg_key, src_rank, created_at desc nulls last
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', source_id,
        'source', source,
        'reg_number', reg_number,
        'reg_key', reg_key,
        'model', model,
        'vin', vin,
        'owner_name', owner_name,
        'owner_phone', owner_phone,
        'service_type', service_type,
        'sa_name', sa_name,
        'sa_display_name', sa_display_name,
        'jc_number', jc_number,
        'branch', branch,
        'created_at', created_at,
        'invoice_done_at', invoice_done_at,
        'km_reading', km_reading,
        'remark', remark,
        'estimate_storage_path', estimate_storage_path,
        'estimate_drive_url', estimate_drive_url,
        'invoice_storage_path', invoice_storage_path,
        'invoice_drive_url', invoice_drive_url
      )
      order by reg_number
    ),
    '[]'::jsonb
  )
  into v_rows
  from picked;

  if jsonb_array_length(v_rows) > 0 then
    return v_rows;
  end if;

  -- Phone lives only inside contact_phones. Rare; keep the slower scan off the home path.
  with asd as (
    select
      a.id::text as source_id,
      public.customer_norm_reg(a.vehicle_registration_number) as reg_key,
      a.vehicle_registration_number as reg_number,
      a.model,
      a.chassis_no as vin,
      nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), '') as owner_name,
      v_phone as owner_phone,
      a.last_service_type as service_type,
      a.last_service_dealer as sa_name,
      a.last_service_dealer as sa_display_name,
      a.extended_warranty_order_no as jc_number,
      a.sold_dealer as branch,
      coalesce(a.last_service_date::timestamptz, a.created_at) as created_at,
      a.last_service_date::timestamptz as invoice_done_at,
      nullif(regexp_replace(coalesce(a.last_service_km, ''), '[^0-9]', '', 'g'), '')::numeric as km_reading,
      a.product_line as remark
    from public.all_service_data a
    where public.customer_norm_reg(a.vehicle_registration_number) is not null
      and nullif(btrim(a.contact_phones), '') is not null
      and exists (
        select 1
        from unnest(regexp_split_to_array(a.contact_phones, '[,;/|]+')) as part
        where public.customer_last10_digits(part) = v_phone
      )
  ),
  picked as (
    select distinct on (reg_key) *
    from asd
    where reg_key is not null
    order by reg_key, created_at desc nulls last
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', source_id,
        'source', 'all_service_data',
        'reg_number', reg_number,
        'reg_key', reg_key,
        'model', model,
        'vin', vin,
        'owner_name', owner_name,
        'owner_phone', owner_phone,
        'service_type', service_type,
        'sa_name', sa_name,
        'sa_display_name', sa_display_name,
        'jc_number', jc_number,
        'branch', branch,
        'created_at', created_at,
        'invoice_done_at', invoice_done_at,
        'km_reading', km_reading,
        'remark', remark,
        'estimate_storage_path', null,
        'estimate_drive_url', null,
        'invoice_storage_path', null,
        'invoice_drive_url', null
      )
      order by reg_number
    ),
    '[]'::jsonb
  )
  into v_rows
  from picked;

  return v_rows;
end;
$$;

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
  v_vehicles jsonb;
  v_card public.bodyshop_repair_cards%rowtype;
BEGIN
  SELECT * INTO v_sess FROM public.customer_require_session(p_session_token);
  -- One vehicle lookup. my_reg_keys and assert_reg each scanned the same phone again.
  v_vehicles := public.customer_collect_vehicles(v_sess.phone);
  SELECT coalesce(array_agg(v->>'reg_key'), '{}'::text[])
  INTO v_regs
  FROM jsonb_array_elements(v_vehicles) v
  WHERE coalesce(v->>'reg_key', '') <> '';

  IF p_reg_number IS NOT NULL AND btrim(p_reg_number) <> '' THEN
    v_reg := public.customer_norm_reg(p_reg_number);
    IF v_reg IS NULL OR NOT (v_reg = ANY (v_regs)) THEN
      RAISE EXCEPTION 'Vehicle not found for this session.';
    END IF;
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
      'status', 'in_service',
      'customer_name', v_card.customer_name,
      'claim_intimation_no', v_card.claim_intimation_no,
      'insurance_company', v_card.insurance_company,
      'insurance_policy_no', v_card.insurance_policy_no,
      'surveyor_name', v_card.surveyor_name,
      'surveyor_contact', v_card.surveyor_contact,
      'estimated_amount', v_card.estimated_amount
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
        END,
        'customer_name', b.customer_name,
        'claim_intimation_no', b.claim_intimation_no,
        'insurance_company', b.insurance_company,
        'insurance_policy_no', b.insurance_policy_no,
        'surveyor_name', b.surveyor_name,
        'surveyor_contact', b.surveyor_contact,
        'estimated_amount', b.estimated_amount
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
  FROM jsonb_array_elements(v_vehicles) v
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
  v_reg text;
  v_card jsonb;
BEGIN
  IF p_reg_number IS NULL OR btrim(p_reg_number) = '' THEN
    RAISE EXCEPTION 'reg_number required';
  END IF;

  v_base := public.customer_get_active_job(p_session_token, p_reg_number);
  v_kind := COALESCE(v_base->>'visit_kind', public.customer_resolve_visit_kind(v_base->'job'));
  v_reg := public.customer_norm_reg(p_reg_number);

  -- Card columns only. Documents and stage worklist stay on customer_get_repair_card
  -- so claim / insurance / surveyor are not blocked on those joins.
  SELECT (to_jsonb(b) - 'sa_employee_code' - 'created_by')
  INTO v_card
  FROM public.bodyshop_repair_cards b
  WHERE public.customer_norm_reg(b.reg_number) = v_reg
  ORDER BY
    (COALESCE(b.overall_status, '') = 'active' AND b.delivered_at IS NULL) DESC,
    b.updated_at DESC NULLS LAST,
    b.id DESC
  LIMIT 1;

  -- Bodyshop first. Mechanical case is loaded only when the active job is a non-accident reception.
  IF v_kind = 'bodyshop'
     OR COALESCE(v_base->'job'->>'source', '') = 'bodyshop'
     OR public.customer_service_is_bodyshop(v_base->'job'->>'service_type')
     OR (
       v_card IS NOT NULL
       AND COALESCE(v_card->>'overall_status', '') = 'active'
       AND v_card->>'delivered_at' IS NULL
       AND v_kind IS DISTINCT FROM 'mechanical'
     )
  THEN
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

  RETURN v_base || jsonb_build_object(
    'visit_kind', COALESCE(v_kind, 'other'),
    'mechanical_case', NULL,
    'repair_card', NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_collect_vehicles(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_service_is_bodyshop(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_get_active_job(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO anon, authenticated, service_role;
