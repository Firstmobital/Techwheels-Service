-- BUSY Parts source metadata for /busy upload cards (read-only aggregate).
-- Matches busy_parts SELECT authority: platform admin or busy module view.

CREATE OR REPLACE FUNCTION public.get_busy_parts_source_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_pv_count integer;
  v_ev_count integer;
  v_pv_file text;
  v_ev_file text;
  v_pv_uploaded timestamptz;
  v_ev_uploaded timestamptz;
BEGIN
  IF NOT (public.is_admin() OR public.has_module_view('busy'::text)) THEN
    RAISE EXCEPTION 'Permission denied for BUSY Parts source status'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_pv_count FROM public.busy_parts WHERE source_type = 'PV';
  SELECT count(*)::integer INTO v_ev_count FROM public.busy_parts WHERE source_type = 'EV';

  SELECT bp.source_file_name, bp.uploaded_at
  INTO v_pv_file, v_pv_uploaded
  FROM public.busy_parts bp
  WHERE bp.source_type = 'PV'
  ORDER BY bp.uploaded_at DESC NULLS LAST, bp.id DESC
  LIMIT 1;

  SELECT bp.source_file_name, bp.uploaded_at
  INTO v_ev_file, v_ev_uploaded
  FROM public.busy_parts bp
  WHERE bp.source_type = 'EV'
  ORDER BY bp.uploaded_at DESC NULLS LAST, bp.id DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'pv', jsonb_build_object(
      'count', v_pv_count,
      'source_file_name', v_pv_file,
      'uploaded_at', v_pv_uploaded
    ),
    'ev', jsonb_build_object(
      'count', v_ev_count,
      'source_file_name', v_ev_file,
      'uploaded_at', v_ev_uploaded
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_busy_parts_source_status() IS
  'Aggregate BUSY Parts PV/EV upload metadata for /busy cards. Same read gate as busy_parts_select_rbac_v1 (is_admin OR has_module_view(busy)).';

REVOKE ALL ON FUNCTION public.get_busy_parts_source_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_busy_parts_source_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_busy_parts_source_status() TO service_role;

NOTIFY pgrst, 'reload schema';
