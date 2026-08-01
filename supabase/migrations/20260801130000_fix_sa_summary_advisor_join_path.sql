-- Advisor summary RPC: dedicated JOIN path (no scope_fn) + 30s function timeout.
--
-- PANKAJ-class users still timed out because employee_code_only was false when
-- employee_master.role contained FLOOR_INCHARGE or extra module flags — forcing
-- service_reception_entry_in_summary_scope() over the full month (~1854 rows).
--
-- Fix:
-- 1) user_needs_sa_summary_broad_scope() — only CRM/SM/GM need dealer-wide scan.
-- 2) Early RETURN with INNER JOIN user_employee_links (matches RLS, uses index).
-- 3) statement_timeout = 30s on this function (Supabase default ~8s is too tight for CRM path).
--
-- Apply: node scripts/apply-sql-files.mjs supabase/migrations/20260801130000_fix_sa_summary_advisor_join_path.sql

CREATE OR REPLACE FUNCTION public.user_needs_sa_summary_broad_scope()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel
    JOIN public.employee_master em ON em.employee_code = uel.employee_code
    WHERE uel.user_id = auth.uid()
      AND uel.is_active = true
      AND (
        public.employee_has_business_role(em.role, 'CRM')
        OR public.employee_has_business_role(em.role, 'SM')
        OR public.employee_has_business_role(em.role, 'GM')
      )
  );
$$;

COMMENT ON FUNCTION public.user_needs_sa_summary_broad_scope() IS
  'True when SA summary must scan beyond own employee-code rows (CRM/SM/GM dealer scope).';

GRANT EXECUTE ON FUNCTION public.user_needs_sa_summary_broad_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_needs_sa_summary_broad_scope() TO service_role;

