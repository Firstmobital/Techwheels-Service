-- Single module for Denter / Painter / Technician / Rubbing daily work logs (+ EDP compile).
-- Access via public.modules.name = bodyshop_floor_work and user_module_permissions.

CREATE TABLE IF NOT EXISTS public.bodyshop_floor_role_daily_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_card_number text NOT NULL,
  repair_card_id integer REFERENCES public.bodyshop_repair_cards(id) ON DELETE SET NULL,
  dealer_code text NOT NULL,
  update_date date NOT NULL,
  floor_role text NOT NULL,
  employee_code text NOT NULL,
  employee_name text,
  note_text text NOT NULL,
  is_support boolean DEFAULT false NOT NULL,
  created_by text,
  updated_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT bodyshop_floor_role_daily_logs_role_check CHECK (
    floor_role = ANY (ARRAY[
      'DENTOR'::text, 'DENTOR_HELPER'::text, 'PAINTER'::text, 'PAINTER_HELPER'::text,
      'TECHNICIAN'::text, 'RUBBING'::text
    ])
  ),
  CONSTRAINT bodyshop_floor_role_daily_logs_jc_date_role_emp_key UNIQUE (
    job_card_number, update_date, floor_role, employee_code, is_support
  )
);

CREATE INDEX IF NOT EXISTS bodyshop_floor_role_daily_logs_date_dealer_idx
  ON public.bodyshop_floor_role_daily_logs (update_date DESC, dealer_code);

CREATE INDEX IF NOT EXISTS bodyshop_floor_role_daily_logs_jc_date_idx
  ON public.bodyshop_floor_role_daily_logs (job_card_number, update_date DESC);

COMMENT ON TABLE public.bodyshop_floor_role_daily_logs IS
  'Per-role daily work note for assigned bodyshop floor staff (IST calendar day).';

CREATE TABLE IF NOT EXISTS public.bodyshop_floor_role_daily_log_photos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  log_id bigint NOT NULL REFERENCES public.bodyshop_floor_role_daily_logs(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'autodoc',
  storage_path text NOT NULL,
  file_name text,
  content_type text,
  file_size_bytes bigint,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT bodyshop_floor_role_daily_log_photos_content_type_image_check CHECK (
    (content_type IS NULL) OR (content_type ~~ 'image/%'::text)
  )
);

CREATE INDEX IF NOT EXISTS bodyshop_floor_role_daily_log_photos_log_id_idx
  ON public.bodyshop_floor_role_daily_log_photos (log_id);

CREATE OR REPLACE FUNCTION public.touch_bodyshop_floor_role_daily_logs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bodyshop_floor_role_daily_logs_updated_at ON public.bodyshop_floor_role_daily_logs;
CREATE TRIGGER bodyshop_floor_role_daily_logs_updated_at
  BEFORE UPDATE ON public.bodyshop_floor_role_daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_bodyshop_floor_role_daily_logs_updated_at();

CREATE OR REPLACE FUNCTION public.my_employee_master_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT em.role
  FROM public.employee_master em
  WHERE upper(trim(em.employee_code)) = upper(trim(public.my_employee_code()))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.my_employee_master_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_bodyshop_floor_work_edp_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT public.is_admin()
    OR public.employee_has_business_role(public.my_employee_master_role(), 'EDP');
$$;

GRANT EXECUTE ON FUNCTION public.is_bodyshop_floor_work_edp_user() TO authenticated;

ALTER TABLE public.bodyshop_floor_role_daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodyshop_floor_role_daily_log_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY bodyshop_floor_role_daily_logs_admin_all
  ON public.bodyshop_floor_role_daily_logs
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY bodyshop_floor_role_daily_logs_select
  ON public.bodyshop_floor_role_daily_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.dealer_code_in_scope(dealer_code)
      AND (
        public.has_module_view('bodyshop_floor_work')
        OR public.has_module_modify('bodyshop_floor_work')
        OR public.has_module_view('bodyshop_floor')
        OR public.has_module_modify('bodyshop_floor')
      )
    )
  );

CREATE POLICY bodyshop_floor_role_daily_logs_insert_worker
  ON public.bodyshop_floor_role_daily_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor_work')
      AND public.dealer_code_in_scope(dealer_code)
      AND upper(trim(employee_code)) = upper(trim(public.my_employee_code()))
    )
  );

