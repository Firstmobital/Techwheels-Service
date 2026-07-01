-- CRE Incentive Structure: per-car incentive rates based on sold-by / serviced-by classification
-- Mirrors the technician_earnings_settings / sa_earnings_settings key-value pattern.

CREATE TABLE IF NOT EXISTS public.cre_incentive_settings (
  key  text PRIMARY KEY,
  value text
);

ALTER TABLE public.cre_incentive_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_unrestricted_all_ops_v1 ON public.cre_incentive_settings;
CREATE POLICY admin_unrestricted_all_ops_v1 ON public.cre_incentive_settings
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS allow_read_cre_incentive_settings ON public.cre_incentive_settings;
CREATE POLICY allow_read_cre_incentive_settings ON public.cre_incentive_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS allow_admin_write_cre_incentive_settings ON public.cre_incentive_settings;
CREATE POLICY allow_admin_write_cre_incentive_settings ON public.cre_incentive_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = ANY (ARRAY['admin'::text, 'super_admin'::text])));

GRANT ALL ON TABLE public.cre_incentive_settings TO authenticated;
GRANT ALL ON TABLE public.cre_incentive_settings TO service_role;

-- Seed default rates (editable from the CRE Incentive page)
--   both_self_rate        : vehicle sold by self  AND serviced by self  -> Rs 125/car
--   both_other_rate       : vehicle sold by other AND serviced by other -> Rs 150/car
--   mixed_rate            : one side self, one side other              -> Rs 125/car (same as self rate)
--   self_service_aliases  : comma-separated substrings that identify "serviced by self" in all_service_data.last_service_dealer
INSERT INTO public.cre_incentive_settings (key, value) VALUES
  ('both_self_rate', '125'),
  ('both_other_rate', '150'),
  ('mixed_rate', '125'),
  ('self_service_aliases', 'techwheels,first mobital,paid service,free service')
ON CONFLICT (key) DO NOTHING;

-- modules_id_seq had fallen behind MAX(id) from a prior bulk import; resync before inserting.
SELECT setval(pg_get_serial_sequence('public.modules', 'id'), (SELECT COALESCE(MAX(id), 1) FROM public.modules));

-- Register the new module so admins can grant access via the Admin panel
INSERT INTO public.modules (name, label, description, icon, route, sort_order, is_active)
VALUES (
  'cre_incentive',
  'CRE Incentive',
  'CRE booking incentive structure',
  'reports',
  '/cre-incentive',
  24,
  true
)
ON CONFLICT (name) DO NOTHING;
