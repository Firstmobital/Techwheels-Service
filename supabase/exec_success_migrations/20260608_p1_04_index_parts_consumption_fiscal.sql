-- P1-04: Index for service_parts_consumption_data fiscal-year lookups
-- COMPLEMENTARY: Existing index idx_parts_consumption_branch_portal_fiscal covers (branch, portal, fiscal_year);
--   this creates portal-agnostic version for fiscal_year DESC sorting
-- Slow query: 2,322 calls, mean ~792ms, max ~7.94s (Query 1 in P1-03 analysis, 20.82% DB time)
--
-- Authoritative source verified: full_database.sql
-- Table: public.service_parts_consumption_data
-- Columns verified: id, part_number, branch, fiscal_year, created_at, updated_at, transaction_date, portal
-- Existing indexes: idx_parts_consumption_branch_portal_fiscal, idx_parts_consumption_period
-- Note: This index optimizes for branch + fiscal_year lookup without portal dimension.
--
-- Expected impact: 20-30% additional latency improvement if portal filter is not always present

BEGIN;

-- Create index for branch + fiscal_year DESC sorting (complementary to portal-based indexes)
CREATE INDEX IF NOT EXISTS idx_parts_consumption_branch_fiscal_year_desc
  ON public.service_parts_consumption_data (branch, fiscal_year DESC)
  WHERE fiscal_year IS NOT NULL;

-- Verify index created
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'service_parts_consumption_data'
  AND indexname = 'idx_parts_consumption_branch_fiscal_year_desc';

-- Test query to verify index usage (run EXPLAIN ANALYZE after migration)
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT DISTINCT fiscal_year FROM service_parts_consumption_data
-- WHERE branch = 'Ajmer Road'
-- ORDER BY fiscal_year DESC;

-- Expected output: Index Scan using idx_parts_consumption_branch_fiscal_year_desc

COMMIT;

-- Rollback (if needed):
-- DROP INDEX IF EXISTS idx_parts_consumption_branch_fiscal_year_desc;
