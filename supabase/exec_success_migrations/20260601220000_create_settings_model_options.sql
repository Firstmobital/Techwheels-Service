BEGIN;

CREATE TABLE IF NOT EXISTS public.settings_model_options (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dealer_code text NOT NULL DEFAULT public.my_dealer_code(),
  model_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL DEFAULT COALESCE(auth.jwt() ->> 'email', auth.uid()::text, 'system'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_model_options_model_name_not_blank CHECK (length(btrim(model_name)) > 0),
  CONSTRAINT settings_model_options_dealer_model_unique UNIQUE (dealer_code, model_name)
);

CREATE INDEX IF NOT EXISTS idx_settings_model_options_dealer_active
  ON public.settings_model_options (dealer_code, is_active DESC, sort_order ASC);

CREATE INDEX IF NOT EXISTS idx_settings_model_options_model_name
  ON public.settings_model_options (model_name);

DROP TRIGGER IF EXISTS trg_settings_model_options_updated_at ON public.settings_model_options;
CREATE TRIGGER trg_settings_model_options_updated_at
  BEFORE UPDATE ON public.settings_model_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.settings_model_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_model_options_select_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_select_v1
  ON public.settings_model_options
  FOR SELECT
  TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('settings'))
  );

DROP POLICY IF EXISTS settings_model_options_insert_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_insert_v1
  ON public.settings_model_options
  FOR INSERT
  TO authenticated
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('settings'))
  );

DROP POLICY IF EXISTS settings_model_options_update_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_update_v1
  ON public.settings_model_options
  FOR UPDATE
  TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('settings'))
  )
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('settings'))
  );

DROP POLICY IF EXISTS settings_model_options_delete_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_delete_v1
  ON public.settings_model_options
  FOR DELETE
  TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND (public.is_admin() OR public.has_module_view('settings'))
  );

-- Seed default models for all existing dealers
INSERT INTO public.settings_model_options (dealer_code, model_name, sort_order, is_active)
WITH dealers AS (
  SELECT DISTINCT s.dealer_code
  FROM public.service_reception_entries s
  WHERE s.dealer_code IS NOT NULL
    AND btrim(s.dealer_code) <> ''

  UNION

  SELECT DISTINCT hardcoded.dealer_code
  FROM (
    VALUES
      ('3000840'),
      ('500A840'),
      ('3001440')
  ) AS hardcoded(dealer_code)
),
candidate_models AS (
  -- Keep existing model values observed in reception data per dealer.
  SELECT DISTINCT s.dealer_code, btrim(s.model) AS model_name
  FROM public.service_reception_entries s
  WHERE s.dealer_code IS NOT NULL
    AND btrim(s.dealer_code) <> ''
    AND s.model IS NOT NULL
    AND btrim(s.model) <> ''

  UNION

  -- Also seed a baseline model list for every known dealer.
  SELECT d.dealer_code, defaults.model_name
  FROM dealers d
  CROSS JOIN (
    VALUES
      ('Nexon'), ('Punch EV'), ('Tiago EV'), ('Tigor EV'), ('Altroz'),
      ('Curvv'), ('Curvv EV'), ('Harrier'), ('Harrier EV'), ('Hexa'),
      ('Nexon EV'), ('Punch'), ('Punch CNG'), ('Safari'), ('Sierra'),
      ('Tiago'), ('Tigor')
  ) AS defaults(model_name)
)
SELECT
  dealer_code,
  model_name,
  row_number() OVER (PARTITION BY dealer_code ORDER BY model_name) - 1 AS sort_order,
  true
FROM candidate_models
ON CONFLICT (dealer_code, model_name) DO NOTHING;

COMMIT;
