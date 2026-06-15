-- Service Advisor mismatch checker by created date
--
-- Usage:
-- 1) Change target_created_date in input_params
-- 2) Run this query in Supabase SQL editor
--
-- Logic:
-- - Takes latest service_reception_entries row per Reg No for the given created date (IST)
-- - Finds latest source row per Reg No across:
--   a) job_card_closed_data
--   b) open_job_cards
-- - Compares Reg No and JC Number only (Service Type intentionally excluded)
-- - Returns only mismatches

WITH input_params AS (
  SELECT DATE '2026-06-15' AS target_created_date
),
sa_scope AS (
  SELECT
    s.id,
    s.created_at,
    UPPER(TRIM(COALESCE(s.reg_number, ''))) AS sa_reg_no,
    UPPER(TRIM(COALESCE(s.jc_number, ''))) AS sa_jc_no
  FROM service_reception_entries s
  CROSS JOIN input_params p
  WHERE (s.created_at AT TIME ZONE 'Asia/Kolkata')::date = p.target_created_date
),
latest_sa_per_reg AS (
  SELECT DISTINCT ON (ss.sa_reg_no)
    ss.id,
    ss.created_at,
    ss.sa_reg_no,
    ss.sa_jc_no
  FROM sa_scope ss
  WHERE ss.sa_reg_no <> ''
  ORDER BY ss.sa_reg_no, ss.created_at DESC, ss.id DESC
),
source_rows AS (
  SELECT
    'job_card_closed_data' AS source_table,
    UPPER(TRIM(COALESCE(j.vehicle_registration_number, ''))) AS src_reg_no,
    UPPER(TRIM(COALESCE(j.job_card_number, ''))) AS src_jc_no,
    COALESCE(j.closed_date_time::text, j."Invoice_date"::text, j.created_date_time::text) AS source_event_ts
  FROM job_card_closed_data j
  JOIN latest_sa_per_reg sa
    ON UPPER(TRIM(COALESCE(j.vehicle_registration_number, ''))) = sa.sa_reg_no

  UNION ALL

  SELECT
    'open_job_cards' AS source_table,
    UPPER(TRIM(COALESCE(o.vehicle_registration_number, ''))) AS src_reg_no,
    UPPER(TRIM(COALESCE(o.job_card_number, ''))) AS src_jc_no,
    COALESCE(o.closed_date_time::text, o.completed_date_time::text, o.created_date_time::text) AS source_event_ts
  FROM open_job_cards o
  JOIN latest_sa_per_reg sa
    ON UPPER(TRIM(COALESCE(o.vehicle_registration_number, ''))) = sa.sa_reg_no
),
latest_source_per_reg AS (
  SELECT DISTINCT ON (sr.src_reg_no)
    sr.source_table,
    sr.src_reg_no,
    sr.src_jc_no,
    sr.source_event_ts
  FROM source_rows sr
  WHERE sr.src_reg_no <> ''
  ORDER BY sr.src_reg_no, sr.source_event_ts DESC NULLS LAST, sr.src_jc_no DESC
)
SELECT
  sa.id AS sa_entry_id,
  sa.created_at AS sa_created_at,
  sa.sa_reg_no,
  sa.sa_jc_no,
  ls.source_table,
  ls.source_event_ts,
  ls.src_reg_no,
  ls.src_jc_no,
  (sa.sa_reg_no = ls.src_reg_no) AS reg_match,
  (sa.sa_jc_no = ls.src_jc_no) AS jc_match,
  CASE
    WHEN ls.src_reg_no IS NULL THEN 'MISMATCH_NO_SOURCE'
    WHEN sa.sa_reg_no = ls.src_reg_no AND sa.sa_jc_no = ls.src_jc_no THEN 'MATCH'
    ELSE 'MISMATCH'
  END AS validation_status
FROM latest_sa_per_reg sa
LEFT JOIN latest_source_per_reg ls
  ON ls.src_reg_no = sa.sa_reg_no
WHERE
  ls.src_reg_no IS NULL
  OR sa.sa_reg_no <> ls.src_reg_no
  OR sa.sa_jc_no <> ls.src_jc_no
ORDER BY sa.created_at DESC, sa.id DESC;
