BEGIN;

ALTER TABLE public.service_reception_entries
  ADD COLUMN IF NOT EXISTS remark text,
  ADD COLUMN IF NOT EXISTS estimate_storage_path text,
  ADD COLUMN IF NOT EXISTS estimate_file_name text,
  ADD COLUMN IF NOT EXISTS estimate_content_type text,
  ADD COLUMN IF NOT EXISTS estimate_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimate_uploaded_by text;

CREATE INDEX IF NOT EXISTS idx_service_reception_entries_sa_name_norm
  ON public.service_reception_entries (lower(btrim(sa_name)));

CREATE OR REPLACE FUNCTION public.my_sa_name()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    btrim(
      coalesce(
        auth.jwt() ->> 'full_name',
        (
          SELECT u.full_name
          FROM public.users u
          WHERE u.id = auth.uid()
          LIMIT 1
        ),
        split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
      )
    ),
    ''
  );
$$;

DROP POLICY IF EXISTS service_reception_select_v1 ON public.service_reception_entries;
CREATE POLICY service_reception_select_v1
  ON public.service_reception_entries
  FOR SELECT
  TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('reception'))
  );

DROP POLICY IF EXISTS service_reception_select_sa_v1 ON public.service_reception_entries;
CREATE POLICY service_reception_select_sa_v1
  ON public.service_reception_entries
  FOR SELECT
  TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('service_advisor')
    AND lower(btrim(sa_name)) = lower(btrim(coalesce(public.my_sa_name(), '')))
  );

DROP POLICY IF EXISTS service_reception_update_v1 ON public.service_reception_entries;
CREATE POLICY service_reception_update_v1
  ON public.service_reception_entries
  FOR UPDATE
  TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('reception'))
  )
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('reception'))
  );

DROP POLICY IF EXISTS service_reception_update_sa_v1 ON public.service_reception_entries;
CREATE POLICY service_reception_update_sa_v1
  ON public.service_reception_entries
  FOR UPDATE
  TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('service_advisor')
    AND lower(btrim(sa_name)) = lower(btrim(coalesce(public.my_sa_name(), '')))
  )
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('service_advisor')
    AND lower(btrim(sa_name)) = lower(btrim(coalesce(public.my_sa_name(), '')))
  );

CREATE OR REPLACE FUNCTION public.enforce_service_reception_sa_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_admin() OR public.has_module_view('reception') THEN
    RETURN NEW;
  END IF;

  IF public.has_module_view('service_advisor') THEN
    IF lower(btrim(OLD.sa_name)) <> lower(btrim(coalesce(public.my_sa_name(), ''))) THEN
      RAISE EXCEPTION 'You can update only your own assigned rows';
    END IF;

    IF NEW.dealer_code IS DISTINCT FROM OLD.dealer_code
      OR NEW.reg_number IS DISTINCT FROM OLD.reg_number
      OR NEW.model IS DISTINCT FROM OLD.model
      OR NEW.sa_name IS DISTINCT FROM OLD.sa_name
      OR NEW.owner_name IS DISTINCT FROM OLD.owner_name
      OR NEW.owner_phone IS DISTINCT FROM OLD.owner_phone
      OR NEW.source IS DISTINCT FROM OLD.source
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Service Advisor can edit only Service Type, Job Card Number, Remark, and Estimate fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_reception_sa_update_guard ON public.service_reception_entries;
CREATE TRIGGER trg_service_reception_sa_update_guard
  BEFORE UPDATE ON public.service_reception_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_service_reception_sa_update();

INSERT INTO public.modules (name, label, description, icon, route, sort_order, is_active)
VALUES (
  'service_advisor',
  'Service Advisor',
  'Advisor-specific intake workspace with estimate upload and remarks',
  'user-check',
  '/service-advisor',
  11,
  true
)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  route = EXCLUDED.route,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

COMMIT;
