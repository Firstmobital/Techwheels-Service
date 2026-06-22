-- Fix bad EV_Service_History import where chassis_no is polluted by registration/suffix text.
-- Scope:
-- 1) rows where normalized chassis_no contains normalized registration_no, and/or
-- 2) rows where normalized chassis_no starts with MAT + 17-char VIN and has extra trailing chars.
-- Safety: skips rows where computed chassis_no would be empty.

BEGIN;

WITH source_rows AS (
  SELECT
    id,
    chassis_no,
    registration_no,
    nullif(upper(regexp_replace(coalesce(chassis_no, ''), '[^A-Za-z0-9]', '', 'g')), '') AS chassis_norm,
    nullif(upper(regexp_replace(coalesce(registration_no, ''), '[^A-Za-z0-9]', '', 'g')), '') AS reg_norm
  FROM public."EV_Service_History"
),
normalized AS (
  SELECT
    id,
    chassis_no AS old_chassis_no,
    chassis_norm,
    reg_norm,
    position(reg_norm in chassis_norm) > 0 AS reg_found,
    (chassis_norm ~ '^MAT[A-Z0-9]{14}[A-Z0-9]+$') AS has_vin_prefix_with_suffix
  FROM source_rows
  WHERE chassis_norm IS NOT NULL
    AND (
      (
        reg_norm IS NOT NULL
        AND length(chassis_norm) > length(reg_norm)
        AND position(reg_norm in chassis_norm) > 0
      )
      OR chassis_norm ~ '^MAT[A-Z0-9]{14}[A-Z0-9]+$'
    )
),
prepared AS (
  SELECT
    id,
    old_chassis_no,
    chassis_norm,
    reg_norm,
    reg_found,
    has_vin_prefix_with_suffix,
    CASE
      WHEN reg_found THEN replace(chassis_norm, reg_norm, '')
      ELSE chassis_norm
    END AS chassis_after_reg_cleanup
  FROM normalized
),
to_update AS (
  SELECT
    id,
    old_chassis_no,
    CASE
      WHEN chassis_after_reg_cleanup ~ '^MAT[A-Z0-9]{14}[A-Z0-9]+$' THEN substring(chassis_after_reg_cleanup FROM 1 FOR 17)
      WHEN chassis_after_reg_cleanup ~ '^MAT[A-Z0-9]{14}$' THEN chassis_after_reg_cleanup
      ELSE NULL
    END AS new_chassis_no
  FROM prepared
),
final_rows AS (
  SELECT
    id,
    old_chassis_no,
    new_chassis_no
  FROM to_update
  WHERE nullif(new_chassis_no, '') IS NOT NULL
    AND new_chassis_no IS DISTINCT FROM old_chassis_no
)
UPDATE public."EV_Service_History" t
SET chassis_no = f.new_chassis_no
FROM final_rows f
WHERE t.id = f.id;

COMMIT;
