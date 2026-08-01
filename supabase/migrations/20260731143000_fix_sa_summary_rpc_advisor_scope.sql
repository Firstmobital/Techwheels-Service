-- Fix SA summary RPC advisor timeouts (PostgREST 500 / PostgreSQL 57014).
--
-- Root cause: get_service_advisor_summary_counts scanned the full date range and invoked
-- user_can_read_service_reception_entry() per row under SECURITY DEFINER.
--
-- Fix:
-- 1) Advisor fast path: INNER JOIN my_active_employee_codes() (index-friendly).
-- 2) Add has_module_modify('service_advisor') to the outer permission gate.
-- 3) Join technician_assignments only for JC numbers present in the filtered base.
--
-- Apply: node scripts/apply-sql-files.mjs supabase/migrations/20260731143000_fix_sa_summary_rpc_advisor_scope.sql

CREATE OR REPLACE FUNCTION public.my_active_employee_codes()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT uel.employee_code
  FROM public.user_employee_links uel
  WHERE uel.user_id = auth.uid()
    AND uel.is_active = true
    AND btrim(coalesce(uel.employee_code, '')) <> '';
$$;

COMMENT ON FUNCTION public.my_active_employee_codes() IS
  'Active employee codes for auth.uid(); used by SA summary RPC for index-friendly row scope.';

GRANT EXECUTE ON FUNCTION public.my_active_employee_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_active_employee_codes() TO service_role;

