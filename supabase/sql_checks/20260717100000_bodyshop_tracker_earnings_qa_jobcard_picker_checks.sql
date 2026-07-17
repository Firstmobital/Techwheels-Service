-- BODYSHOP-EARNINGS-001: read-only QA picker for /bodyshop-tracker income verification
-- Authority: supabase/backups/full_metadata.sql
-- Mirrors app logic in src/lib/bodyshopEarnings.ts + BodyshopTrackerPage.tsx
--
-- How to use:
-- 1) Run in Supabase SQL editor (read-only).
-- 2) Adjust the date window in params CTE if needed.
-- 3) Use scenario_tag + job_card_number to validate on /bodyshop-tracker.
-- 4) Compare expected_per_person_income with UI per-person row income.

-- ============================================================================
-- 0) Current role % settings (tracker base percentages)
-- ============================================================================
SELECT role, percentage, updated_at
FROM public.bodyshop_role_earning_settings
WHERE role IN (
  'DENTOR', 'DENTOR_HELPER', 'PAINTER', 'PAINTER_HELPER',
  'TECHNICIAN', 'RUBBING', 'EDP', 'FLOOR_INCHARGE', 'PARTS_INCHARGE'
)
ORDER BY role;

-- ============================================================================
-- 1) MASTER PICKER — closed Accident JCs with scenario tags
-- ============================================================================
WITH params AS (
  SELECT
    DATE '2026-07-01' AS from_date,
    DATE '2026-07-31' AS to_date,
    4::numeric AS solo_bonus_pct
),
settings AS (
  SELECT
    COALESCE(MAX(percentage) FILTER (WHERE role = 'DENTOR'), 5)         AS dentor_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'DENTOR_HELPER'), 3)  AS dentor_helper_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'PAINTER'), 5)        AS painter_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'PAINTER_HELPER'), 3) AS painter_helper_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'TECHNICIAN'), 4)     AS technician_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'RUBBING'), 2)      AS rubbing_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'EDP'), 2)           AS edp_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'FLOOR_INCHARGE'), 3) AS floor_incharge_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'PARTS_INCHARGE'), 2)  AS parts_incharge_pct
  FROM public.bodyshop_role_earning_settings
),
closed_accident AS (
  SELECT
    j.id,
    upper(btrim(j.job_card_number)) AS job_card_number,
    j.vehicle_registration_number,
    j.location,
    j.closed_date_time,
    COALESCE(j.dms_final_labour_amount, 0)::numeric AS dms_labour,
    COALESCE(j.final_labour_amount, 0)::numeric AS analytic_labour
  FROM public.job_card_closed_data j
  CROSS JOIN params p
  WHERE upper(btrim(COALESCE(j.sr_type, ''))) = 'ACCIDENT'
    AND j.closed_date_time IS NOT NULL
    AND (j.closed_date_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p.from_date AND p.to_date
    AND COALESCE(j.dms_final_labour_amount, 0) > 0
),
active_assignments AS (
  SELECT ba.*
  FROM public.bodyshop_assignments ba
  INNER JOIN closed_accident c
    ON upper(btrim(ba.job_card_number)) = c.job_card_number
  WHERE ba.is_active = true
),
support_active AS (
  SELECT
    upper(btrim(s.job_card_number)) AS job_card_number,
    upper(btrim(s.support_role)) AS support_role,
    s.employee_code,
    s.employee_name
  FROM public.bodyshop_floor_support_assignments s
  INNER JOIN closed_accident c
    ON upper(btrim(s.job_card_number)) = c.job_card_number
  WHERE s.is_active = true
),
support_counts AS (
  SELECT
    job_card_number,
    support_role,
    COUNT(*)::int AS support_count,
    string_agg(employee_name || ' (' || employee_code || ')', ', ' ORDER BY employee_name) AS support_people
  FROM support_active
  GROUP BY job_card_number, support_role
),
flags AS (
  SELECT
    c.*,
    ba.id AS assignment_id,

    -- real-primary flags (matches isRealPrimaryAssignment)
    (
      btrim(COALESCE(ba.dentor_employee_code, '')) <> ''
      AND upper(btrim(ba.dentor_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.dentor_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.dentor_work_status, ''))) <> 'not_required'
    ) AS dentor_real,
    (
      btrim(COALESCE(ba.dentor_helper_employee_code, '')) <> ''
      AND upper(btrim(ba.dentor_helper_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.dentor_helper_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.dentor_helper_work_status, ''))) <> 'not_required'
    ) AS dentor_helper_real,
    (
      btrim(COALESCE(ba.painter_employee_code, '')) <> ''
      AND upper(btrim(ba.painter_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.painter_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.painter_work_status, ''))) <> 'not_required'
    ) AS painter_real,
    (
      btrim(COALESCE(ba.painter_helper_employee_code, '')) <> ''
      AND upper(btrim(ba.painter_helper_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.painter_helper_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.painter_helper_work_status, ''))) <> 'not_required'
    ) AS painter_helper_real,
    (
      btrim(COALESCE(ba.technician_employee_code, '')) <> ''
      AND upper(btrim(ba.technician_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.technician_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.technician_work_status, ''))) <> 'not_required'
    ) AS technician_real,

    COALESCE(sd.support_count, 0) AS dentor_support_count,
    COALESCE(sh.support_count, 0) AS dentor_helper_support_count,
    COALESCE(sp.support_count, 0) AS painter_support_count,
    COALESCE(sph.support_count, 0) AS painter_helper_support_count,
    COALESCE(st.support_count, 0) AS technician_support_count,

    sd.support_people AS dentor_support_people,
    sh.support_people AS dentor_helper_support_people,
    sp.support_people AS painter_support_people,
    sph.support_people AS painter_helper_support_people,
    st.support_people AS technician_support_people,

    ba.dentor_employee_name,
    ba.dentor_helper_employee_name,
    ba.painter_employee_name,
    ba.painter_helper_employee_name,
    ba.technician_employee_name
  FROM closed_accident c
  LEFT JOIN active_assignments ba
    ON ba.job_card_number = c.job_card_number
  LEFT JOIN support_counts sd
    ON sd.job_card_number = c.job_card_number AND sd.support_role = 'DENTOR'
  LEFT JOIN support_counts sh
    ON sh.job_card_number = c.job_card_number AND sh.support_role = 'DENTOR_HELPER'
  LEFT JOIN support_counts sp
    ON sp.job_card_number = c.job_card_number AND sp.support_role = 'PAINTER'
  LEFT JOIN support_counts sph
    ON sph.job_card_number = c.job_card_number AND sph.support_role = 'PAINTER_HELPER'
  LEFT JOIN support_counts st
    ON st.job_card_number = c.job_card_number AND st.support_role = 'TECHNICIAN'
),
scenario AS (
  SELECT
    f.*,
    s.dentor_pct,
    s.dentor_helper_pct,
    s.painter_pct,
    s.painter_helper_pct,
    s.technician_pct,
    p.solo_bonus_pct,

    CASE
      WHEN f.dentor_real AND NOT f.dentor_helper_real AND f.dentor_support_count = 0
        THEN 'D1_DENTOR_SOLO_PLUS4'
      WHEN f.dentor_real AND NOT f.dentor_helper_real AND f.dentor_support_count = 1
        THEN 'D2_DENTOR_PLUS4_SPLIT_2'
      WHEN f.dentor_real AND NOT f.dentor_helper_real AND f.dentor_support_count >= 2
        THEN 'D3_DENTOR_PLUS4_SPLIT_3PLUS'
      WHEN f.dentor_real AND f.dentor_helper_real
        THEN 'D4_DENTOR_AND_HELPER_BASE'
      WHEN f.dentor_helper_real AND NOT f.dentor_real
        THEN 'D5_HELPER_SOLO_PLUS4'
      WHEN f.painter_real AND NOT f.painter_helper_real AND f.painter_support_count = 0
        THEN 'P1_PAINTER_SOLO_PLUS4'
      WHEN f.painter_real AND NOT f.painter_helper_real AND f.painter_support_count >= 1
        THEN 'P2_PAINTER_PLUS4_WITH_SUPPORT'
      WHEN f.painter_real AND f.painter_helper_real
        THEN 'P3_PAINTER_AND_HELPER_BASE'
      WHEN f.painter_helper_real AND NOT f.painter_real
        THEN 'P4_PAINTER_HELPER_SOLO_PLUS4'
      WHEN f.technician_real AND f.technician_support_count >= 1
        THEN 'T1_TECHNICIAN_SPLIT_NO_BONUS'
      ELSE 'OTHER_OR_PARTIAL'
    END AS scenario_tag
  FROM flags f
  CROSS JOIN settings s
  CROSS JOIN params p
)
SELECT
  scenario_tag,
  job_card_number,
  vehicle_registration_number,
  location,
  closed_date_time,
  dms_labour,
  round((dms_labour / 1.18)::numeric, 2) AS net_labour_ex_gst,

  -- Dentor lane expectation
  dentor_real,
  dentor_helper_real,
  dentor_support_count,
  dentor_support_people,
  dentor_employee_name,
  CASE
    WHEN dentor_real AND NOT dentor_helper_real THEN dentor_pct + solo_bonus_pct
    WHEN dentor_real THEN dentor_pct
    ELSE NULL
  END AS dentor_effective_pct,
  CASE
    WHEN dentor_real THEN GREATEST(1, 1 + dentor_support_count)
    ELSE NULL
  END AS dentor_split_count,
  CASE
    WHEN dentor_real THEN round(
      ((dms_labour / 1.18) * (
        CASE WHEN NOT dentor_helper_real THEN dentor_pct + solo_bonus_pct ELSE dentor_pct END
      ) / 100) / GREATEST(1, 1 + dentor_support_count),
      2
    )
    ELSE NULL
  END AS dentor_expected_per_person_income,

  -- Dentor Helper lane expectation
  dentor_helper_employee_name,
  CASE
    WHEN dentor_helper_real AND NOT dentor_real THEN dentor_helper_pct + solo_bonus_pct
    WHEN dentor_helper_real THEN dentor_helper_pct
    ELSE NULL
  END AS dentor_helper_effective_pct,
  CASE
    WHEN dentor_helper_real THEN GREATEST(1, 1 + dentor_helper_support_count)
    ELSE NULL
  END AS dentor_helper_split_count,
  CASE
    WHEN dentor_helper_real THEN round(
      ((dms_labour / 1.18) * (
        CASE WHEN NOT dentor_real THEN dentor_helper_pct + solo_bonus_pct ELSE dentor_helper_pct END
      ) / 100) / GREATEST(1, 1 + dentor_helper_support_count),
      2
    )
    ELSE NULL
  END AS dentor_helper_expected_per_person_income,

  -- Painter lane expectation
  painter_real,
  painter_helper_real,
  painter_support_count,
  painter_employee_name,
  CASE
    WHEN painter_real AND NOT painter_helper_real THEN painter_pct + solo_bonus_pct
    WHEN painter_real THEN painter_pct
    ELSE NULL
  END AS painter_effective_pct,
  CASE
    WHEN painter_real THEN GREATEST(1, 1 + painter_support_count)
    ELSE NULL
  END AS painter_split_count,
  CASE
    WHEN painter_real THEN round(
      ((dms_labour / 1.18) * (
        CASE WHEN NOT painter_helper_real THEN painter_pct + solo_bonus_pct ELSE painter_pct END
      ) / 100) / GREATEST(1, 1 + painter_support_count),
      2
    )
    ELSE NULL
  END AS painter_expected_per_person_income,

  assignment_id
