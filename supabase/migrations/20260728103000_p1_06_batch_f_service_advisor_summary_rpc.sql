-- P1-06 Batch F: single-query Service Advisor summary tiles (replaces client slim-scan loop).
-- Apply: node scripts/apply-sql-files.mjs supabase/migrations/20260728103000_p1_06_batch_f_service_advisor_summary_rpc.sql

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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
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
      AND (p_branch IS NULL OR btrim(p_branch) = '' OR r.branch = p_branch)
      AND (
        p_fuel_type IS NULL
        OR btrim(p_fuel_type) = ''
        OR coalesce(
          nullif(btrim(em.fuel_type), ''),
          nullif(btrim(r.portal), ''),
          'Unknown'
        ) = p_fuel_type
      )
      AND (
        p_category IS NULL
        OR btrim(p_category) = ''
        OR (
          p_category = 'floor'
          AND lower(trim(regexp_replace(coalesce(r.service_type, ''), '\s+', ' ', 'g'))) = ANY (
            ARRAY[
              'running repairs', 'first free service', 'second free service', 'third free service',
              'paid service', 'updation', 'e breakdown', 'campaign'
            ]
          )
        )
        OR (p_category = 'bodyshop' AND lower(trim(coalesce(r.service_type, ''))) = 'accident')
        OR (
          p_category = 'others'
          AND btrim(coalesce(r.service_type, '')) <> ''
          AND lower(trim(r.service_type)) NOT IN ('accident', 'rusting')
          AND lower(trim(regexp_replace(coalesce(r.service_type, ''), '\s+', ' ', 'g'))) <> ALL (
            ARRAY[
              'running repairs', 'first free service', 'second free service', 'third free service',
              'paid service', 'updation', 'e breakdown', 'campaign'
            ]
          )
        )
        OR (p_category = 'null' AND btrim(coalesce(r.service_type, '')) = '')
      )
      AND (
        p_advisor_key IS NULL
        OR btrim(p_advisor_key) = ''
        OR (
          p_advisor_key LIKE 'code:%'
          AND upper(btrim(r.sa_employee_code)) = upper(btrim(substring(p_advisor_key from 6)))
        )
        OR (
          p_advisor_key LIKE 'name:%'
          AND lower(btrim(coalesce(r.sa_display_name, r.sa_name, ''))) = lower(btrim(substring(p_advisor_key from 6)))
        )
      )
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR (
          coalesce(r.reg_number, '') ILIKE '%' || p_search || '%'
          OR coalesce(r.model, '') ILIKE '%' || p_search || '%'
          OR coalesce(r.jc_number, '') ILIKE '%' || p_search || '%'
          OR coalesce(r.owner_name, '') ILIKE '%' || p_search || '%'
          OR coalesce(r.owner_phone, '') ILIKE '%' || p_search || '%'
          OR coalesce(r.sa_name, '') ILIKE '%' || p_search || '%'
          OR coalesce(r.sa_display_name, '') ILIKE '%' || p_search || '%'
          OR coalesce(r.source, '') ILIKE '%' || p_search || '%'
          OR coalesce(r.created_by, '') ILIKE '%' || p_search || '%'
        )
      )
  ),
  jc_keys AS (
    SELECT DISTINCT upper(btrim(jc_number)) AS jc
    FROM base
    WHERE btrim(coalesce(jc_number, '')) <> ''
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
      (b.st_norm = ANY (
        ARRAY[
          'running repairs', 'first free service', 'second free service', 'third free service',
          'paid service', 'updation', 'e breakdown', 'campaign'
        ]
      )) AS is_floor,
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
        'floor', count(*) FILTER (WHERE is_floor)::int,
        'bodyshop', count(*) FILTER (WHERE is_bodyshop)::int,
        'others', count(*) FILTER (
          WHERE NOT is_floor AND NOT is_bodyshop AND btrim(coalesce(service_type, '')) <> '' AND NOT is_rusting
        )::int,
        'null', count(*) FILTER (WHERE btrim(coalesce(service_type, '')) = '')::int
      )
      FROM (
        SELECT
          b.*,
          (b.st_norm = ANY (
            ARRAY[
              'running repairs', 'first free service', 'second free service', 'third free service',
              'paid service', 'updation', 'e breakdown', 'campaign'
            ]
          )) AS is_floor,
          (b.st_norm = 'accident') AS is_bodyshop,
          (b.st_norm = 'rusting') AS is_rusting
        FROM base b
      ) cat_base
    ),
    'branches', (
      SELECT coalesce(jsonb_agg(branch ORDER BY branch), '[]'::jsonb)
      FROM (SELECT DISTINCT branch FROM base WHERE branch IS NOT NULL AND btrim(branch) <> '') s
    ),
    'fuel_types', (
      SELECT coalesce(jsonb_agg(fuel ORDER BY fuel), '[]'::jsonb)
      FROM (
        SELECT DISTINCT fuel_label AS fuel
        FROM base
      ) s
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
        FROM base
        GROUP BY 1, 2
      ) advisor_rows
    )
  );
$$;

COMMENT ON FUNCTION public.get_service_advisor_summary_counts(
  timestamptz, timestamptz, text, text, text, text, text
) IS 'P1-06 Batch F: Service Advisor summary tile counts for a created_at window with optional filters. SECURITY INVOKER — RLS applies.';

GRANT EXECUTE ON FUNCTION public.get_service_advisor_summary_counts(
  timestamptz, timestamptz, text, text, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_service_advisor_summary_counts(
  timestamptz, timestamptz, text, text, text, text, text
) TO service_role;
