-- Read-only checks for 20260621130000_all_service_data_assumed_next_service_type_unknown_bucket_mapping_v1

-- 1) Global distribution after mapping rollout
SELECT
  COUNT(1) AS total_rows,
  SUM(CASE WHEN assumed_next_service_type = 'Unknown' THEN 1 ELSE 0 END) AS unknown_rows,
  SUM(CASE WHEN assumed_next_service_type IS NULL THEN 1 ELSE 0 END) AS null_rows,
  SUM(CASE WHEN assumed_next_service_type = 'Paid Service' THEN 1 ELSE 0 END) AS paid_rows
FROM public.all_service_data;

-- 2) Verify mapped values no longer fall into Unknown
SELECT
  last_service_type,
  COUNT(1) AS row_count
FROM public.all_service_data
WHERE lower(btrim(COALESCE(last_service_type, ''))) IN (
  'running repairs',
  'accident',
  'campaign',
  'amc - tm',
  'e breakdown'
)
GROUP BY last_service_type
ORDER BY row_count DESC, last_service_type ASC;

SELECT
  last_service_type,
  assumed_next_service_type,
  COUNT(1) AS row_count
FROM public.all_service_data
WHERE lower(btrim(COALESCE(last_service_type, ''))) IN (
  'running repairs',
  'accident',
  'campaign',
  'amc - tm',
  'e breakdown'
)
GROUP BY last_service_type, assumed_next_service_type
ORDER BY last_service_type, assumed_next_service_type;

-- 3) Remaining Unknown backlog for next policy batch
SELECT
  last_service_type,
  COUNT(1) AS row_count
FROM public.all_service_data
WHERE assumed_next_service_type = 'Unknown'
GROUP BY last_service_type
ORDER BY row_count DESC, last_service_type ASC
LIMIT 50;