CREATE POLICY bodyshop_floor_role_daily_logs_update_worker
  ON public.bodyshop_floor_role_daily_logs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor_work')
      AND public.dealer_code_in_scope(dealer_code)
      AND upper(trim(employee_code)) = upper(trim(public.my_employee_code()))
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor_work')
      AND public.dealer_code_in_scope(dealer_code)
      AND upper(trim(employee_code)) = upper(trim(public.my_employee_code()))
    )
  );

CREATE POLICY bodyshop_floor_role_daily_log_photos_select
  ON public.bodyshop_floor_role_daily_log_photos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bodyshop_floor_role_daily_logs l
      WHERE l.id = log_id
        AND (
          public.is_admin()
          OR (
            public.dealer_code_in_scope(l.dealer_code)
            AND (
              public.has_module_view('bodyshop_floor_work')
              OR public.has_module_modify('bodyshop_floor_work')
              OR public.has_module_view('bodyshop_floor')
              OR public.has_module_modify('bodyshop_floor')
            )
          )
        )
    )
  );

CREATE POLICY bodyshop_floor_role_daily_log_photos_insert
  ON public.bodyshop_floor_role_daily_log_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bodyshop_floor_role_daily_logs l
      WHERE l.id = log_id
        AND (
          public.is_admin()
          OR (
            public.has_module_modify('bodyshop_floor_work')
            AND public.dealer_code_in_scope(l.dealer_code)
            AND upper(trim(l.employee_code)) = upper(trim(public.my_employee_code()))
          )
        )
    )
  );

CREATE POLICY bodyshop_floor_role_daily_log_photos_delete
  ON public.bodyshop_floor_role_daily_log_photos
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bodyshop_floor_role_daily_logs l
      WHERE l.id = log_id
        AND (
          public.is_admin()
          OR (
            public.has_module_modify('bodyshop_floor_work')
            AND public.dealer_code_in_scope(l.dealer_code)
            AND upper(trim(l.employee_code)) = upper(trim(public.my_employee_code()))
          )
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.bodyshop_floor_role_daily_logs TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.bodyshop_floor_role_daily_log_photos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE bodyshop_floor_role_daily_logs_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE bodyshop_floor_role_daily_log_photos_id_seq TO authenticated;

-- EDP may publish consolidated line to official floor daily update.
DROP POLICY IF EXISTS bodyshop_floor_daily_updates_insert_rbac ON public.bodyshop_floor_daily_updates;
CREATE POLICY bodyshop_floor_daily_updates_insert_rbac
  ON public.bodyshop_floor_daily_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor')
      AND public.dealer_code_in_scope(dealer_code)
    )
    OR (
      public.has_module_modify('bodyshop_floor_work')
      AND public.is_bodyshop_floor_work_edp_user()
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

DROP POLICY IF EXISTS bodyshop_floor_daily_updates_update_rbac ON public.bodyshop_floor_daily_updates;
CREATE POLICY bodyshop_floor_daily_updates_update_rbac
  ON public.bodyshop_floor_daily_updates
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor')
      AND public.dealer_code_in_scope(dealer_code)
    )
    OR (
      public.has_module_modify('bodyshop_floor_work')
      AND public.is_bodyshop_floor_work_edp_user()
      AND public.dealer_code_in_scope(dealer_code)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor')
      AND public.dealer_code_in_scope(dealer_code)
    )
    OR (
      public.has_module_modify('bodyshop_floor_work')
      AND public.is_bodyshop_floor_work_edp_user()
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

SELECT setval(pg_get_serial_sequence('public.modules', 'id'), (SELECT COALESCE(MAX(id), 1) FROM public.modules));

INSERT INTO public.modules (name, label, description, icon, route, sort_order, is_active)
VALUES (
  'bodyshop_floor_work',
  'Bodyshop Floor Work',
  'Daily work updates with photos for assigned Denter, Painter, Technician, Rubbing; EDP compile inbox',
  'floor',
  '/bodyshop-floor-work',
  26,
  true
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  route = EXCLUDED.route,
  is_active = true;