CREATE OR REPLACE FUNCTION public.service_reception_entry_in_summary_scope(
  p_dealer_code text,
  p_sa_employee_code text,
  p_service_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_admin()
    OR (
      public.has_module_view('reception'::text)
      AND public.dealer_code_in_scope(p_dealer_code)
    )
    OR (
      (
        public.has_module_view('service_advisor'::text)
        OR public.has_module_modify('service_advisor'::text)
      )
      AND p_sa_employee_code IS NOT NULL
      AND upper(btrim(p_sa_employee_code)) IN (
        SELECT upper(btrim(code))
        FROM public.my_active_employee_codes() AS code
      )
    )
    OR (
      public.has_module_view('service_advisor'::text)
      AND p_sa_employee_code IS NOT NULL
      AND (
        public.user_is_crm_for_dealer_sa(p_sa_employee_code)
        OR public.user_is_sm_gm_for_dealer_sa(p_sa_employee_code)
      )
    )
    OR (
      public.has_module_view('floor_incharge'::text)
      AND p_sa_employee_code IS NOT NULL
      AND public.user_has_service_floor_incharge_scope_for_sa_code(p_sa_employee_code)
    )
    OR (
      coalesce(p_service_type, ''::text) = 'Accident'::text
      AND p_sa_employee_code IS NOT NULL
      AND (
        public.has_module_view('bodyshop_floor'::text)
        OR public.has_module_modify('bodyshop_floor'::text)
      )
      AND public.user_has_bodyshop_floor_incharge_scope_for_sa_code(p_sa_employee_code)
    );
$$;

COMMENT ON FUNCTION public.service_reception_entry_in_summary_scope(text, text, text) IS
  'Scope gate for SA summary RPC (reception/floor/CRM paths). Advisors use the fast employee-code join instead.';

GRANT EXECUTE ON FUNCTION public.service_reception_entry_in_summary_scope(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.service_reception_entry_in_summary_scope(text, text, text) TO service_role;

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
  v_result jsonb;
  v_is_admin boolean;
  v_sa_only boolean;
  v_floor_types text[] := ARRAY[
    'running repairs', 'first free service', 'second free service', 'third free service',
    'paid service', 'updation', 'e breakdown', 'campaign'
  ];
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
  v_sa_only := NOT v_is_admin
    AND (public.has_module_view('service_advisor'::text) OR public.has_module_modify('service_advisor'::text))
    AND NOT public.has_module_view('reception'::text)
    AND NOT public.has_module_view('floor_incharge'::text)
    AND NOT public.has_module_view('bodyshop_floor'::text)
    AND NOT public.has_module_modify('bodyshop_floor'::text)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      JOIN public.employee_master em ON em.employee_code = uel.employee_code
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
        AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['crm'::text, 'sm'::text, 'gm'::text])
    );

  DROP TABLE IF EXISTS pg_temp.sa_summary_scope;

  IF v_sa_only THEN
    CREATE TEMP TABLE pg_temp.sa_summary_scope ON COMMIT DROP AS
    SELECT
      r.id,
      r.jc_number,
      r.service_type,
      r.estimate_storage_path,
      r.invoice_done_at,
      r.branch,
      r.portal,
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
    LEFT JOIN public.employee_master em
      ON upper(btrim(em.employee_code)) = upper(btrim(r.sa_employee_code))
    INNER JOIN (
      SELECT upper(btrim(code)) AS employee_code
      FROM public.my_active_employee_codes() AS code
    ) my_codes
      ON upper(btrim(r.sa_employee_code)) = my_codes.employee_code
    WHERE r.created_at >= p_created_from
      AND r.created_at <= p_created_to;
  ELSE
    CREATE TEMP TABLE pg_temp.sa_summary_scope ON COMMIT DROP AS
    SELECT
      r.id,
      r.jc_number,
      r.service_type,
      r.estimate_storage_path,
      r.invoice_done_at,
      r.branch,
      r.portal,
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
    LEFT JOIN public.employee_master em
      ON upper(btrim(em.employee_code)) = upper(btrim(r.sa_employee_code))
    WHERE r.created_at >= p_created_from
      AND r.created_at <= p_created_to
      AND public.service_reception_entry_in_summary_scope(
        r.dealer_code,
        r.sa_employee_code,
        r.service_type
      );
  END IF;

  CREATE INDEX sa_summary_scope_st_norm_idx ON pg_temp.sa_summary_scope (st_norm);

  WITH apply_common_filters AS (
    SELECT
      s.*,
      p_branch AS branch_filter,
      p_fuel_type AS fuel_filter,
      p_category AS category_filter,
      p_advisor_key AS advisor_filter,
      p_search AS search_filter
    FROM pg_temp.sa_summary_scope s
  ),
  matches_search AS (
    SELECT s.*
    FROM apply_common_filters s
    WHERE
      s.search_filter IS NULL
      OR btrim(s.search_filter) = ''
      OR (
        coalesce(s.reg_number, '') ILIKE '%' || s.search_filter || '%'
        OR coalesce(s.model, '') ILIKE '%' || s.search_filter || '%'
        OR coalesce(s.jc_number, '') ILIKE '%' || s.search_filter || '%'
        OR coalesce(s.owner_name, '') ILIKE '%' || s.search_filter || '%'
        OR coalesce(s.owner_phone, '') ILIKE '%' || s.search_filter || '%'
        OR coalesce(s.sa_name, '') ILIKE '%' || s.search_filter || '%'
        OR coalesce(s.sa_display_name, '') ILIKE '%' || s.search_filter || '%'
        OR coalesce(s.source, '') ILIKE '%' || s.search_filter || '%'
        OR coalesce(s.created_by, '') ILIKE '%' || s.search_filter || '%'
      )
  ),
  matches_advisor AS (
    SELECT s.*
    FROM matches_search s
    WHERE
      s.advisor_filter IS NULL
      OR btrim(s.advisor_filter) = ''
      OR (
        s.advisor_filter LIKE 'code:%'
        AND upper(btrim(s.sa_employee_code)) = upper(btrim(substring(s.advisor_filter from 6)))
      )
      OR (
        s.advisor_filter LIKE 'name:%'
        AND lower(btrim(coalesce(s.sa_display_name, s.sa_name, ''))) = lower(btrim(substring(s.advisor_filter from 6)))
      )
  ),
  matches_category AS (
    SELECT s.*
    FROM matches_advisor s
    WHERE
      s.category_filter IS NULL
      OR btrim(s.category_filter) = ''
      OR (
        s.category_filter = 'floor'
        AND s.st_norm = ANY (v_floor_types)
      )
      OR (s.category_filter = 'bodyshop' AND s.st_norm = 'accident')
      OR (
        s.category_filter = 'others'
        AND btrim(coalesce(s.service_type, '')) <> ''
        AND s.st_norm NOT IN ('accident', 'rusting')
        AND s.st_norm <> ALL (v_floor_types)
      )
      OR (s.category_filter = 'null' AND btrim(coalesce(s.service_type, '')) = '')
  ),
  filter_rows AS (
    SELECT s.*
    FROM matches_category s
    WHERE (s.branch_filter IS NULL OR btrim(s.branch_filter) = '' OR s.branch = s.branch_filter)
      AND (
        s.fuel_filter IS NULL
        OR btrim(s.fuel_filter) = ''
        OR s.fuel_label = s.fuel_filter
      )
  ),
  base AS (
    SELECT * FROM filter_rows
  ),
  base_for_category AS (
    SELECT s.*
    FROM matches_advisor s
    WHERE (s.branch_filter IS NULL OR btrim(s.branch_filter) = '' OR s.branch = s.branch_filter)
      AND (s.fuel_filter IS NULL OR btrim(s.fuel_filter) = '' OR s.fuel_label = s.fuel_filter)
  ),
  base_for_advisor AS (
    SELECT s.*
    FROM matches_category s
    WHERE (s.branch_filter IS NULL OR btrim(s.branch_filter) = '' OR s.branch = s.branch_filter)
      AND (s.fuel_filter IS NULL OR btrim(s.fuel_filter) = '' OR s.fuel_label = s.fuel_filter)
  ),
  base_for_location AS (
    SELECT s.*
    FROM matches_category s
    WHERE (s.fuel_filter IS NULL OR btrim(s.fuel_filter) = '' OR s.fuel_label = s.fuel_filter)
      AND (
        s.advisor_filter IS NULL
        OR btrim(s.advisor_filter) = ''
        OR (
          s.advisor_filter LIKE 'code:%'
          AND upper(btrim(s.sa_employee_code)) = upper(btrim(substring(s.advisor_filter from 6)))
        )
        OR (
          s.advisor_filter LIKE 'name:%'
          AND lower(btrim(coalesce(s.sa_display_name, s.sa_name, ''))) = lower(btrim(substring(s.advisor_filter from 6)))
        )
      )
  ),
  jc_keys AS (
    SELECT DISTINCT upper(btrim(b.jc_number)) AS jc
    FROM base b
    WHERE btrim(coalesce(b.jc_number, '')) <> ''
  ),
  assign AS (
    SELECT
      upper(btrim(t.job_card_number)) AS jc,
      bool_or(lower(btrim(coalesce(t.work_status, ''))) = 'completed') AS is_completed,
      bool_or(lower(btrim(coalesce(t.work_status, ''))) = 'hold') AS is_hold,
      bool_or(lower(btrim(coalesce(t.work_status, ''))) = 'work_inprocess') AS is_in_process,
      true AS has_assignment
    FROM public.technician_assignments t
    WHERE upper(btrim(t.job_card_number)) IN (SELECT jc FROM jc_keys)
    GROUP BY 1
  ),
  enriched AS (
    SELECT
      b.*,
      coalesce(a.is_completed, false) AS work_completed,
      coalesce(a.is_hold, false) AS work_hold,
      coalesce(a.is_in_process, false) AS work_in_process,
      coalesce(a.has_assignment, false) AS has_assignment,
      (b.st_norm = ANY (v_floor_types)) AS is_floor,
      (b.st_norm = 'accident') AS is_bodyshop,
      (b.st_norm = 'rusting') AS is_rusting
    FROM base b
    LEFT JOIN assign a ON upper(btrim(coalesce(b.jc_number, ''))) = a.jc
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM enriched),
    'job_card_pending', (SELECT count(*)::int FROM enriched WHERE btrim(coalesce(jc_number, '')) = ''),
    'sr_type_pending', (SELECT count(*)::int FROM enriched WHERE btrim(coalesce(service_type, '')) = ''),
    'estimate_pending', (
      SELECT count(*)::int FROM enriched
      WHERE NOT is_bodyshop AND NOT is_rusting AND estimate_storage_path IS NULL
    ),
    'invoice_pending', (
      SELECT count(*)::int FROM enriched
      WHERE NOT is_bodyshop AND NOT is_rusting AND work_completed AND invoice_done_at IS NULL
    ),
    'no_technician', (
      SELECT count(*)::int FROM enriched
      WHERE is_floor AND (btrim(coalesce(jc_number, '')) = '' OR NOT has_assignment)
    ),
    'hold', (SELECT count(*)::int FROM enriched WHERE work_hold),
    'in_process', (SELECT count(*)::int FROM enriched WHERE work_in_process),
    'completed', (
      SELECT count(*)::int FROM enriched
      WHERE work_completed AND invoice_done_at IS NOT NULL
    ),
    'category_counts', (
      SELECT jsonb_build_object(
        'all', count(*)::int,
        'floor', count(*) FILTER (WHERE st_norm = ANY (v_floor_types))::int,
        'bodyshop', count(*) FILTER (WHERE st_norm = 'accident')::int,
        'others', count(*) FILTER (
          WHERE st_norm NOT IN ('accident', 'rusting')
            AND st_norm <> ALL (v_floor_types)
            AND btrim(coalesce(service_type, '')) <> ''
        )::int,
        'null', count(*) FILTER (WHERE btrim(coalesce(service_type, '')) = '')::int
      )
      FROM base_for_category
    ),
    'branches', (
      SELECT coalesce(jsonb_agg(branch ORDER BY branch), '[]'::jsonb)
      FROM (
        SELECT DISTINCT branch
        FROM base_for_location
        WHERE branch IS NOT NULL AND btrim(branch) <> ''
      ) s
    ),
    'location_total', (SELECT count(*)::int FROM base_for_location),
    'fuel_types', (
      SELECT coalesce(jsonb_agg(fuel ORDER BY fuel), '[]'::jsonb)
      FROM (SELECT DISTINCT fuel_label AS fuel FROM base_for_location) s
    ),
    'advisors', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('key', advisor_key, 'label', advisor_label, 'count', cnt)
          ORDER BY advisor_label
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT
          CASE
            WHEN btrim(coalesce(sa_employee_code, '')) <> '' THEN 'code:' || upper(btrim(sa_employee_code))
            WHEN btrim(coalesce(sa_display_name, sa_name, '')) <> ''
              THEN 'name:' || lower(btrim(coalesce(sa_display_name, sa_name, '')))
            ELSE 'unknown'
          END AS advisor_key,
          CASE
            WHEN btrim(coalesce(sa_display_name, sa_name, '')) <> ''
              AND btrim(coalesce(sa_employee_code, '')) <> ''
              THEN btrim(coalesce(sa_display_name, sa_name, '')) || ' (' || upper(btrim(sa_employee_code)) || ')'
            WHEN btrim(coalesce(sa_display_name, sa_name, '')) <> ''
              THEN btrim(coalesce(sa_display_name, sa_name, ''))
            WHEN btrim(coalesce(sa_employee_code, '')) <> ''
              THEN upper(btrim(sa_employee_code))
            ELSE 'Unknown advisor'
          END AS advisor_label,
          count(*)::int AS cnt
        FROM base_for_advisor
        GROUP BY 1, 2
      ) advisor_rows
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_service_advisor_summary_counts(
  timestamptz, timestamptz, text, text, text, text, text
) IS 'P1-06 Batch F: SA summary counts. Advisor fast path via employee-code join; JC-limited assignment join.';

GRANT EXECUTE ON FUNCTION public.get_service_advisor_summary_counts(
  timestamptz, timestamptz, text, text, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_service_advisor_summary_counts(
  timestamptz, timestamptz, text, text, text, text, text
) TO service_role;