FROM scenario
WHERE assignment_id IS NOT NULL
ORDER BY
  CASE scenario_tag
    WHEN 'D1_DENTOR_SOLO_PLUS4' THEN 1
    WHEN 'D2_DENTOR_PLUS4_SPLIT_2' THEN 2
    WHEN 'D3_DENTOR_PLUS4_SPLIT_3PLUS' THEN 3
    WHEN 'D4_DENTOR_AND_HELPER_BASE' THEN 4
    WHEN 'D5_HELPER_SOLO_PLUS4' THEN 5
    WHEN 'P1_PAINTER_SOLO_PLUS4' THEN 6
    WHEN 'P2_PAINTER_PLUS4_WITH_SUPPORT' THEN 7
    WHEN 'P3_PAINTER_AND_HELPER_BASE' THEN 8
    WHEN 'P4_PAINTER_HELPER_SOLO_PLUS4' THEN 9
    WHEN 'T1_TECHNICIAN_SPLIT_NO_BONUS' THEN 10
    ELSE 99
  END,
  closed_date_time DESC;

-- ============================================================================
-- 2) SCENARIO COUNTS — quick coverage check in date window
-- ============================================================================
WITH params AS (
  SELECT DATE '2026-07-01' AS from_date, DATE '2026-07-31' AS to_date
),
closed_accident AS (
  SELECT upper(btrim(j.job_card_number)) AS job_card_number
  FROM public.job_card_closed_data j
  CROSS JOIN params p
  WHERE upper(btrim(COALESCE(j.sr_type, ''))) = 'ACCIDENT'
    AND j.closed_date_time IS NOT NULL
    AND (j.closed_date_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p.from_date AND p.to_date
    AND COALESCE(j.dms_final_labour_amount, 0) > 0
),
active_assignments AS (
  SELECT ba.*
  FROM public.bodyshop_assignments ba
  INNER JOIN closed_accident c ON upper(btrim(ba.job_card_number)) = c.job_card_number
  WHERE ba.is_active = true
),
support_counts AS (
  SELECT upper(btrim(s.job_card_number)) AS job_card_number, upper(btrim(s.support_role)) AS support_role, COUNT(*) AS cnt
  FROM public.bodyshop_floor_support_assignments s
  INNER JOIN closed_accident c ON upper(btrim(s.job_card_number)) = c.job_card_number
  WHERE s.is_active = true
  GROUP BY 1, 2
),
f AS (
  SELECT
    upper(btrim(ba.job_card_number)) AS job_card_number,
    (
      btrim(COALESCE(ba.dentor_employee_code, '')) <> ''
      AND upper(btrim(ba.dentor_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.dentor_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.dentor_work_status, ''))) <> 'not_required'
    ) AS dentor_real,
    (
      btrim(COALESCE(ba.dentor_helper_employee_code, '')) <> ''
      AND upper(btrim(ba.dentor_helper_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.dentor_helper_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.dentor_helper_work_status, ''))) <> 'not_required'
    ) AS dentor_helper_real,
    COALESCE((SELECT cnt FROM support_counts sc WHERE sc.job_card_number = upper(btrim(ba.job_card_number)) AND sc.support_role = 'DENTOR'), 0) AS dentor_support_count
  FROM active_assignments ba
)
SELECT
  COUNT(*) FILTER (WHERE dentor_real AND NOT dentor_helper_real AND dentor_support_count = 0) AS d1_dentor_solo_plus4,
  COUNT(*) FILTER (WHERE dentor_real AND NOT dentor_helper_real AND dentor_support_count = 1) AS d2_dentor_plus4_split2,
  COUNT(*) FILTER (WHERE dentor_real AND NOT dentor_helper_real AND dentor_support_count >= 2) AS d3_dentor_plus4_split3plus,
  COUNT(*) FILTER (WHERE dentor_real AND dentor_helper_real) AS d4_dentor_and_helper_base,
  COUNT(*) FILTER (WHERE dentor_helper_real AND NOT dentor_real) AS d5_helper_solo_plus4
