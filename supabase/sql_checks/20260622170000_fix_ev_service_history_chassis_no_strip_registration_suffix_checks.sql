-- Read-only checks for EV_Service_History chassis_no cleanup.
-- MAT-only rule: final value must start with MAT and be exactly 17 chars.

-- 1) Candidate rows under current MAT-only migration logic.
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
    registration_no,
    chassis_norm,
    reg_norm,
    position(reg_norm in chassis_norm) > 0 AS reg_found
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
    registration_no,
    CASE
      WHEN reg_found THEN replace(chassis_norm, reg_norm, '')
      ELSE chassis_norm
    END AS chassis_after_reg_cleanup
  FROM normalized
),
preview AS (
  SELECT
    id,
    old_chassis_no,
    registration_no,
    CASE
      WHEN chassis_after_reg_cleanup ~ '^MAT[A-Z0-9]{14}[A-Z0-9]+$' THEN substring(chassis_after_reg_cleanup FROM 1 FOR 17)
      WHEN chassis_after_reg_cleanup ~ '^MAT[A-Z0-9]{14}$' THEN chassis_after_reg_cleanup
      ELSE NULL
    END AS new_chassis_no
  FROM prepared
)
SELECT count(*) AS candidate_rows
FROM preview;

-- 2) Rows that would be updated (top 100 preview).
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
    registration_no,
    chassis_norm,
    reg_norm,
    position(reg_norm in chassis_norm) > 0 AS reg_found
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
    registration_no,
    CASE
      WHEN reg_found THEN replace(chassis_norm, reg_norm, '')
      ELSE chassis_norm
    END AS chassis_after_reg_cleanup
  FROM normalized
),
preview AS (
  SELECT
    id,
    old_chassis_no,
    registration_no,
    CASE
      WHEN chassis_after_reg_cleanup ~ '^MAT[A-Z0-9]{14}[A-Z0-9]+$' THEN substring(chassis_after_reg_cleanup FROM 1 FOR 17)
      WHEN chassis_after_reg_cleanup ~ '^MAT[A-Z0-9]{14}$' THEN chassis_after_reg_cleanup
      ELSE NULL
    END AS new_chassis_no
  FROM prepared
)
SELECT
  id,
  old_chassis_no,
  registration_no,
  new_chassis_no
FROM preview
WHERE nullif(new_chassis_no, '') IS NOT NULL
  AND new_chassis_no IS DISTINCT FROM old_chassis_no
ORDER BY old_chassis_no, registration_no
LIMIT 100;

-- 3) Candidate rows excluded by MAT-only VIN rule (manual review bucket).
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
    registration_no,
    chassis_norm,
    reg_norm,
    position(reg_norm in chassis_norm) > 0 AS reg_found
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
    registration_no,
    CASE
      WHEN reg_found THEN replace(chassis_norm, reg_norm, '')
      ELSE chassis_norm
    END AS chassis_after_reg_cleanup
  FROM normalized
),
preview AS (
  SELECT
    id,
    old_chassis_no,
    registration_no,
    CASE
      WHEN chassis_after_reg_cleanup ~ '^MAT[A-Z0-9]{14}[A-Z0-9]+$' THEN substring(chassis_after_reg_cleanup FROM 1 FOR 17)
      WHEN chassis_after_reg_cleanup ~ '^MAT[A-Z0-9]{14}$' THEN chassis_after_reg_cleanup
      ELSE NULL
    END AS new_chassis_no
  FROM prepared
)
SELECT
  id,
  old_chassis_no,
  registration_no,
  new_chassis_no
FROM preview
WHERE new_chassis_no IS NULL
ORDER BY old_chassis_no, registration_no
LIMIT 100;

-- 4) Post-apply verification: 0 rows should still have MAT+17 VIN prefix plus extra suffix.
SELECT count(*) AS remaining_mat_prefix_plus_suffix_rows
FROM public."EV_Service_History" s
WHERE nullif(upper(regexp_replace(coalesce(s.chassis_no, ''), '[^A-Za-z0-9]', '', 'g')), '') ~ '^MAT[A-Z0-9]{14}[A-Z0-9]+$';
