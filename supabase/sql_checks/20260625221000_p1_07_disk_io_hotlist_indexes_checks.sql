-- Read-only verification checks for:
-- supabase/migrations/20260625221000_p1_07_disk_io_hotlist_indexes.sql

-- 1) Confirm new indexes exist and inspect definitions.
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_sre_created_at_id_desc',
    'idx_sre_service_type_created_at_id_desc',
    'idx_ta_updated_assigned_desc',
    'idx_vas_jc_closed_branch'
  )
ORDER BY tablename, indexname;

-- 2) Reception ordered list plan should move away from Seq Scan + Sort.
EXPLAIN (FORMAT TEXT, BUFFERS)
SELECT
  id,
  dealer_code,
  reg_number,
  model,
  service_type,
  sa_name,
  jc_number,
  created_at
FROM public.service_reception_entries
ORDER BY created_at DESC, id DESC
LIMIT 100;

-- 3) Technician ordered list plan should use new sort-path index.
EXPLAIN (FORMAT TEXT, BUFFERS)
SELECT
  job_card_number,
  work_status,
  technician_code,
  assigned_at,
  updated_at
FROM public.technician_assignments
ORDER BY updated_at DESC, assigned_at DESC
LIMIT 100;

-- 4) VAS date-window list plan should use jc_closed_date_time index path.
EXPLAIN (FORMAT TEXT, BUFFERS)
SELECT
  branch,
  sr_type,
  net_price,
  job_card_number,
  employee_code,
  jc_closed_date_time
FROM public.service_vas_jc_data
WHERE jc_closed_date_time >= '2026-06-01'::timestamptz
  AND jc_closed_date_time <  '2026-06-26'::timestamptz
ORDER BY jc_closed_date_time DESC
LIMIT 200;

-- 5) Snapshot top query IDs tied to current incident baseline.
SELECT
  queryid,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  rows,
  shared_blks_read,
  shared_blks_hit,
  temp_blks_read,
  temp_blks_written,
  left(query, 240) AS query_sample
FROM extensions.pg_stat_statements
WHERE queryid IN (
  6416750758406621842::bigint,
  -5344960703026327435::bigint,
  -6712128630152386476::bigint,
  -5044213774447814878::bigint,
  -4471200446562181147::bigint,
  -2876120296317350531::bigint,
  -5633448213020496946::bigint,
  8277935260341689633::bigint
)
ORDER BY total_exec_time DESC;

-- 6) Track seq/index scan balance for target tables after rollout.
SELECT
  relname,
  seq_scan,
  idx_scan,
  n_live_tup,
  round((seq_scan::numeric / NULLIF(seq_scan + idx_scan, 0)) * 100, 2) AS seq_scan_pct
FROM pg_stat_user_tables
WHERE relname IN (
  'service_reception_entries',
  'technician_assignments',
  'service_vas_jc_data'
)
ORDER BY relname;