FROM f;

-- ============================================================================
-- 3) PARTICIPANT ROWS — who should appear on each tracker role tab
-- ============================================================================
WITH params AS (
  SELECT DATE '2026-07-01' AS from_date, DATE '2026-07-31' AS to_date
),
closed_accident AS (
  SELECT
    upper(btrim(j.job_card_number)) AS job_card_number,
    COALESCE(j.dms_final_labour_amount, 0)::numeric AS dms_labour,
    j.closed_date_time
  FROM public.job_card_closed_data j
  CROSS JOIN params p
  WHERE upper(btrim(COALESCE(j.sr_type, ''))) = 'ACCIDENT'
    AND j.closed_date_time IS NOT NULL
    AND (j.closed_date_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p.from_date AND p.to_date
    AND COALESCE(j.dms_final_labour_amount, 0) > 0
),
active_assignments AS (
  SELECT ba.*
  FROM public.bodyshop_assignments ba
  INNER JOIN closed_accident c ON upper(btrim(ba.job_card_number)) = c.job_card_number
  WHERE ba.is_active = true
),
settings AS (
  SELECT
    COALESCE(MAX(percentage) FILTER (WHERE role = 'DENTOR'), 5) AS dentor_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'DENTOR_HELPER'), 3) AS dentor_helper_pct
  FROM public.bodyshop_role_earning_settings
),
dentor_lane AS (
  SELECT
    c.job_card_number,
    'DENTOR'::text AS role_tab,
    'PRIMARY'::text AS assignment_type,
    ba.dentor_employee_code AS employee_code,
    ba.dentor_employee_name AS employee_name,
    c.dms_labour,
    s.dentor_pct AS base_pct,
    CASE
      WHEN NOT (
        btrim(COALESCE(ba.dentor_helper_employee_code, '')) <> ''
        AND upper(btrim(ba.dentor_helper_employee_code)) <> 'NOT_REQUIRED'
        AND lower(btrim(COALESCE(ba.dentor_helper_employee_name, ''))) <> 'not required'
        AND lower(btrim(COALESCE(ba.dentor_helper_work_status, ''))) <> 'not_required'
      ) THEN s.dentor_pct + 4
      ELSE s.dentor_pct
    END AS effective_pct,
    1 + COALESCE((
      SELECT COUNT(*)::int
      FROM public.bodyshop_floor_support_assignments sup
      WHERE sup.is_active = true
        AND upper(btrim(sup.job_card_number)) = c.job_card_number
        AND upper(btrim(sup.support_role)) = 'DENTOR'
    ), 0) AS participant_count
  FROM closed_accident c
  INNER JOIN active_assignments ba ON upper(btrim(ba.job_card_number)) = c.job_card_number
  CROSS JOIN settings s
  WHERE
    btrim(COALESCE(ba.dentor_employee_code, '')) <> ''
    AND upper(btrim(ba.dentor_employee_code)) <> 'NOT_REQUIRED'
    AND lower(btrim(COALESCE(ba.dentor_employee_name, ''))) <> 'not required'
    AND lower(btrim(COALESCE(ba.dentor_work_status, ''))) <> 'not_required'

  UNION ALL

  SELECT
    c.job_card_number,
    'DENTOR',
    'SUPPORT',
    sup.employee_code,
    sup.employee_name,
    c.dms_labour,
    s.dentor_pct,
    CASE
      WHEN NOT (
        btrim(COALESCE(ba.dentor_helper_employee_code, '')) <> ''
        AND upper(btrim(ba.dentor_helper_employee_code)) <> 'NOT_REQUIRED'
        AND lower(btrim(COALESCE(ba.dentor_helper_employee_name, ''))) <> 'not required'
        AND lower(btrim(COALESCE(ba.dentor_helper_work_status, ''))) <> 'not_required'
      ) THEN s.dentor_pct + 4
      ELSE s.dentor_pct
    END,
    1 + COALESCE((
      SELECT COUNT(*)::int
      FROM public.bodyshop_floor_support_assignments sup2
      WHERE sup2.is_active = true
        AND upper(btrim(sup2.job_card_number)) = c.job_card_number
        AND upper(btrim(sup2.support_role)) = 'DENTOR'
    ), 0)
  FROM closed_accident c
  INNER JOIN active_assignments ba ON upper(btrim(ba.job_card_number)) = c.job_card_number
  INNER JOIN public.bodyshop_floor_support_assignments sup
    ON sup.is_active = true
   AND upper(btrim(sup.job_card_number)) = c.job_card_number
   AND upper(btrim(sup.support_role)) = 'DENTOR'
  CROSS JOIN settings s
  WHERE
    btrim(COALESCE(ba.dentor_employee_code, '')) <> ''
    AND upper(btrim(ba.dentor_employee_code)) <> 'NOT_REQUIRED'
)
SELECT
  job_card_number,
  role_tab,
  assignment_type,
  employee_code,
  employee_name,
  base_pct,
  effective_pct,
  participant_count,
  round(((dms_labour / 1.18) * effective_pct / 100) / participant_count, 2) AS expected_income
