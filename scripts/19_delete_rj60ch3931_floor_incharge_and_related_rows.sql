-- Purpose:
-- Remove the problematic floor-incharge-visible reception row(s) for RJ60CH3931
-- where jc_number is missing, and clean linked assignment rows.
--
-- NOTE:
-- Run manually in Supabase SQL editor after reviewing the preview query output.

BEGIN;

-- 1) Preview target rows that will be removed.
WITH target_reception AS (
  SELECT
    id,
    reg_number,
    jc_number,
    UPPER('RECEPTION-' || id::text) AS legacy_assignment_key,
    UPPER(TRIM(COALESCE(jc_number, ''))) AS normalized_jc
  FROM public.service_reception_entries
  WHERE UPPER(TRIM(COALESCE(reg_number, ''))) = 'RJ60CH3931'
    AND TRIM(COALESCE(jc_number, '')) = ''
)
SELECT *
FROM target_reception
ORDER BY id;

-- 2) Delete linked support assignments (if any).
WITH target_reception AS (
  SELECT
    UPPER('RECEPTION-' || id::text) AS legacy_assignment_key,
    UPPER(TRIM(COALESCE(jc_number, ''))) AS normalized_jc
  FROM public.service_reception_entries
  WHERE UPPER(TRIM(COALESCE(reg_number, ''))) = 'RJ60CH3931'
    AND TRIM(COALESCE(jc_number, '')) = ''
), keys_to_remove AS (
  SELECT legacy_assignment_key AS key FROM target_reception
  UNION
  SELECT normalized_jc AS key FROM target_reception WHERE normalized_jc <> ''
)
DELETE FROM public.job_card_support_assignments jsa
WHERE UPPER(TRIM(COALESCE(jsa.job_card_number, ''))) IN (
  SELECT key FROM keys_to_remove
);

-- 3) Delete linked primary technician assignments.
WITH target_reception AS (
  SELECT
    UPPER('RECEPTION-' || id::text) AS legacy_assignment_key,
    UPPER(TRIM(COALESCE(jc_number, ''))) AS normalized_jc
  FROM public.service_reception_entries
  WHERE UPPER(TRIM(COALESCE(reg_number, ''))) = 'RJ60CH3931'
    AND TRIM(COALESCE(jc_number, '')) = ''
), keys_to_remove AS (
  SELECT legacy_assignment_key AS key FROM target_reception
  UNION
  SELECT normalized_jc AS key FROM target_reception WHERE normalized_jc <> ''
)
DELETE FROM public.technician_assignments ta
WHERE UPPER(TRIM(COALESCE(ta.job_card_number, ''))) IN (
  SELECT key FROM keys_to_remove
);

-- 4) Delete the reception row(s) with missing jc_number for this reg number.
DELETE FROM public.service_reception_entries sre
WHERE UPPER(TRIM(COALESCE(sre.reg_number, ''))) = 'RJ60CH3931'
  AND TRIM(COALESCE(sre.jc_number, '')) = '';

COMMIT;
