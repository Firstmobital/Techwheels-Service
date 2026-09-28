-- Migration: Fix Bodyshop visit_kind priority over stale mechanical entries
-- Ensures vehicles with active or past Bodyshop Repair Cards resolution defaults to 'bodyshop'

CREATE OR REPLACE FUNCTION public.customer_resolve_visit_kind(p_job jsonb, p_reg_number text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  v_st text;
  v_st_lower text;
  v_card_count integer;
BEGIN
  -- If a registration number is supplied, check if ANY bodyshop repair card exists for this vehicle
  IF p_reg_number IS NOT NULL AND btrim(p_reg_number) <> '' THEN
    SELECT COUNT(*) INTO v_card_count
    FROM public.bodyshop_repair_cards b
    WHERE public.customer_norm_reg(b.reg_number) = public.customer_norm_reg(p_reg_number);

    IF v_card_count > 0 THEN
      RETURN 'bodyshop';
    END IF;
  END IF;

  IF p_job IS NULL THEN
    RETURN 'other';
  END IF;

  IF p_job->>'source' = 'bodyshop' OR p_job->>'repair_card_id' IS NOT NULL THEN
    RETURN 'bodyshop';
  END IF;

  v_st := btrim(COALESCE(p_job->>'service_type', ''));
  v_st_lower := lower(v_st);

  IF v_st = 'Accident' OR v_st_lower LIKE '%accident%' OR v_st_lower LIKE '%bodyshop%' OR v_st_lower LIKE '%claim%' THEN
    RETURN 'bodyshop';
  END IF;

  IF v_st IN (
    'Running Repairs', 'First Free Service', 'Second Free Service',
    'Third Free Service', 'Paid Service', 'Mini Paid Service',
    'Updation', 'E Breakdown', 'Campaign'
  ) THEN
    RETURN 'mechanical';
  END IF;

  RETURN 'other';
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
  v_card jsonb;
BEGIN
  IF p_reg_number IS NULL OR btrim(p_reg_number) = '' THEN
    RAISE EXCEPTION 'reg_number required';
  END IF;

  v_base := public.customer_get_active_job(p_session_token, p_reg_number);
  v_card := public.customer_get_repair_card(p_session_token, p_reg_number);

  IF v_card IS NOT NULL THEN
    v_kind := 'bodyshop';
  ELSE
    v_kind := COALESCE(v_base->>'visit_kind', public.customer_resolve_visit_kind(v_base->'job', p_reg_number));
  END IF;

  IF v_kind = 'bodyshop' OR v_card IS NOT NULL THEN
    RETURN v_base
      || jsonb_build_object(
        'visit_kind', 'bodyshop',
        'mechanical_case', NULL,
        'repair_card', COALESCE(v_card, public.customer_get_repair_card(p_session_token, p_reg_number))
      );
  ELSIF v_kind = 'mechanical' THEN
    RETURN v_base
      || jsonb_build_object(
        'visit_kind', 'mechanical',
        'mechanical_case', public.customer_get_mechanical_case(p_session_token, p_reg_number),
        'repair_card', NULL
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

REVOKE ALL ON FUNCTION public.customer_resolve_visit_kind(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_resolve_visit_kind(jsonb, text) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_resolve_visit_kind(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_resolve_visit_kind(jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.customer_get_visit_context(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_get_visit_context(text, text) TO service_role;
