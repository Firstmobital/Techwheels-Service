-- Photo INSERT still failed for assigned workers: policy subquery on logs is subject to
-- RLS visibility edge cases; reg-as-JC vs system JC keys need aliasing. Use SECURITY
-- DEFINER gate + restore photos SELECT policy.

CREATE OR REPLACE FUNCTION public.bodyshop_floor_work_user_assigned_to_jc(
  p_job_card_number text,
  p_floor_role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT upper(trim(public.my_employee_code())) AS code
  ),
  jc AS (
    SELECT upper(trim(coalesce(p_job_card_number, ''))) AS k
  ),
  role AS (
    SELECT upper(trim(coalesce(p_floor_role, ''))) AS r
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.bodyshop_assignments ba, me, jc, role
    WHERE ba.is_active = true
      AND me.code <> ''
      AND (
        upper(trim(ba.job_card_number)) = jc.k
        OR EXISTS (
          SELECT 1
          FROM public.bodyshop_repair_cards rc
          WHERE upper(trim(rc.job_card_no)) = upper(trim(ba.job_card_number))
            AND upper(trim(coalesce(rc.reg_number, ''))) = jc.k
        )
        OR EXISTS (
          SELECT 1
          FROM public.bodyshop_repair_cards rc
          WHERE upper(trim(coalesce(rc.reg_number, ''))) = upper(trim(ba.job_card_number))
            AND upper(trim(rc.job_card_no)) = jc.k
        )
      )
      AND (
        (role.r = 'DENTOR' AND upper(trim(ba.dentor_employee_code)) = me.code)
        OR (role.r = 'DENTOR_HELPER' AND upper(trim(ba.dentor_helper_employee_code)) = me.code)
        OR (role.r = 'PAINTER' AND upper(trim(ba.painter_employee_code)) = me.code)
        OR (role.r = 'PAINTER_HELPER' AND upper(trim(ba.painter_helper_employee_code)) = me.code)
        OR (role.r = 'TECHNICIAN' AND upper(trim(ba.technician_employee_code)) = me.code)
        OR (role.r = 'RUBBING' AND upper(trim(ba.rubbing_employee_code)) = me.code)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.bodyshop_floor_support_assignments s, me, jc, role
    WHERE s.is_active = true
      AND me.code <> ''
      AND upper(trim(s.support_role)) = role.r
      AND upper(trim(s.employee_code)) = me.code
      AND (
        upper(trim(s.job_card_number)) = jc.k
        OR EXISTS (
          SELECT 1
          FROM public.bodyshop_repair_cards rc
          WHERE upper(trim(rc.job_card_no)) = upper(trim(s.job_card_number))
            AND upper(trim(coalesce(rc.reg_number, ''))) = jc.k
        )
        OR EXISTS (
          SELECT 1
          FROM public.bodyshop_repair_cards rc
          WHERE upper(trim(coalesce(rc.reg_number, ''))) = upper(trim(s.job_card_number))
            AND upper(trim(rc.job_card_no)) = jc.k
        )
      )
  );
$$;

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

CREATE OR REPLACE FUNCTION public.bodyshop_floor_work_can_write_daily_log_photo(p_log_id bigint)
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

  IF NOT public.has_module_modify('bodyshop_floor_work') THEN
    RETURN false;
  END IF;

  IF NOT public.dealer_code_in_scope(v_log.dealer_code) THEN
    RETURN false;
  END IF;

  IF upper(trim(v_log.employee_code)) = upper(trim(public.my_employee_code())) THEN
    RETURN true;
  END IF;

  RETURN public.bodyshop_floor_work_user_assigned_to_jc(v_log.job_card_number, v_log.floor_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bodyshop_floor_work_can_access_daily_log(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bodyshop_floor_work_can_write_daily_log_photo(bigint) TO authenticated;

DROP POLICY IF EXISTS bodyshop_floor_role_daily_log_photos_select ON public.bodyshop_floor_role_daily_log_photos;
CREATE POLICY bodyshop_floor_role_daily_log_photos_select
  ON public.bodyshop_floor_role_daily_log_photos
  FOR SELECT
  TO authenticated
  USING (public.bodyshop_floor_work_can_access_daily_log(log_id));

DROP POLICY IF EXISTS bodyshop_floor_role_daily_log_photos_insert ON public.bodyshop_floor_role_daily_log_photos;
CREATE POLICY bodyshop_floor_role_daily_log_photos_insert
  ON public.bodyshop_floor_role_daily_log_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.bodyshop_floor_work_can_write_daily_log_photo(log_id));

DROP POLICY IF EXISTS bodyshop_floor_role_daily_log_photos_delete ON public.bodyshop_floor_role_daily_log_photos;
CREATE POLICY bodyshop_floor_role_daily_log_photos_delete
  ON public.bodyshop_floor_role_daily_log_photos
  FOR DELETE
  TO authenticated
  USING (public.bodyshop_floor_work_can_write_daily_log_photo(log_id));
