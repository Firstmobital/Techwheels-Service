-- =============================================================================
-- Technician tracker timeout — CONFIRMED root-cause check (do not guess)
-- User: Shashank Pandey <pandeyshashank1010@gmail.com>
--
-- Run in Supabase Dashboard → SQL Editor (postgres role).
-- Read section I_verdict last — it states confirmed root cause from live data.
-- =============================================================================

-- ▼▼▼ SET TARGET EMAIL HERE ▼▼▼
-- (Only change this line if checking a different user.)
WITH vars AS (
  SELECT 'pandeyshashank1010@gmail.com'::text AS target_email
),

-- ── A) Resolve user ───────────────────────────────────────────────────────────
target AS (
  SELECT
    au.id,
    au.email,
    au.last_sign_in_at,
    pu.full_name,
    pu.role AS platform_role,
    pu.is_active,
    pu.branch
  FROM vars v
  JOIN auth.users au ON lower(btrim(au.email)) = lower(btrim(v.target_email))
  LEFT JOIN public.users pu ON pu.id = au.id
),

-- ── B) Module permissions ───────────────────────────────────────────────────
b_modules AS (
  SELECT
    'B_modules' AS section,
    m.name AS module_name,
    p.can_view,
    p.can_modify,
    p.can_delete
  FROM target t
  JOIN public.user_module_permissions p ON p.user_id = t.id
  JOIN public.modules m ON m.id = p.module_id AND m.is_active = true
),

-- ── C) Employee links ─────────────────────────────────────────────────────────
c_links AS (
  SELECT
    'C_employee_links' AS section,
    uel.employee_code,
    uel.dealer_code,
    uel.is_primary,
    uel.is_active,
    em.role AS employee_master_role,
    em.employee_name
  FROM target t
  JOIN public.user_employee_links uel ON uel.user_id = t.id
  LEFT JOIN public.employee_master em ON em.employee_code = uel.employee_code
),

-- ── D) RLS gates ──────────────────────────────────────────────────────────────
perms AS (
  SELECT
    t.id AS user_id,
    coalesce(bool_or(m.name = 'service_advisor' AND p.can_view), false) AS has_service_advisor,
    coalesce(bool_or(m.name = 'floor_incharge' AND p.can_view), false) AS has_floor_incharge,
    coalesce(bool_or(m.name = 'sa_tracker' AND p.can_view), false) AS has_sa_tracker,
    coalesce(bool_or(m.name = 'technician' AND p.can_view), false) AS has_technician
  FROM target t
  LEFT JOIN public.user_module_permissions p ON p.user_id = t.id
  LEFT JOIN public.modules m ON m.id = p.module_id AND m.is_active = true
  GROUP BY t.id
),
profile AS (
  SELECT
    t.id AS user_id,
    t.platform_role,
    t.is_active,
    (t.is_active = true AND t.platform_role IN ('admin', 'super_admin')) AS is_platform_admin
  FROM target t
),
linked AS (
  SELECT
    t.id AS user_id,
    array_agg(DISTINCT btrim(uel.employee_code)) FILTER (WHERE uel.is_active) AS linked_codes,
    (
      SELECT btrim(uel2.employee_code)
      FROM public.user_employee_links uel2
      WHERE uel2.user_id = t.id AND uel2.is_active = true
      ORDER BY uel2.is_primary DESC, uel2.updated_at DESC
      LIMIT 1
    ) AS primary_employee_code
  FROM target t
  LEFT JOIN public.user_employee_links uel ON uel.user_id = t.id
  GROUP BY t.id
),
tech_codes AS (
  SELECT
    l.user_id,
    count(DISTINCT em.employee_code) AS linked_technician_code_count,
    array_agg(DISTINCT btrim(em.employee_code)) AS technician_income_codes
  FROM linked l
  JOIN public.user_employee_links uel ON uel.user_id = l.user_id AND uel.is_active
  JOIN public.employee_master em ON em.employee_code = uel.employee_code
  WHERE lower(btrim(coalesce(em.role, ''))) LIKE '%technician%'
  GROUP BY l.user_id
),
d_rls AS (
  SELECT
    'D_rls_gates' AS section,
    pr.platform_role,
    pr.is_active,
    pr.is_platform_admin,
    pe.has_service_advisor,
    pe.has_floor_incharge,
    pe.has_sa_tracker,
    pe.has_technician,
    li.primary_employee_code,
    li.linked_codes,
    coalesce(tc.technician_income_codes, ARRAY[]::text[]) AS technician_income_codes,
    coalesce(tc.linked_technician_code_count, 0) AS linked_technician_code_count,
    (pr.is_platform_admin OR pe.has_floor_incharge) AS policy_rbac_floor_pass,
    (pr.is_platform_admin OR pe.has_sa_tracker) AS policy_rbac_sa_tracker_pass,
    (
      pe.has_service_advisor
      AND NOT pe.has_floor_incharge
      AND NOT pe.has_sa_tracker
    ) AS sa_policy_calls_user_sa_owns_per_row,
    (
      pr.is_platform_admin
      OR (pe.has_technician AND coalesce(tc.linked_technician_code_count, 0) > 0)
    ) AS technician_policy_can_apply
  FROM profile pr
  JOIN perms pe ON pe.user_id = pr.user_id
  JOIN linked li ON li.user_id = pr.user_id
  LEFT JOIN tech_codes tc ON tc.user_id = pr.user_id
),