CREATE OR REPLACE FUNCTION public.get_service_advisor_summary_counts(
  p_created_from timestamptz,
  p_created_to timestamptz,
  p_branch text DEFAULT NULL,
  p_fuel_type text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_advisor_key text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_broad_scope boolean;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_view('service_advisor'::text)
    OR public.has_module_modify('service_advisor'::text)
    OR public.has_module_view('reception'::text)
    OR public.has_module_view('floor_incharge'::text)
    OR public.has_module_view('bodyshop_floor'::text)
    OR public.has_module_modify('bodyshop_floor'::text)
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.is_admin();
  v_broad_scope := public.user_needs_sa_summary_broad_scope();

  -- Assigned advisor fast path: JOIN own employee link rows only (never calls scope_fn).
  IF NOT v_is_admin AND NOT v_broad_scope THEN
    RETURN (
    WITH floor_types AS (
      SELECT ARRAY[
        'running repairs', 'first free service', 'second free service', 'third free service',
        'paid service', 'updation', 'e breakdown', 'campaign'
      ]::text[] AS vals
    ),
    scoped AS MATERIALIZED (
      SELECT
        r.id,
        r.jc_number,
        r.service_type,
        r.estimate_storage_path,
        r.invoice_done_at,
        r.branch,
        r.sa_employee_code,
        r.sa_display_name,
        r.sa_name,
        r.reg_number,
        r.model,
        r.owner_name,
        r.owner_phone,
        r.source,
        r.created_by,
        lower(trim(regexp_replace(coalesce(r.service_type, ''), '\s+', ' ', 'g'))) AS st_norm,
        coalesce(
          nullif(btrim(em.fuel_type), ''),
          nullif(btrim(r.portal), ''),
          'Unknown'
        ) AS fuel_label
      FROM public.service_reception_entries r
      INNER JOIN public.user_employee_links uel
        ON uel.user_id = auth.uid()
        AND uel.is_active = true
        AND uel.employee_code = r.sa_employee_code
      LEFT JOIN public.employee_master em
        ON upper(btrim(em.employee_code)) = upper(btrim(r.sa_employee_code))
      WHERE r.created_at >= p_created_from
        AND r.created_at <= p_created_to
    ),
    flagged AS MATERIALIZED (
      SELECT
        s.*,
        ft.vals AS floor_type_list,
        (
          p_search IS NULL OR btrim(p_search) = ''
          OR coalesce(s.reg_number, '') ILIKE '%' || p_search || '%'
          OR coalesce(s.model, '') ILIKE '%' || p_search || '%'
          OR coalesce(s.jc_number, '') ILIKE '%' || p_search || '%'
          OR coalesce(s.owner_name, '') ILIKE '%' || p_search || '%'
          OR coalesce(s.owner_phone, '') ILIKE '%' || p_search || '%'
          OR coalesce(s.sa_name, '') ILIKE '%' || p_search || '%'
          OR coalesce(s.sa_display_name, '') ILIKE '%' || p_search || '%'
          OR coalesce(s.source, '') ILIKE '%' || p_search || '%'
          OR coalesce(s.created_by, '') ILIKE '%' || p_search || '%'
        ) AS ok_search,
        (
          p_advisor_key IS NULL OR btrim(p_advisor_key) = ''
          OR (p_advisor_key LIKE 'code:%' AND upper(btrim(s.sa_employee_code)) = upper(btrim(substring(p_advisor_key from 6))))
          OR (p_advisor_key LIKE 'name:%' AND lower(btrim(coalesce(s.sa_display_name, s.sa_name, ''))) = lower(btrim(substring(p_advisor_key from 6))))
        ) AS ok_advisor,
        (
          p_category IS NULL OR btrim(p_category) = ''
          OR (p_category = 'floor' AND s.st_norm = ANY (ft.vals))
          OR (p_category = 'bodyshop' AND s.st_norm = 'accident')
          OR (p_category = 'others' AND btrim(coalesce(s.service_type, '')) <> '' AND s.st_norm NOT IN ('accident', 'rusting') AND s.st_norm <> ALL (ft.vals))
          OR (p_category = 'null' AND btrim(coalesce(s.service_type, '')) = '')
        ) AS ok_category,
        (p_branch IS NULL OR btrim(p_branch) = '' OR s.branch = p_branch) AS ok_branch,
        (p_fuel_type IS NULL OR btrim(p_fuel_type) = '' OR s.fuel_label = p_fuel_type) AS ok_fuel
      FROM scoped s
      CROSS JOIN floor_types ft
    ),
    kpi_base AS MATERIALIZED (
      SELECT * FROM flagged f
      WHERE f.ok_search AND f.ok_advisor AND f.ok_category AND f.ok_branch AND f.ok_fuel
    ),
    jc_keys AS (
      SELECT DISTINCT upper(btrim(b.jc_number)) AS jc
      FROM kpi_base b
      WHERE btrim(coalesce(b.jc_number, '')) <> ''
    ),
    assign AS MATERIALIZED (
      SELECT
        upper(btrim(t.job_card_number)) AS jc,
        bool_or(lower(btrim(coalesce(t.work_status, ''))) = 'completed') AS is_completed,
        bool_or(lower(btrim(coalesce(t.work_status, ''))) = 'hold') AS is_hold,
        bool_or(lower(btrim(coalesce(t.work_status, ''))) = 'work_inprocess') AS is_in_process
      FROM public.technician_assignments t
      WHERE upper(btrim(t.job_card_number)) IN (SELECT jc FROM jc_keys)
      GROUP BY 1
    ),
    enriched AS MATERIALIZED (
      SELECT
        b.*,
        coalesce(a.is_completed, false) AS work_completed,
        coalesce(a.is_hold, false) AS work_hold,
        coalesce(a.is_in_process, false) AS work_in_process,
        coalesce(a.jc IS NOT NULL, false) AS has_assignment,
        (b.st_norm = ANY (b.floor_type_list)) AS is_floor,
        (b.st_norm = 'accident') AS is_bodyshop,
        (b.st_norm = 'rusting') AS is_rusting
      FROM kpi_base b
      LEFT JOIN assign a ON upper(btrim(coalesce(b.jc_number, ''))) = a.jc
    ),
    kpi_counts AS (
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE btrim(coalesce(jc_number, '')) = '')::int AS job_card_pending,
        count(*) FILTER (WHERE btrim(coalesce(service_type, '')) = '')::int AS sr_type_pending,
        count(*) FILTER (WHERE NOT is_bodyshop AND NOT is_rusting AND estimate_storage_path IS NULL)::int AS estimate_pending,
        count(*) FILTER (WHERE NOT is_bodyshop AND NOT is_rusting AND work_completed AND invoice_done_at IS NULL)::int AS invoice_pending,
        count(*) FILTER (WHERE is_floor AND (btrim(coalesce(jc_number, '')) = '' OR NOT has_assignment))::int AS no_technician,
        count(*) FILTER (WHERE work_hold)::int AS hold,
        count(*) FILTER (WHERE work_in_process)::int AS in_process,
        count(*) FILTER (WHERE work_completed AND invoice_done_at IS NOT NULL)::int AS completed
      FROM enriched
    ),
    category_counts AS (
      SELECT jsonb_build_object(
        'all', count(*)::int,
        'floor', count(*) FILTER (WHERE st_norm = ANY (floor_type_list))::int,
        'bodyshop', count(*) FILTER (WHERE st_norm = 'accident')::int,
        'others', count(*) FILTER (WHERE st_norm NOT IN ('accident', 'rusting') AND st_norm <> ALL (floor_type_list) AND btrim(coalesce(service_type, '')) <> '')::int,
        'null', count(*) FILTER (WHERE btrim(coalesce(service_type, '')) = '')::int
      ) AS payload
      FROM flagged f
      WHERE f.ok_search AND f.ok_advisor AND f.ok_branch AND f.ok_fuel
    ),
    location_base AS (
      SELECT f.branch, f.fuel_label FROM flagged f
      WHERE f.ok_search AND f.ok_category AND f.ok_fuel AND f.ok_advisor
    ),
    location_meta AS (
      SELECT
        coalesce((SELECT count(*)::int FROM location_base), 0) AS location_total,
        coalesce((SELECT jsonb_agg(branch ORDER BY branch) FROM (SELECT DISTINCT branch FROM location_base WHERE branch IS NOT NULL AND btrim(branch) <> '') b), '[]'::jsonb) AS branches,
        coalesce((SELECT jsonb_agg(fuel ORDER BY fuel) FROM (SELECT DISTINCT fuel_label AS fuel FROM location_base) f), '[]'::jsonb) AS fuel_types
    ),
    advisor_rows AS (
      SELECT
        CASE WHEN btrim(coalesce(sa_employee_code, '')) <> '' THEN 'code:' || upper(btrim(sa_employee_code))
             WHEN btrim(coalesce(sa_display_name, sa_name, '')) <> '' THEN 'name:' || lower(btrim(coalesce(sa_display_name, sa_name, '')))
             ELSE 'unknown' END AS advisor_key,
        CASE WHEN btrim(coalesce(sa_display_name, sa_name, '')) <> '' AND btrim(coalesce(sa_employee_code, '')) <> ''
               THEN btrim(coalesce(sa_display_name, sa_name, '')) || ' (' || upper(btrim(sa_employee_code)) || ')'
             WHEN btrim(coalesce(sa_display_name, sa_name, '')) <> '' THEN btrim(coalesce(sa_display_name, sa_name, ''))
             WHEN btrim(coalesce(sa_employee_code, '')) <> '' THEN upper(btrim(sa_employee_code))
             ELSE 'Unknown advisor' END AS advisor_label,
        count(*)::int AS cnt
      FROM flagged f
      WHERE f.ok_search AND f.ok_category AND f.ok_branch AND f.ok_fuel
      GROUP BY 1, 2
    ),
    advisor_meta AS (
      SELECT coalesce(jsonb_agg(jsonb_build_object('key', advisor_key, 'label', advisor_label, 'count', cnt) ORDER BY advisor_label), '[]'::jsonb) AS advisors
      FROM advisor_rows
    )
    SELECT jsonb_build_object(
      'total', k.total, 'job_card_pending', k.job_card_pending, 'sr_type_pending', k.sr_type_pending,
      'estimate_pending', k.estimate_pending, 'invoice_pending', k.invoice_pending, 'no_technician', k.no_technician,
      'hold', k.hold, 'in_process', k.in_process, 'completed', k.completed,
      'category_counts', coalesce(c.payload, jsonb_build_object('all', 0, 'floor', 0, 'bodyshop', 0, 'others', 0, 'null', 0)),
      'branches', coalesce(l.branches, '[]'::jsonb), 'location_total', coalesce(l.location_total, 0),
      'fuel_types', coalesce(l.fuel_types, '[]'::jsonb), 'advisors', coalesce(a.advisors, '[]'::jsonb)
    )
    FROM kpi_counts k
    CROSS JOIN category_counts c
    CROSS JOIN location_meta l
    CROSS JOIN advisor_meta a
    );
  END IF;

  -- Admin or CRM/SM/GM/reception/floor broad scope.
  RETURN (
  WITH floor_types AS (
    SELECT ARRAY[
      'running repairs', 'first free service', 'second free service', 'third free service',
      'paid service', 'updation', 'e breakdown', 'campaign'
    ]::text[] AS vals
  ),
  scoped AS MATERIALIZED (
    SELECT
      r.id, r.jc_number, r.service_type, r.estimate_storage_path, r.invoice_done_at,
      r.branch, r.sa_employee_code, r.sa_display_name, r.sa_name,
      r.reg_number, r.model, r.owner_name, r.owner_phone, r.source, r.created_by,
      lower(trim(regexp_replace(coalesce(r.service_type, ''), '\s+', ' ', 'g'))) AS st_norm,
      coalesce(nullif(btrim(em.fuel_type), ''), nullif(btrim(r.portal), ''), 'Unknown') AS fuel_label
    FROM public.service_reception_entries r
    LEFT JOIN public.employee_master em
      ON upper(btrim(em.employee_code)) = upper(btrim(r.sa_employee_code))
    WHERE r.created_at >= p_created_from
      AND r.created_at <= p_created_to
      AND (
        v_is_admin
        OR public.service_reception_entry_in_summary_scope(r.dealer_code, r.sa_employee_code, r.service_type)
      )
  ),
  flagged AS MATERIALIZED (
    SELECT s.*, ft.vals AS floor_type_list,
      (p_search IS NULL OR btrim(p_search) = '' OR coalesce(s.reg_number, '') ILIKE '%' || p_search || '%' OR coalesce(s.model, '') ILIKE '%' || p_search || '%' OR coalesce(s.jc_number, '') ILIKE '%' || p_search || '%' OR coalesce(s.owner_name, '') ILIKE '%' || p_search || '%' OR coalesce(s.owner_phone, '') ILIKE '%' || p_search || '%' OR coalesce(s.sa_name, '') ILIKE '%' || p_search || '%' OR coalesce(s.sa_display_name, '') ILIKE '%' || p_search || '%' OR coalesce(s.source, '') ILIKE '%' || p_search || '%' OR coalesce(s.created_by, '') ILIKE '%' || p_search || '%') AS ok_search,
      (p_advisor_key IS NULL OR btrim(p_advisor_key) = '' OR (p_advisor_key LIKE 'code:%' AND upper(btrim(s.sa_employee_code)) = upper(btrim(substring(p_advisor_key from 6)))) OR (p_advisor_key LIKE 'name:%' AND lower(btrim(coalesce(s.sa_display_name, s.sa_name, ''))) = lower(btrim(substring(p_advisor_key from 6))))) AS ok_advisor,
      (p_category IS NULL OR btrim(p_category) = '' OR (p_category = 'floor' AND s.st_norm = ANY (ft.vals)) OR (p_category = 'bodyshop' AND s.st_norm = 'accident') OR (p_category = 'others' AND btrim(coalesce(s.service_type, '')) <> '' AND s.st_norm NOT IN ('accident', 'rusting') AND s.st_norm <> ALL (ft.vals)) OR (p_category = 'null' AND btrim(coalesce(s.service_type, '')) = '')) AS ok_category,
      (p_branch IS NULL OR btrim(p_branch) = '' OR s.branch = p_branch) AS ok_branch,
      (p_fuel_type IS NULL OR btrim(p_fuel_type) = '' OR s.fuel_label = p_fuel_type) AS ok_fuel
    FROM scoped s CROSS JOIN floor_types ft
  ),
  kpi_base AS MATERIALIZED (
    SELECT * FROM flagged f WHERE f.ok_search AND f.ok_advisor AND f.ok_category AND f.ok_branch AND f.ok_fuel
  ),
  jc_keys AS (
    SELECT DISTINCT upper(btrim(b.jc_number)) AS jc FROM kpi_base b WHERE btrim(coalesce(b.jc_number, '')) <> ''
  ),
  assign AS MATERIALIZED (
    SELECT upper(btrim(t.job_card_number)) AS jc,
      bool_or(lower(btrim(coalesce(t.work_status, ''))) = 'completed') AS is_completed,
      bool_or(lower(btrim(coalesce(t.work_status, ''))) = 'hold') AS is_hold,
      bool_or(lower(btrim(coalesce(t.work_status, ''))) = 'work_inprocess') AS is_in_process
    FROM public.technician_assignments t
    WHERE upper(btrim(t.job_card_number)) IN (SELECT jc FROM jc_keys)
    GROUP BY 1
  ),
  enriched AS MATERIALIZED (
    SELECT b.*,
      coalesce(a.is_completed, false) AS work_completed, coalesce(a.is_hold, false) AS work_hold,
      coalesce(a.is_in_process, false) AS work_in_process, coalesce(a.jc IS NOT NULL, false) AS has_assignment,
      (b.st_norm = ANY (b.floor_type_list)) AS is_floor, (b.st_norm = 'accident') AS is_bodyshop, (b.st_norm = 'rusting') AS is_rusting
    FROM kpi_base b LEFT JOIN assign a ON upper(btrim(coalesce(b.jc_number, ''))) = a.jc
  ),
  kpi_counts AS (
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE btrim(coalesce(jc_number, '')) = '')::int AS job_card_pending,
      count(*) FILTER (WHERE btrim(coalesce(service_type, '')) = '')::int AS sr_type_pending,
      count(*) FILTER (WHERE NOT is_bodyshop AND NOT is_rusting AND estimate_storage_path IS NULL)::int AS estimate_pending,
      count(*) FILTER (WHERE NOT is_bodyshop AND NOT is_rusting AND work_completed AND invoice_done_at IS NULL)::int AS invoice_pending,
      count(*) FILTER (WHERE is_floor AND (btrim(coalesce(jc_number, '')) = '' OR NOT has_assignment))::int AS no_technician,
      count(*) FILTER (WHERE work_hold)::int AS hold,
      count(*) FILTER (WHERE work_in_process)::int AS in_process,
      count(*) FILTER (WHERE work_completed AND invoice_done_at IS NOT NULL)::int AS completed
    FROM enriched
  ),
  category_counts AS (
    SELECT jsonb_build_object('all', count(*)::int, 'floor', count(*) FILTER (WHERE st_norm = ANY (floor_type_list))::int,
      'bodyshop', count(*) FILTER (WHERE st_norm = 'accident')::int,
      'others', count(*) FILTER (WHERE st_norm NOT IN ('accident', 'rusting') AND st_norm <> ALL (floor_type_list) AND btrim(coalesce(service_type, '')) <> '')::int,
      'null', count(*) FILTER (WHERE btrim(coalesce(service_type, '')) = '')::int) AS payload
    FROM flagged f WHERE f.ok_search AND f.ok_advisor AND f.ok_branch AND f.ok_fuel
  ),
  location_base AS (
    SELECT f.branch, f.fuel_label FROM flagged f WHERE f.ok_search AND f.ok_category AND f.ok_fuel AND f.ok_advisor
  ),
  location_meta AS (
    SELECT coalesce((SELECT count(*)::int FROM location_base), 0) AS location_total,
      coalesce((SELECT jsonb_agg(branch ORDER BY branch) FROM (SELECT DISTINCT branch FROM location_base WHERE branch IS NOT NULL AND btrim(branch) <> '') b), '[]'::jsonb) AS branches,
      coalesce((SELECT jsonb_agg(fuel ORDER BY fuel) FROM (SELECT DISTINCT fuel_label AS fuel FROM location_base) f), '[]'::jsonb) AS fuel_types
  ),
  advisor_rows AS (
    SELECT CASE WHEN btrim(coalesce(sa_employee_code, '')) <> '' THEN 'code:' || upper(btrim(sa_employee_code))
                WHEN btrim(coalesce(sa_display_name, sa_name, '')) <> '' THEN 'name:' || lower(btrim(coalesce(sa_display_name, sa_name, '')))
                ELSE 'unknown' END AS advisor_key,
      CASE WHEN btrim(coalesce(sa_display_name, sa_name, '')) <> '' AND btrim(coalesce(sa_employee_code, '')) <> ''
             THEN btrim(coalesce(sa_display_name, sa_name, '')) || ' (' || upper(btrim(sa_employee_code)) || ')'
           WHEN btrim(coalesce(sa_display_name, sa_name, '')) <> '' THEN btrim(coalesce(sa_display_name, sa_name, ''))
           WHEN btrim(coalesce(sa_employee_code, '')) <> '' THEN upper(btrim(sa_employee_code))
           ELSE 'Unknown advisor' END AS advisor_label,
      count(*)::int AS cnt
    FROM flagged f WHERE f.ok_search AND f.ok_category AND f.ok_branch AND f.ok_fuel GROUP BY 1, 2
  ),
  advisor_meta AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', advisor_key, 'label', advisor_label, 'count', cnt) ORDER BY advisor_label), '[]'::jsonb) AS advisors
    FROM advisor_rows
  )
  SELECT jsonb_build_object(
    'total', k.total, 'job_card_pending', k.job_card_pending, 'sr_type_pending', k.sr_type_pending,
    'estimate_pending', k.estimate_pending, 'invoice_pending', k.invoice_pending, 'no_technician', k.no_technician,
    'hold', k.hold, 'in_process', k.in_process, 'completed', k.completed,
    'category_counts', coalesce(c.payload, jsonb_build_object('all', 0, 'floor', 0, 'bodyshop', 0, 'others', 0, 'null', 0)),
    'branches', coalesce(l.branches, '[]'::jsonb), 'location_total', coalesce(l.location_total, 0),
    'fuel_types', coalesce(l.fuel_types, '[]'::jsonb), 'advisors', coalesce(a.advisors, '[]'::jsonb)
  )
  FROM kpi_counts k CROSS JOIN category_counts c CROSS JOIN location_meta l CROSS JOIN advisor_meta a
  );
END;
$$;

ALTER FUNCTION public.get_service_advisor_summary_counts(
  timestamptz, timestamptz, text, text, text, text, text
) SET statement_timeout TO '30s';

COMMENT ON FUNCTION public.get_service_advisor_summary_counts(
  timestamptz, timestamptz, text, text, text, text, text
) IS 'SA summary: advisors JOIN user_employee_links (fast); admin/CRM use scope_fn; 30s timeout.';

GRANT EXECUTE ON FUNCTION public.get_service_advisor_summary_counts(
  timestamptz, timestamptz, text, text, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_service_advisor_summary_counts(
  timestamptz, timestamptz, text, text, text, text, text
) TO service_role;
