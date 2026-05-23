-- Backfill invalid/missing VAS close datetimes from job_card_closed_data using job card + branch.
-- This fixes previously imported rows with 1900-era timestamps caused by datetime parsing issues.

WITH jc_source AS (
  SELECT
    branch,
    UPPER(TRIM(job_card_number)) AS job_card_key,
    MAX(closed_date_time) AS closed_date_time
  FROM public.job_card_closed_data
  WHERE job_card_number IS NOT NULL
    AND TRIM(job_card_number) <> ''
    AND closed_date_time IS NOT NULL
  GROUP BY 1, 2
)
UPDATE public.service_vas_jc_data AS vas
SET jc_closed_date_time = jc.closed_date_time
FROM jc_source AS jc
WHERE vas.branch = jc.branch
  AND UPPER(TRIM(vas.job_card_number)) = jc.job_card_key
  AND (
    vas.jc_closed_date_time IS NULL
    OR vas.jc_closed_date_time < TIMESTAMPTZ '2005-01-01 00:00:00+00'
  );