-- ── E) Live policies ──────────────────────────────────────────────────────────
e_policies AS (
  SELECT
    'E_live_policies' AS section,
    pol.polname,
    pg_get_expr(pol.polqual, pol.polrelid) AS using_expression
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  WHERE nsp.nspname = 'public'
    AND cls.relname = 'technician_assignments'
    AND pol.polcmd = 'r'
),

-- ── F) Frontend scope ─────────────────────────────────────────────────────────
f_frontend AS (
  SELECT
    'F_frontend_scope' AS section,
    CASE
      WHEN pr.is_platform_admin THEN 'broad_access (platform admin)'
      WHEN pe.has_floor_incharge OR pe.has_sa_tracker THEN 'broad_access (floor_incharge or sa_tracker)'
      WHEN coalesce(tc.linked_technician_code_count, 0) > 0 THEN 'narrow: technician_code IN (...)'
      WHEN pe.has_service_advisor THEN 'narrow: job_card_number IN (SA owned JCs)'
      ELSE 'no rows (no scope)'
    END AS expected_frontend_query_shape,
    pr.is_platform_admin,
    pe.has_floor_incharge,
    pe.has_sa_tracker,
    pe.has_service_advisor,
    coalesce(tc.linked_technician_code_count, 0) AS linked_technician_code_count
  FROM profile pr
  JOIN perms pe ON pe.user_id = pr.user_id
  LEFT JOIN tech_codes tc ON tc.user_id = pr.user_id
),

-- ── G) Row volume (current IST month window, same as app) ─────────────────────
month_bounds AS (
  SELECT
    date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date)::date AS month_start,
    ((date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date) + interval '1 month - 1 day'))::date AS month_end
),
assigned_window AS (
  SELECT
    (month_start - interval '90 days')::date AS assigned_from_date,
    (month_end + interval '7 days')::date AS assigned_to_date
  FROM month_bounds
),
g_volume AS (
  SELECT
    'G_row_volume' AS section,
    w.assigned_from_date,
    w.assigned_to_date,
    count(*) AS income_view_rows_in_assigned_window
  FROM assigned_window w
  CROSS JOIN public.vw_technician_income_assignments ta
  WHERE ta.assigned_at >= (w.assigned_from_date::text || 'T00:00:00+05:30')::timestamptz
    AND ta.assigned_at <= (w.assigned_to_date::text || 'T23:59:59+05:30')::timestamptz
  GROUP BY w.assigned_from_date, w.assigned_to_date
),

-- ── H) SA reception row count ─────────────────────────────────────────────────
h_sa AS (
  SELECT
    'H_sa_reception_scope' AS section,
    li.primary_employee_code AS sa_code,
    count(sre.id) AS reception_rows_for_sa,
    count(sre.id) FILTER (WHERE nullif(btrim(sre.jc_number), '') IS NOT NULL) AS reception_rows_with_jc
  FROM linked li
  LEFT JOIN public.service_reception_entries sre
    ON upper(btrim(coalesce(sre.sa_employee_code, ''))) = upper(btrim(coalesce(li.primary_employee_code, '')))
  GROUP BY li.primary_employee_code
),

