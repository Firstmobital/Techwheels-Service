BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.service_reception_entries (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dealer_code text NOT NULL DEFAULT public.my_dealer_code(),
  reg_number text NOT NULL,
  model text,
  service_type text NOT NULL,
  sa_name text NOT NULL,
  jc_number text,
  owner_name text,
  owner_phone text,
  source text NOT NULL,
  created_by text NOT NULL DEFAULT COALESCE(auth.jwt() ->> 'email', auth.uid()::text, 'system'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_reception_owner_phone_check CHECK (
    owner_phone IS NULL OR owner_phone ~ '^[0-9]{10}$'
  ),
  CONSTRAINT service_reception_reg_number_not_blank CHECK (length(btrim(reg_number)) > 0),
  CONSTRAINT service_reception_service_type_not_blank CHECK (length(btrim(service_type)) > 0),
  CONSTRAINT service_reception_sa_name_not_blank CHECK (length(btrim(sa_name)) > 0),
  CONSTRAINT service_reception_source_not_blank CHECK (length(btrim(source)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_service_reception_entries_dealer_created
  ON public.service_reception_entries (dealer_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_reception_entries_reg_number
  ON public.service_reception_entries (reg_number);

CREATE INDEX IF NOT EXISTS idx_service_reception_entries_jc_number
  ON public.service_reception_entries (jc_number);

DROP TRIGGER IF EXISTS trg_service_reception_entries_updated_at ON public.service_reception_entries;
CREATE TRIGGER trg_service_reception_entries_updated_at
  BEFORE UPDATE ON public.service_reception_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.service_reception_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_reception_select_v1 ON public.service_reception_entries;
CREATE POLICY service_reception_select_v1
  ON public.service_reception_entries
  FOR SELECT
  TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('reception'))
  );

DROP POLICY IF EXISTS service_reception_insert_v1 ON public.service_reception_entries;
CREATE POLICY service_reception_insert_v1
  ON public.service_reception_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('reception'))
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

DROP POLICY IF EXISTS service_reception_delete_v1 ON public.service_reception_entries;
CREATE POLICY service_reception_delete_v1
  ON public.service_reception_entries
  FOR DELETE
  TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('reception'))
  );

INSERT INTO public.modules (name, label, description, icon, route, sort_order, is_active)
VALUES (
  'reception',
  'Reception',
  'Front desk intake and service advisor assignment',
  'desk',
  '/reception',
  10,
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
