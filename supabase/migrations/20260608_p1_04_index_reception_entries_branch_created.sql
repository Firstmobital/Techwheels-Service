-- P1-04: Index for service_reception_entries list pagination
-- CRITICAL: Missing index on (branch, created_at DESC) for fast pagination
-- Slow query: 1,947 calls, mean ~610ms, max ~1.85s (Query 2 in P1-03 analysis, 13.46% DB time)
--
-- Authoritative source verified: full_database.sql
-- Table: public.service_reception_entries
-- Columns verified: id, created_at, branch, service_type, jc_number, reg_number
-- No conflicts with existing indexes.
--
-- Expected impact: 67% latency reduction (610ms -> 200ms estimated)

BEGIN;

-- Create covering index for paginated list reads
CREATE INDEX IF NOT EXISTS idx_reception_entries_branch_created_at_desc
  ON public.service_reception_entries (branch, created_at DESC, id DESC)
  INCLUDE (jc_number, reg_number, service_type);

-- Verify index created
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'service_reception_entries'
  AND indexname = 'idx_reception_entries_branch_created_at_desc';

-- Test query to verify index usage (run EXPLAIN ANALYZE after migration)
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT id, jc_number, created_at, service_type, reg_number
-- FROM service_reception_entries
-- WHERE branch = 'Sitapura EV'
-- ORDER BY created_at DESC
-- LIMIT 50 OFFSET 0;

-- Expected output: Index Scan using idx_reception_entries_branch_created_at_desc

COMMIT;

-- Rollback (if needed):
-- DROP INDEX IF EXISTS idx_reception_entries_branch_created_at_desc;
