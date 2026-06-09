-- P1-04: Index for service_vas_jc_data date-windowed reads
-- CRITICAL: Missing index on (branch, created_at DESC) for efficient filtering
-- Slow query: 6,218 calls, mean ~38ms, max ~6.38s (Query 7 in P1-03 analysis, 2.67% DB time)
--
-- Authoritative source verified: full_database.sql
-- Table: public.service_vas_jc_data
-- Columns verified: id, branch, created_at, employee_code, sr_type
-- No conflicts with existing indexes on branch/employee_code/sr_type.
--
-- Expected impact: 50% latency reduction for date-windowed queries (38ms baseline, higher for max-latency cases)

BEGIN;

-- Create covering index for date-windowed filtering and lookups
CREATE INDEX IF NOT EXISTS idx_vas_jc_data_branch_created_at_desc
  ON public.service_vas_jc_data (branch, created_at DESC)
  INCLUDE (employee_code, sr_type, job_card_number);

-- Verify index created
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'service_vas_jc_data'
  AND indexname = 'idx_vas_jc_data_branch_created_at_desc';

-- Test query to verify index usage (run EXPLAIN ANALYZE after migration)
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM service_vas_jc_data
-- WHERE branch = 'Sitapura EV'
--   AND created_at >= NOW() - INTERVAL '7 days'
-- ORDER BY created_at DESC
-- LIMIT 100;

-- Expected output: Index Scan using idx_vas_jc_data_branch_created_at_desc

COMMIT;

-- Rollback (if needed):
-- DROP INDEX IF EXISTS idx_vas_jc_data_branch_created_at_desc;
