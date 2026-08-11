-- HELP-001 hotfix:
-- 1) Re-seed help ticket categories (idempotent) — Service-domain catalog
-- 2) Allow authenticated users to list categories (no employee link required)
-- 3) Allow is_admin() to raise/list tickets without user_employee_links
-- Fixes prod: "Failed to load categories" / "Failed to load tickets" for Admin without employee link

-- ── Seed / expand categories ────────────────────────────────────────────────
INSERT INTO public.help_ticket_categories
  (key, label, description, default_priority, sla_response_minutes, sla_resolution_minutes, is_active)
VALUES
  ('technical', 'Technical Issues', 'App crashes, bugs, unexpected errors', 'high', 120, 480, true),
  ('web_app', 'Web App', 'Web portal UI / browser issues', 'normal', 120, 480, true),
  ('mobile_app', 'Mobile App', 'iOS/Android app issues', 'normal', 120, 480, true),
  ('login_access', 'Login & Access', 'Cannot sign in, password, session problems', 'high', 60, 240, true),
  ('permissions_rbac', 'Permissions / RBAC', 'Missing module access or wrong rights', 'high', 120, 480, true),
  ('reception_ops', 'Reception Ops', 'Reception intake / assignment workflow', 'normal', 240, 1440, true),
  ('service_advisor', 'Service Advisor', 'SA tracker / advisor workflow issues', 'normal', 240, 1440, true),
  ('floor_ops', 'Floor / Technician', 'Floor incharge or technician module issues', 'normal', 240, 1440, true),
  ('bodyshop_ops', 'Bodyshop Ops', 'Bodyshop tracker / floor / repair issues', 'normal', 240, 1440, true),
  ('parts_stock', 'Parts & Stock', 'Parts SPM / stock / inventory', 'normal', 240, 1440, true),
  ('autodoc', 'AutoDoc / Documents', 'Job card docs, photos, Drive uploads', 'normal', 180, 720, true),
  ('import_data', 'Imports / Data', 'CSV/Excel import or data sync issues', 'high', 180, 720, true),
  ('reports', 'Reports', 'Report missing data or wrong figures', 'normal', 240, 1440, true),
  ('whatsapp', 'WhatsApp / WA Automations', 'WA templates, reminders, automations', 'normal', 240, 1440, true),
  ('telecalling', 'Telecalling', 'Telecalling / insurance renewal calling queues', 'normal', 240, 1440, true),
  ('warranty', 'Warranty', 'Warranty reports / claims workflow', 'normal', 240, 1440, true),
  ('billing', 'Billing & Payments', 'Invoice / payment related support', 'normal', 240, 720, true),
  ('hr_admin', 'HR & Admin', 'Employee master, policies, admin tools', 'low', 480, 2880, true),
  ('other', 'Other', 'Anything that does not fit above', 'normal', 480, 2880, true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_priority = EXCLUDED.default_priority,
  sla_response_minutes = EXCLUDED.sla_response_minutes,
  sla_resolution_minutes = EXCLUDED.sla_resolution_minutes,
  is_active = true,
  updated_at = now();

-- ── Identity helper: admin fallback when no employee link ───────────────────
CREATE OR REPLACE FUNCTION public.help_ticket_require_employee()
RETURNS TABLE (
  user_id uuid,
  employee_code text,
  employee_name text,
  email text,
  department text,
  raiser_dealer_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_code := public.my_employee_code();

  IF v_code IS NOT NULL AND btrim(v_code) <> '' THEN
    RETURN QUERY
    SELECT
      v_uid,
      v_code,
      COALESCE(NULLIF(btrim(em.employee_name), ''), NULLIF(btrim(u.full_name), ''), v_code),
      u.email,
      em.department,
      uel.dealer_code
    FROM public.users u
    LEFT JOIN public.user_employee_links uel
      ON uel.user_id = u.id
     AND uel.employee_code = v_code
     AND uel.is_active = true
     AND uel.is_primary = true
    LEFT JOIN public.employee_master em
      ON em.employee_code = v_code
    WHERE u.id = v_uid
    LIMIT 1;
    RETURN;
  END IF;

  -- Admins (and super_admin via is_admin) may use Get Help without employee_master link
  IF public.is_admin() THEN
    RETURN QUERY
    SELECT
      v_uid,
      ('ADMIN:' || replace(v_uid::text, '-', '')),
      COALESCE(NULLIF(btrim(u.full_name), ''), NULLIF(btrim(u.email), ''), 'Admin'),
      u.email,
      NULL::text,
      NULL::text
    FROM public.users u
    WHERE u.id = v_uid
    LIMIT 1;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Employee link required';
END;
$$;

-- ── Categories: any authenticated user can list (master data) ───────────────
CREATE OR REPLACE FUNCTION public.help_ticket_list_categories()
RETURNS SETOF public.help_ticket_categories
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT c.*
  FROM public.help_ticket_categories c
  WHERE c.is_active = true
  ORDER BY c.label;
END;
$$;

GRANT EXECUTE ON FUNCTION public.help_ticket_require_employee() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.help_ticket_list_categories() TO authenticated, service_role;
