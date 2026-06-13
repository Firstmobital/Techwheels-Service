BEGIN;

CREATE TABLE IF NOT EXISTS public.settings_bodyshop_surveyors (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dealer_code text NOT NULL DEFAULT public.my_dealer_code(),
  surveyor_name text NOT NULL,
  surveyor_contact_number text NOT NULL,
  surveyor_email text,
  created_by text NOT NULL DEFAULT COALESCE(auth.jwt() ->> 'email', auth.uid()::text, 'system'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_bodyshop_surveyors_name_not_blank CHECK (length(btrim(surveyor_name)) > 0),
  CONSTRAINT settings_bodyshop_surveyors_contact_not_blank CHECK (length(btrim(surveyor_contact_number)) > 0),
  CONSTRAINT settings_bodyshop_surveyors_unique_contact UNIQUE (dealer_code, surveyor_name, surveyor_contact_number)
);

CREATE INDEX IF NOT EXISTS idx_settings_bodyshop_surveyors_dealer_name
  ON public.settings_bodyshop_surveyors (dealer_code, surveyor_name);

DROP TRIGGER IF EXISTS trg_settings_bodyshop_surveyors_updated_at ON public.settings_bodyshop_surveyors;
CREATE TRIGGER trg_settings_bodyshop_surveyors_updated_at
  BEFORE UPDATE ON public.settings_bodyshop_surveyors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.settings_bodyshop_surveyors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_bodyshop_surveyors_select_v1 ON public.settings_bodyshop_surveyors;
CREATE POLICY settings_bodyshop_surveyors_select_v1 ON public.settings_bodyshop_surveyors
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('settings'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

DROP POLICY IF EXISTS settings_bodyshop_surveyors_insert_v1 ON public.settings_bodyshop_surveyors;
CREATE POLICY settings_bodyshop_surveyors_insert_v1 ON public.settings_bodyshop_surveyors
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_view('settings'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

DROP POLICY IF EXISTS settings_bodyshop_surveyors_update_v1 ON public.settings_bodyshop_surveyors;
CREATE POLICY settings_bodyshop_surveyors_update_v1 ON public.settings_bodyshop_surveyors
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('settings'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_view('settings'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

DROP POLICY IF EXISTS settings_bodyshop_surveyors_delete_v1 ON public.settings_bodyshop_surveyors;
CREATE POLICY settings_bodyshop_surveyors_delete_v1 ON public.settings_bodyshop_surveyors
FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('settings'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

COMMIT;
