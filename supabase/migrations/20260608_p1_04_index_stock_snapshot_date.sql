-- P1-04: Index for service_parts_stock_snapshot_data inventory lookups
-- OPTIONAL: Existing index idx_parts_stock_branch_portal_date covers (branch, portal, snapshot_date DESC);
--   this creates portal-agnostic DESC version for snapshot_date sorting + part_number grouping
-- Slow query: 87 calls, mean ~1.91s, (Query 10 in P1-03 analysis, 1.88% DB time)
--
-- Authoritative source verified: full_database.sql
-- Table: public.service_parts_stock_snapshot_data
-- Columns verified: id, part_number, branch, snapshot_date, portal, on_hand_quantity, inventory_value
-- Existing indexes: idx_parts_stock_branch_portal_date, idx_parts_stock_part_branch_portal, idx_parts_stock_branch_date
-- Note: This index optimizes for snapshot_date DESC ordering without portal dimension.
--        Lower priority since idx_parts_stock_branch_portal_date already covers this with portal.
--
-- Expected impact: Marginal improvement (5-10%) if portal filter is absent; helpful for multi-branch snapshot comparisons

BEGIN;

-- Create index for branch + snapshot_date DESC + part_number ASC (optional, complements portal-based index)
CREATE INDEX IF NOT EXISTS idx_stock_snapshot_branch_snapshot_date_desc
  ON public.service_parts_stock_snapshot_data (branch, snapshot_date DESC, part_number ASC)
  INCLUDE (on_hand_quantity, inventory_value);

-- Verify index created
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'service_parts_stock_snapshot_data'
  AND indexname = 'idx_stock_snapshot_branch_snapshot_date_desc';

-- Test query to verify index usage (run EXPLAIN ANALYZE after migration)
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM service_parts_stock_snapshot_data
-- WHERE branch = 'Ajmer Road'
--   AND snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
-- ORDER BY snapshot_date DESC, part_number ASC
-- LIMIT 50 OFFSET 0;

-- Expected output: Index Scan using idx_stock_snapshot_branch_snapshot_date_desc

COMMIT;

-- Rollback (if needed):
-- DROP INDEX IF EXISTS idx_stock_snapshot_branch_snapshot_date_desc;
