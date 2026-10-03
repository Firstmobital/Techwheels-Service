-- Admins with platform "admin" module (not only is_admin()) can read all floor work photos.

CREATE OR REPLACE FUNCTION public.bodyshop_floor_work_can_access_daily_log(p_log_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log public.bodyshop_floor_role_daily_logs%ROWTYPE;
BEGIN
  IF p_log_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_log
  FROM public.bodyshop_floor_role_daily_logs
  WHERE id = p_log_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  IF public.has_module_view('admin') OR public.has_module_modify('admin') THEN
    RETURN true;
  END IF;

  IF NOT public.dealer_code_in_scope(v_log.dealer_code) THEN
    RETURN false;
  END IF;

  IF public.has_module_view('bodyshop_floor_work')
     OR public.has_module_modify('bodyshop_floor_work')
     OR public.has_module_view('bodyshop_floor')
     OR public.has_module_modify('bodyshop_floor') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