-- ── I) Verdict ────────────────────────────────────────────────────────────────
live_sa_policy AS (
  SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') AS expr
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  WHERE cls.relname = 'technician_assignments'
    AND pol.polname = 'technician_assignments_select_sa_own_jobs'
  LIMIT 1
),
live_rbac_policy AS (
  SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') AS expr
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  WHERE cls.relname = 'technician_assignments'
    AND pol.polname = 'technician_assignments_select_rbac'
  LIMIT 1
),
i_verdict AS (
  SELECT
    'I_verdict' AS section,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN
        'USER NOT FOUND — check email spelling in vars CTE'
      WHEN (SELECT is_platform_admin FROM profile LIMIT 1) THEN
        'Platform admin — is_admin() should bypass per-row SA check. Timeout may be unrelated or role mismatch in public.users.'
      WHEN (SELECT has_sa_tracker FROM perms LIMIT 1)
       AND (SELECT expr FROM live_rbac_policy) NOT LIKE '%sa_tracker%' THEN
        'CONFIRMED: user has sa_tracker module but technician_assignments_select_rbac lacks sa_tracker. Expensive SA branch used. Apply 20260727123000.'
      WHEN (SELECT has_service_advisor FROM perms LIMIT 1)
       AND ((SELECT has_floor_incharge FROM perms LIMIT 1) OR (SELECT has_sa_tracker FROM perms LIMIT 1))
       AND (SELECT expr FROM live_sa_policy) LIKE '%WHEN public.has_module_view(''service_advisor''%' THEN
        'CONFIRMED: user has service_advisor + (floor_incharge OR sa_tracker) and OLD sa_own_jobs CASE checks SA first → user_sa_owns_job_card_number per row (matches your error log). Apply 20260727123000.'
      WHEN (SELECT has_service_advisor FROM perms LIMIT 1)
       AND NOT (SELECT has_floor_incharge FROM perms LIMIT 1)
       AND NOT (SELECT has_sa_tracker FROM perms LIMIT 1)
       AND (SELECT sa_policy_calls_user_sa_owns_per_row FROM d_rls LIMIT 1) THEN
        'CONFIRMED: SA-only user — user_sa_owns_job_card_number runs per assignment row. Frontend should narrow by job_card_number; apply 20260727123000 + latest frontend.'
      WHEN (SELECT expected_frontend_query_shape FROM f_frontend LIMIT 1) LIKE 'broad_access%'
       AND (SELECT sa_policy_calls_user_sa_owns_per_row FROM d_rls LIMIT 1) = false
       AND (SELECT expr FROM live_sa_policy) ~* 'NOT\s+(public\.)?has_module_view\s*\(\s*''floor_incharge''' THEN
        'FIX APPLIED: user has floor_incharge/sa_tracker broad access; sa_own_jobs no longer calls user_sa_owns for this user. If /technician still times out, capture a new Postgres log — root cause is no longer the SA-per-row RLS bug.'
      ELSE
        'See sections B–H — paste full output for manual read.'
    END AS root_cause_verdict,
    (SELECT expr FROM live_sa_policy) ~* 'NOT\s+public\.has_module_view\s*\(\s*''floor_incharge''|NOT\s+has_module_view\s*\(\s*''floor_incharge''' AS fix_20260727123000_sa_policy_applied,
    (SELECT expr FROM live_rbac_policy) ~* 'has_module_view\s*\(\s*''sa_tracker''' AS fix_20260727123000_rbac_applied,
    (SELECT has_service_advisor FROM perms LIMIT 1) AS has_service_advisor,
    (SELECT has_floor_incharge FROM perms LIMIT 1) AS has_floor_incharge,
    (SELECT has_sa_tracker FROM perms LIMIT 1) AS has_sa_tracker,
    (SELECT has_technician FROM perms LIMIT 1) AS has_technician,
    (SELECT expected_frontend_query_shape FROM f_frontend LIMIT 1) AS frontend_query_shape
)

-- ═══ SINGLE STATEMENT OUTPUT (Supabase SQL Editor: select all & run once) ═══
SELECT section, sort_ord, payload
FROM (
  SELECT 'A_user' AS section, 10 AS sort_ord, coalesce((SELECT to_jsonb(t.*) FROM target t LIMIT 1), '{}'::jsonb) AS payload
  UNION ALL
  SELECT 'B_modules', 20, coalesce((SELECT jsonb_agg(to_jsonb(b) - 'section' ORDER BY b.module_name) FROM b_modules b), '[]'::jsonb)
  UNION ALL
  SELECT 'C_employee_links', 30, coalesce((SELECT jsonb_agg(to_jsonb(c) - 'section' ORDER BY c.is_primary DESC NULLS LAST) FROM c_links c), '[]'::jsonb)
  UNION ALL
  SELECT 'D_rls_gates', 40, coalesce((SELECT to_jsonb(d.*) - 'section' FROM d_rls d LIMIT 1), '{}'::jsonb)
  UNION ALL
  SELECT 'E_live_policies', 50, coalesce((SELECT jsonb_agg(to_jsonb(e) - 'section' ORDER BY e.polname) FROM e_policies e), '[]'::jsonb)
  UNION ALL
  SELECT 'F_frontend_scope', 60, coalesce((SELECT to_jsonb(f.*) - 'section' FROM f_frontend f LIMIT 1), '{}'::jsonb)
  UNION ALL
  SELECT 'G_row_volume', 70, coalesce((SELECT to_jsonb(g.*) - 'section' FROM g_volume g LIMIT 1), '{}'::jsonb)
  UNION ALL
  SELECT 'H_sa_reception_scope', 80, coalesce((SELECT to_jsonb(h.*) - 'section' FROM h_sa h LIMIT 1), '{}'::jsonb)
  UNION ALL
  SELECT 'I_verdict', 90, coalesce((SELECT to_jsonb(i.*) - 'section' FROM i_verdict i LIMIT 1), '{}'::jsonb)
) out
ORDER BY sort_ord;

-- Tip: expand the I_verdict row payload → root_cause_verdict for the confirmed diagnosis.
