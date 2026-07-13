-- ============================================================
-- Migration: Add unique constraints to parts data tables
-- Purpose: Enable true UPSERT (no-duplicate) behavior during
--          file imports, eliminating dependency on fragile
--          delete-before-insert pattern.
-- Date: 2026-07-13
-- ============================================================

-- 1. SERVICE_PARTS_CONSUMPTION_DATA
--    Business key: (part_number, branch, portal, fiscal_year, fiscal_month, source_row_hash)
--    source_row_hash encodes the exact row position in the source file,
--    making it safe to import multiple OTC/WS rows for the same part+month.
--    The UNIQUE constraint on (part_number, branch, portal, fiscal_year, fiscal_month, source_row_hash)
--    prevents exact duplicates from being inserted twice (idempotent re-import).
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumption_partbranch_portal_fymonth_hash
  ON service_parts_consumption_data (part_number, branch, portal, fiscal_year, fiscal_month, source_row_hash);

-- 2. SERVICE_PARTS_STOCK_SNAPSHOT_DATA
--    Business key: (part_number, branch, portal, snapshot_date, source_row_hash)
--    A part can appear at multiple warehouse locations on the same snapshot date,
--    but the source_row_hash makes each row unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_partbranch_portal_snapdate_hash
  ON service_parts_stock_snapshot_data (part_number, branch, portal, snapshot_date, source_row_hash);

-- 3. SERVICE_PARTS_ORDER_DATA
--    Business key: (part_number, branch, portal, order_date, source_row_hash)
--    An order line is uniquely identified by part+branch+portal+order_date+position in file.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_partbranch_portal_orderdate_hash
  ON service_parts_order_data (part_number, branch, portal, order_date, source_row_hash);

-- ============================================================
-- After these indexes exist, the upsert in ImportPage.tsx will
-- successfully use these conflict targets (currently the upsert
-- falls through all candidates because no constraints existed,
-- and raw INSERT runs instead — making the delete-before-insert
-- the only guard against duplicates).
-- ============================================================
