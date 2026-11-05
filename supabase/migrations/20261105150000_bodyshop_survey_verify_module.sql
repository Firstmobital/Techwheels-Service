-- Permission-only module: Survey → Floor "Verify" tab (no employee_master link required).

SELECT setval(pg_get_serial_sequence('public.modules', 'id'), (SELECT COALESCE(MAX(id), 1) FROM public.modules));

INSERT INTO public.modules (name, label, description, icon, route, sort_order, is_active)
VALUES (
  'bodyshop_survey_verify',
  'Bodyshop Survey Verify',
  'Bodyshop manager verify step before assigning Floor 2/3 (Repair Tracker Verify tab)',
  'check',
  '/bodyshop-repair',
  27,
  true
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  route = EXCLUDED.route,
  is_active = true;