FROM dentor_lane
ORDER BY job_card_number, assignment_type DESC, employee_name;

-- ============================================================================
-- 4) NEGATIVE CHECK — rows that must NOT earn in tracker
-- ============================================================================
SELECT
  upper(btrim(ba.job_card_number)) AS job_card_number,
  'DENTOR'::text AS role_tab,
  ba.dentor_employee_code,
  ba.dentor_employee_name,
  ba.dentor_work_status,
  'SHOULD_NOT_EARN_NOT_REQUIRED_OR_EMPTY'::text AS qa_flag
FROM public.bodyshop_assignments ba
WHERE ba.is_active = true
  AND (
    btrim(COALESCE(ba.dentor_employee_code, '')) = ''
    OR upper(btrim(ba.dentor_employee_code)) = 'NOT_REQUIRED'
    OR lower(btrim(COALESCE(ba.dentor_employee_name, ''))) = 'not required'
    OR lower(btrim(COALESCE(ba.dentor_work_status, ''))) = 'not_required'
  )
ORDER BY job_card_number
LIMIT 100;

-- ============================================================================
-- 5) SHORT PICKER — one runnable query for the main QA scenarios
--     (Run this block alone in Supabase SQL editor)
-- ============================================================================
WITH params AS (
  SELECT
    DATE '2026-07-01' AS from_date,
    DATE '2026-07-31' AS to_date,
    4::numeric AS solo_bonus_pct
),
settings AS (
  SELECT
    COALESCE(MAX(percentage) FILTER (WHERE role = 'DENTOR'), 5)         AS dentor_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'DENTOR_HELPER'), 3)  AS dentor_helper_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'PAINTER'), 5)        AS painter_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'PAINTER_HELPER'), 3) AS painter_helper_pct,
    COALESCE(MAX(percentage) FILTER (WHERE role = 'TECHNICIAN'), 4)     AS technician_pct
  FROM public.bodyshop_role_earning_settings
),
closed_accident AS (
  SELECT
    upper(btrim(j.job_card_number)) AS job_card_number,
    j.vehicle_registration_number,
    j.location,
    j.closed_date_time,
    COALESCE(j.dms_final_labour_amount, 0)::numeric AS dms_labour
  FROM public.job_card_closed_data j
  CROSS JOIN params p
  WHERE upper(btrim(COALESCE(j.sr_type, ''))) = 'ACCIDENT'
    AND j.closed_date_time IS NOT NULL
    AND (j.closed_date_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p.from_date AND p.to_date
    AND COALESCE(j.dms_final_labour_amount, 0) > 0
),
active_assignments AS (
  SELECT ba.*
  FROM public.bodyshop_assignments ba
  INNER JOIN closed_accident c
    ON upper(btrim(ba.job_card_number)) = c.job_card_number
  WHERE ba.is_active = true
),
support_counts AS (
  SELECT
    upper(btrim(s.job_card_number)) AS job_card_number,
    upper(btrim(s.support_role)) AS support_role,
    COUNT(*)::int AS support_count
  FROM public.bodyshop_floor_support_assignments s
  INNER JOIN closed_accident c
    ON upper(btrim(s.job_card_number)) = c.job_card_number
  WHERE s.is_active = true
  GROUP BY 1, 2
),
flags AS (
  SELECT
    c.job_card_number,
    c.vehicle_registration_number,
    c.location,
    c.closed_date_time,
    c.dms_labour,
    (
      btrim(COALESCE(ba.dentor_employee_code, '')) <> ''
      AND upper(btrim(ba.dentor_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.dentor_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.dentor_work_status, ''))) <> 'not_required'
    ) AS dentor_real,
    (
      btrim(COALESCE(ba.dentor_helper_employee_code, '')) <> ''
      AND upper(btrim(ba.dentor_helper_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.dentor_helper_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.dentor_helper_work_status, ''))) <> 'not_required'
    ) AS dentor_helper_real,
    (
      btrim(COALESCE(ba.painter_employee_code, '')) <> ''
      AND upper(btrim(ba.painter_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.painter_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.painter_work_status, ''))) <> 'not_required'
    ) AS painter_real,
    (
      btrim(COALESCE(ba.painter_helper_employee_code, '')) <> ''
      AND upper(btrim(ba.painter_helper_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.painter_helper_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.painter_helper_work_status, ''))) <> 'not_required'
    ) AS painter_helper_real,
    (
      btrim(COALESCE(ba.technician_employee_code, '')) <> ''
      AND upper(btrim(ba.technician_employee_code)) <> 'NOT_REQUIRED'
      AND lower(btrim(COALESCE(ba.technician_employee_name, ''))) <> 'not required'
      AND lower(btrim(COALESCE(ba.technician_work_status, ''))) <> 'not_required'
    ) AS technician_real,
    COALESCE(sd.support_count, 0) AS dentor_support_count,
    COALESCE(sp.support_count, 0) AS painter_support_count,
    COALESCE(st.support_count, 0) AS technician_support_count
  FROM closed_accident c
  INNER JOIN active_assignments ba
    ON upper(btrim(ba.job_card_number)) = c.job_card_number
  LEFT JOIN support_counts sd
    ON sd.job_card_number = c.job_card_number AND sd.support_role = 'DENTOR'
  LEFT JOIN support_counts sp
    ON sp.job_card_number = c.job_card_number AND sp.support_role = 'PAINTER'
  LEFT JOIN support_counts st
    ON st.job_card_number = c.job_card_number AND st.support_role = 'TECHNICIAN'
),
scenario AS (
  SELECT
    f.*,
    s.dentor_pct,
    s.dentor_helper_pct,
    s.painter_pct,
    s.technician_pct,
    p.solo_bonus_pct,
    CASE
      WHEN f.dentor_real AND NOT f.dentor_helper_real AND f.dentor_support_count = 0 THEN 'D1_DENTOR_SOLO_PLUS4'
      WHEN f.dentor_real AND NOT f.dentor_helper_real AND f.dentor_support_count = 1 THEN 'D2_DENTOR_PLUS4_SPLIT_2'
      WHEN f.dentor_real AND NOT f.dentor_helper_real AND f.dentor_support_count >= 2 THEN 'D3_DENTOR_PLUS4_SPLIT_3PLUS'
      WHEN f.dentor_real AND f.dentor_helper_real THEN 'D4_DENTOR_AND_HELPER_BASE'
      WHEN f.dentor_helper_real AND NOT f.dentor_real THEN 'D5_HELPER_SOLO_PLUS4'
      WHEN f.painter_real AND NOT f.painter_helper_real AND f.painter_support_count = 0 THEN 'P1_PAINTER_SOLO_PLUS4'
      WHEN f.painter_real AND NOT f.painter_helper_real AND f.painter_support_count >= 1 THEN 'P2_PAINTER_PLUS4_WITH_SUPPORT'
      WHEN f.painter_real AND f.painter_helper_real THEN 'P3_PAINTER_AND_HELPER_BASE'
      WHEN f.painter_helper_real AND NOT f.painter_real THEN 'P4_PAINTER_HELPER_SOLO_PLUS4'
      WHEN f.technician_real AND f.technician_support_count >= 1 THEN 'T1_TECHNICIAN_SPLIT_NO_BONUS'
      ELSE 'OTHER_OR_PARTIAL'
    END AS scenario_tag
  FROM flags f
  CROSS JOIN settings s
  CROSS JOIN params p
)
SELECT
  scenario_tag,
  job_card_number,
  vehicle_registration_number,
  location,
  closed_date_time,
  dms_labour,
  CASE
    WHEN dentor_real AND NOT dentor_helper_real THEN dentor_pct + solo_bonus_pct
    WHEN dentor_real THEN dentor_pct
    ELSE NULL
  END AS dentor_effective_pct,
  CASE WHEN dentor_real THEN GREATEST(1, 1 + dentor_support_count) ELSE NULL END AS dentor_split,
  CASE
    WHEN dentor_real THEN round(
      ((dms_labour / 1.18) * (CASE WHEN NOT dentor_helper_real THEN dentor_pct + solo_bonus_pct ELSE dentor_pct END) / 100)
      / GREATEST(1, 1 + dentor_support_count), 2)
    ELSE NULL
  END AS dentor_expected_income_per_person,
  CASE
    WHEN dentor_helper_real AND NOT dentor_real THEN dentor_helper_pct + solo_bonus_pct
    WHEN dentor_helper_real THEN dentor_helper_pct
    ELSE NULL
  END AS helper_effective_pct,
  CASE
    WHEN painter_real AND NOT painter_helper_real THEN painter_pct + solo_bonus_pct
    WHEN painter_real THEN painter_pct
    ELSE NULL
  END AS painter_effective_pct
FROM scenario
WHERE scenario_tag IN (
  'D1_DENTOR_SOLO_PLUS4',
  'D2_DENTOR_PLUS4_SPLIT_2',
  'D3_DENTOR_PLUS4_SPLIT_3PLUS',
  'D4_DENTOR_AND_HELPER_BASE',
  'D5_HELPER_SOLO_PLUS4',
  'P1_PAINTER_SOLO_PLUS4',
  'P2_PAINTER_PLUS4_WITH_SUPPORT',
  'P3_PAINTER_AND_HELPER_BASE',
  'P4_PAINTER_HELPER_SOLO_PLUS4',
  'T1_TECHNICIAN_SPLIT_NO_BONUS'
)
ORDER BY scenario_tag, closed_date_time DESC;
