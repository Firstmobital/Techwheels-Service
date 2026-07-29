-- all_service_data — vehicle_registration_number containing 'MAT'
-- Run in Supabase SQL Editor (read-only checks).
--
-- Context: invalid VRNs like 'ZY49MAT6316' embed chassis prefix 'MAT' into registration.
-- Example row: id 51014, chassis_no MAT631602NWP83817, vrn ZY49MAT6316

-- ─── 1) Total count ───────────────────────────────────────────────────────────
SELECT COUNT(*) AS mat_in_vrn_count
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%MAT%';

-- ─── 2) Non-null vs all rows (baseline) ───────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE vehicle_registration_number IS NOT NULL) AS vrn_not_null,
  COUNT(*) FILTER (
    WHERE vehicle_registration_number IS NOT NULL
      AND vehicle_registration_number ILIKE '%MAT%'
  ) AS vrn_contains_mat,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE vehicle_registration_number IS NOT NULL
        AND vehicle_registration_number ILIKE '%MAT%'
    ) / NULLIF(COUNT(*) FILTER (WHERE vehicle_registration_number IS NOT NULL), 0),
    2
  ) AS pct_of_non_null_vrn
FROM public.all_service_data;

-- ─── 3) Distinct VRN values (how many unique bad values) ─────────────────────
SELECT
  COUNT(DISTINCT vehicle_registration_number) AS distinct_mat_vrns
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%MAT%';

-- ─── 4) Top repeated VRN patterns ─────────────────────────────────────────────
SELECT
  vehicle_registration_number,
  COUNT(*) AS row_count
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%MAT%'
GROUP BY vehicle_registration_number
ORDER BY row_count DESC, vehicle_registration_number
LIMIT 50;

-- ─── 5) Sample rows for manual review ─────────────────────────────────────────
SELECT
  id,
  chassis_no,
  vehicle_registration_number,
  first_name,
  model,
  vehicle_sale_date,
  last_updated_at
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%MAT%'
ORDER BY id
LIMIT 100;

-- ─── 6) Cross-check: VRN contains MAT and chassis also starts with MAT ────────
SELECT
  COUNT(*) AS both_vrn_mat_and_chassis_mat_prefix
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%MAT%'
  AND chassis_no ILIKE 'MAT%';

-- ─── 7) How many affected rows currently have updated_by_robot = true ───────
SELECT
  COUNT(*) AS mat_vrn_rows,
  COUNT(*) FILTER (WHERE COALESCE(updated_by_robot, false) = true) AS robot_flag_true
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%MAT%';

-- ─── 8) Fix (run in transaction; expect 458 rows) ────────────────────────────
-- BEGIN;
--
-- UPDATE public.all_service_data
-- SET
--   vehicle_registration_number = NULL,
--   updated_by_robot = false,
--   updated_by_robot_at = NULL
-- WHERE vehicle_registration_number ILIKE '%MAT%';
--
-- SELECT COUNT(*) AS remaining_mat_vrn
-- FROM public.all_service_data
-- WHERE vehicle_registration_number ILIKE '%MAT%';
--
-- COMMIT;
