-- Fix: Accident reception INSERT already creates bodyshop_repair_cards via sync trigger;
-- second INSERT hit ux_bodyshop_repair_cards_reception_entry_id.

CREATE OR REPLACE FUNCTION public.bodyshop_bootstrap_visit_from_dms_gap(
  p_reg_number text,
  p_job_card_number text,
  p_model text,
  p_sa_employee_code text,
  p_owner_name text,
  p_owner_phone text,
  p_source text,
  p_branch text DEFAULT NULL,
  p_received_date date DEFAULT NULL,
  p_dms_invoice_number text DEFAULT NULL,
  p_remark text DEFAULT NULL,
  p_portal text DEFAULT NULL
)
RETURNS TABLE (
  reception_entry_id bigint,
  repair_card_id integer,
  job_card_no text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_actor uuid;
  v_dealer text;
  v_reg text;
  v_jc text;
  v_sa_code text;
  v_sa_name text;
  v_portal text;
  v_reception_id bigint;
  v_card_id integer;
  v_received_at timestamptz;
  v_remark text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  v_dealer := public.my_dealer_code();

  IF NOT (
    public.is_admin()
    OR (
      (public.has_module_modify('reception') OR public.has_module_modify('bodyshop_repair'))
      AND public.dealer_code_in_scope(v_dealer)
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: requires reception or bodyshop_repair modify'
      USING ERRCODE = '42501';
  END IF;

  v_reg := upper(btrim(coalesce(p_reg_number, '')));
  v_jc := upper(btrim(coalesce(p_job_card_number, '')));
  v_sa_code := upper(btrim(coalesce(p_sa_employee_code, '')));
  v_portal := NULLIF(upper(btrim(coalesce(p_portal, ''))), '');
  v_remark := btrim(coalesce(p_remark, ''));

  IF v_reg = '' THEN
    RAISE EXCEPTION 'registration number is required' USING ERRCODE = '22023';
  END IF;
  IF v_jc = '' THEN
    RAISE EXCEPTION 'job card number is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_model, '')), '') IS NULL THEN
    RAISE EXCEPTION 'model is required' USING ERRCODE = '22023';
  END IF;
  IF v_sa_code = '' THEN
    RAISE EXCEPTION 'sa employee code is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_owner_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'owner name is required' USING ERRCODE = '22023';
  END IF;
  IF p_owner_phone IS NULL OR btrim(p_owner_phone) !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'owner phone must be exactly 10 digits' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_source, '')), '') IS NULL THEN
    RAISE EXCEPTION 'source is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_remark) < 3 THEN
    RAISE EXCEPTION 'remark is required (min 3 characters)' USING ERRCODE = '22023';
  END IF;
  IF v_portal IS NOT NULL AND v_portal NOT IN ('EV', 'PV') THEN
    RAISE EXCEPTION 'portal must be EV or PV' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.bodyshop_repair_cards c
     WHERE c.overall_status <> 'cancelled'
       AND upper(btrim(c.job_card_no)) = v_jc
  ) THEN
    RAISE EXCEPTION 'a live repair card already exists for job card %', v_jc
      USING ERRCODE = '23505';
  END IF;

  SELECT em.employee_name
    INTO v_sa_name
    FROM public.employee_master em
   WHERE em.employee_code = v_sa_code;

  IF NOT FOUND OR NULLIF(btrim(coalesce(v_sa_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'employee code % not found', v_sa_code
      USING ERRCODE = 'P0002';
  END IF;

  v_received_at := CASE
    WHEN p_received_date IS NOT NULL THEN
      ((p_received_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Kolkata')
    ELSE
      now()
  END;

  INSERT INTO public.service_reception_entries (
    reg_number,
    model,
    service_type,
    sa_employee_code,
    sa_name,
    sa_display_name,
    owner_name,
    owner_phone,
    source,
    jc_number,
    branch,
    portal,
    dealer_code
  ) VALUES (
    v_reg,
    NULLIF(btrim(p_model), ''),
    'Accident',
    v_sa_code,
    v_sa_name,
    v_sa_name,
    NULLIF(btrim(p_owner_name), ''),
    btrim(p_owner_phone),
    NULLIF(btrim(p_source), ''),
    v_jc,
    NULLIF(btrim(coalesce(p_branch, '')), ''),
    v_portal,
    v_dealer
  )
  RETURNING id INTO v_reception_id;

  SELECT c.id
    INTO v_card_id
    FROM public.bodyshop_repair_cards c
   WHERE c.reception_entry_id = v_reception_id
   ORDER BY c.id DESC
   LIMIT 1;

  IF v_card_id IS NULL THEN
    INSERT INTO public.bodyshop_repair_cards (
      reception_entry_id,
      job_card_no,
      reg_number,
      customer_name,
      customer_phone,
      branch,
      sa_employee_code,
      sa_name,
      current_stage,
      current_stage_name,
      overall_status,
      received_at
    ) VALUES (
      v_reception_id,
      v_jc,
      v_reg,
      NULLIF(btrim(p_owner_name), ''),
      btrim(p_owner_phone),
      NULLIF(btrim(coalesce(p_branch, '')), ''),
      v_sa_code,
      v_sa_name,
      1,
      'Vehicle Receiving',
      'active',
      v_received_at
    )
    RETURNING id INTO v_card_id;
  ELSE
    UPDATE public.bodyshop_repair_cards
    SET
      job_card_no = v_jc,
      reg_number = v_reg,
      customer_name = NULLIF(btrim(p_owner_name), ''),
      customer_phone = btrim(p_owner_phone),
      branch = NULLIF(btrim(coalesce(p_branch, '')), ''),
      sa_employee_code = v_sa_code,
      sa_name = v_sa_name,
      received_at = v_received_at,
      updated_at = now()
    WHERE id = v_card_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, details)
  VALUES (
    v_actor,
    'bodyshop_dms_gap_bootstrap',
    'bodyshop_repair_card',
    v_card_id::text,
    jsonb_build_object(
      'reception_entry_id', v_reception_id,
      'job_card_no', v_jc,
      'reg_number', v_reg,
      'dms_invoice_number', NULLIF(btrim(coalesce(p_dms_invoice_number, '')), ''),
      'received_date', p_received_date,
      'remark', v_remark,
      'source_flow', 'tracker_dms_gap'
    )
  );

  reception_entry_id := v_reception_id;
  repair_card_id := v_card_id;
  job_card_no := v_jc;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.bodyshop_bootstrap_visit_from_dms_gap(
  text, text, text, text, text, text, text, text, date, text, text, text
) IS 'Creates Accident reception + bodyshop card from DMS gap. Reuses card created by sync_bodyshop_repair_card_from_reception when present; sets received_at from DMS date.';