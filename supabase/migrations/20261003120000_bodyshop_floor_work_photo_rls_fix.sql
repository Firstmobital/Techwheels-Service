-- Workers could save daily log text but photo INSERT failed when log employee_code
-- did not match my_employee_code() (assignment slot vs login). Allow photo write when
-- the user is assigned on bodyshop floor for that job card + role.

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
      AND upper(trim(ba.job_card_number)) = jc.k
      AND me.code <> ''
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
      AND upper(trim(s.job_card_number)) = jc.k
      AND upper(trim(s.support_role)) = role.r
      AND upper(trim(s.employee_code)) = me.code
  );
$$;

GRANT EXECUTE ON FUNCTION public.bodyshop_floor_work_user_assigned_to_jc(text, text) TO authenticated;

DROP POLICY IF EXISTS bodyshop_floor_role_daily_log_photos_insert ON public.bodyshop_floor_role_daily_log_photos;
CREATE POLICY bodyshop_floor_role_daily_log_photos_insert
  ON public.bodyshop_floor_role_daily_log_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bodyshop_floor_role_daily_logs l
      WHERE l.id = log_id
        AND (
          public.is_admin()
          OR (
            public.has_module_modify('bodyshop_floor_work')
            AND public.dealer_code_in_scope(l.dealer_code)
            AND (
              upper(trim(l.employee_code)) = upper(trim(public.my_employee_code()))
              OR public.bodyshop_floor_work_user_assigned_to_jc(l.job_card_number, l.floor_role)
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS bodyshop_floor_role_daily_log_photos_delete ON public.bodyshop_floor_role_daily_log_photos;
CREATE POLICY bodyshop_floor_role_daily_log_photos_delete
  ON public.bodyshop_floor_role_daily_log_photos
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bodyshop_floor_role_daily_logs l
      WHERE l.id = log_id
        AND (
          public.is_admin()
          OR (
            public.has_module_modify('bodyshop_floor_work')
            AND public.dealer_code_in_scope(l.dealer_code)
            AND (
              upper(trim(l.employee_code)) = upper(trim(public.my_employee_code()))
              OR public.bodyshop_floor_work_user_assigned_to_jc(l.job_card_number, l.floor_role)
            )
          )
        )
    )
  );

-- Align log INSERT/UPDATE so assigned workers can write logs for their slot code.
DROP POLICY IF EXISTS bodyshop_floor_role_daily_logs_insert_worker ON public.bodyshop_floor_role_daily_logs;
CREATE POLICY bodyshop_floor_role_daily_logs_insert_worker
  ON public.bodyshop_floor_role_daily_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor_work')
      AND public.dealer_code_in_scope(dealer_code)
      AND (
        upper(trim(employee_code)) = upper(trim(public.my_employee_code()))
        OR public.bodyshop_floor_work_user_assigned_to_jc(job_card_number, floor_role)
      )
    )
  );

DROP POLICY IF EXISTS bodyshop_floor_role_daily_logs_update_worker ON public.bodyshop_floor_role_daily_logs;
CREATE POLICY bodyshop_floor_role_daily_logs_update_worker
  ON public.bodyshop_floor_role_daily_logs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor_work')
      AND public.dealer_code_in_scope(dealer_code)
      AND (
        upper(trim(employee_code)) = upper(trim(public.my_employee_code()))
        OR public.bodyshop_floor_work_user_assigned_to_jc(job_card_number, floor_role)
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor_work')
      AND public.dealer_code_in_scope(dealer_code)
      AND (
        upper(trim(employee_code)) = upper(trim(public.my_employee_code()))
        OR public.bodyshop_floor_work_user_assigned_to_jc(job_card_number, floor_role)
      )
    )
  );
