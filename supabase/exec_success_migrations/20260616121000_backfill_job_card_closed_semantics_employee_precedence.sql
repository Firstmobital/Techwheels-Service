-- ============================================================
-- Backfill job_card_closed_data semantic columns safely
-- Created: 2026-06-16
--
-- Precedence:
-- 1) employee_master (employee_code -> location + fuel_type)
-- 2) dealer-code fallback from employee_code
--    3000840 -> Sitapura/PV
--    500A840 -> Sitapura/EV
--    3001440 -> Ajmer Road/PV
-- 3) safety fallback from existing row.branch (when possible)
--
-- Safety characteristics:
-- - Idempotent
-- - Updates only rows with missing/invalid semantic fields
-- - Preserves already-populated valid values
-- ============================================================

BEGIN;

WITH resolved AS (
  SELECT
    j.id,
    NULLIF(btrim(j.location), '') AS current_location,
    CASE
      WHEN upper(btrim(coalesce(j.portal, ''))) IN ('EV', 'PV') THEN upper(btrim(j.portal))
      ELSE NULL
    END AS current_portal,
    NULLIF(btrim(j.branch_label), '') AS current_branch_label,

    NULLIF(btrim(em_best.location), '') AS em_location,
    CASE
      WHEN upper(btrim(coalesce(em_best.fuel_type, ''))) = 'EV' THEN 'EV'
      WHEN upper(btrim(coalesce(em_best.fuel_type, ''))) IN ('PV', 'ICE') THEN 'PV'
      ELSE NULL
    END AS em_portal,

    CASE
      WHEN upper(btrim(coalesce(split_part(j.employee_code, '_', 1), ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(split_part(j.employee_code, '_', 1)))
      WHEN upper(btrim(coalesce(split_part(j.employee_code, '_', 2), ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(split_part(j.employee_code, '_', 2)))
      WHEN upper(btrim(coalesce(j.employee_code, ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(j.employee_code))
      ELSE NULL
    END AS mapped_dealer_code,

    CASE
      WHEN lower(btrim(coalesce(j.branch, ''))) LIKE '%ajmer%' THEN 'Ajmer Road'
      WHEN lower(btrim(coalesce(j.branch, ''))) LIKE '%sitapura%' THEN 'Sitapura'
      ELSE NULL
    END AS branch_location_fallback,

    CASE
      WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% EV' THEN 'EV'
      WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% PV' THEN 'PV'
      ELSE NULL
    END AS branch_portal_fallback

  FROM public.job_card_closed_data j
  LEFT JOIN LATERAL (
    SELECT em.location, em.fuel_type
    FROM public.employee_master em
    WHERE upper(btrim(coalesce(em.employee_code, ''))) IN (
      upper(btrim(coalesce(j.employee_code, ''))),
      upper(btrim(coalesce(split_part(j.employee_code, '_', 1), ''))),
      upper(btrim(coalesce(split_part(j.employee_code, '_', 2), '')))
    )
    ORDER BY
      CASE
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(j.employee_code, ''))) THEN 1
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(split_part(j.employee_code, '_', 1), ''))) THEN 2
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(split_part(j.employee_code, '_', 2), ''))) THEN 3
        ELSE 9
      END
    LIMIT 1
  ) em_best ON true
)
UPDATE public.job_card_closed_data j
SET
  location = COALESCE(
    NULLIF(btrim(j.location), ''),
    resolved.em_location,
    CASE resolved.mapped_dealer_code
      WHEN '3000840' THEN 'Sitapura'
      WHEN '500A840' THEN 'Sitapura'
      WHEN '3001440' THEN 'Ajmer Road'
      ELSE NULL
    END,
    resolved.branch_location_fallback
  ),

  portal = COALESCE(
    CASE
      WHEN upper(btrim(coalesce(j.portal, ''))) IN ('EV', 'PV') THEN upper(btrim(j.portal))
      ELSE NULL
    END,
    resolved.em_portal,
    CASE resolved.mapped_dealer_code
      WHEN '500A840' THEN 'EV'
      WHEN '3000840' THEN 'PV'
      WHEN '3001440' THEN 'PV'
      ELSE NULL
    END,
    resolved.branch_portal_fallback
  ),

  branch_label = COALESCE(
    NULLIF(btrim(j.branch_label), ''),
    resolved.em_location,
    CASE resolved.mapped_dealer_code
      WHEN '3000840' THEN 'Sitapura'
      WHEN '500A840' THEN 'Sitapura'
      WHEN '3001440' THEN 'Ajmer Road'
      ELSE NULL
    END,
    resolved.branch_location_fallback
  )
FROM resolved
WHERE j.id = resolved.id
  AND (
    NULLIF(btrim(j.location), '') IS NULL
    OR upper(btrim(coalesce(j.portal, ''))) NOT IN ('EV', 'PV')
    OR NULLIF(btrim(j.branch_label), '') IS NULL
  );

COMMIT;
