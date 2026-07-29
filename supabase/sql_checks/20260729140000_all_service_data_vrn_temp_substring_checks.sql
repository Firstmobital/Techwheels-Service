-- all_service_data — vehicle_registration_number containing 'TEMP'
-- Run in Supabase SQL Editor (read-only checks).
--
-- Context: invalid/temporary VRNs embedded in vehicle_registration_number.

-- ─── 1) Total count ───────────────────────────────────────────────────────────
SELECT COUNT(*) AS temp_in_vrn_count
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%TEMP%';

-- ─── 2) Non-null vs all rows (baseline) ───────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE vehicle_registration_number IS NOT NULL) AS vrn_not_null,
  COUNT(*) FILTER (
    WHERE vehicle_registration_number IS NOT NULL
      AND vehicle_registration_number ILIKE '%TEMP%'
  ) AS vrn_contains_temp,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE vehicle_registration_number IS NOT NULL
        AND vehicle_registration_number ILIKE '%TEMP%'
    ) / NULLIF(COUNT(*) FILTER (WHERE vehicle_registration_number IS NOT NULL), 0),
    2
  ) AS pct_of_non_null_vrn
FROM public.all_service_data;

-- ─── 3) Distinct VRN values ────────────────────────────────────────────────────
SELECT
  COUNT(DISTINCT vehicle_registration_number) AS distinct_temp_vrns
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%TEMP%';

-- ─── 4) Top repeated VRN patterns ─────────────────────────────────────────────
SELECT
  vehicle_registration_number,
  COUNT(*) AS row_count
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%TEMP%'
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
  updated_by_robot,
  last_updated_at
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%TEMP%'
ORDER BY id
LIMIT 100;

-- ─── 6) How many affected rows currently have updated_by_robot = true ───────
SELECT
  COUNT(*) AS temp_vrn_rows,
  COUNT(*) FILTER (WHERE COALESCE(updated_by_robot, false) = true) AS robot_flag_true
FROM public.all_service_data
WHERE vehicle_registration_number ILIKE '%TEMP%';

-- ─── 7) Fix (run in transaction) ─────────────────────────────────────────────
-- BEGIN;
--
-- UPDATE public.all_service_data
-- SET
--   vehicle_registration_number = NULL,
--   updated_by_robot = false,
--   updated_by_robot_at = NULL
-- WHERE vehicle_registration_number ILIKE '%TEMP%';
--
-- SELECT COUNT(*) AS remaining_temp_vrn
-- FROM public.all_service_data
-- WHERE vehicle_registration_number ILIKE '%TEMP%';
--
-- COMMIT;
