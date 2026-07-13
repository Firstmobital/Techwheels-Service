-- ============================================================
-- ROOT CAUSE FIX: Parts Stock Snapshot Deduplication
-- 
-- Problem: Multiple imports of PV stock data were creating
-- duplicate rows because:
-- 1. source_row_hash was built from row position (not content)
-- 2. No DB-level unique constraint enforced true deduplication
-- 3. Result: 5581 rows in PV Sitapura vs 1444 in EV Sitapura
--            (948 part_numbers appearing 2-4x each)
--
-- Fix:
-- a) Clean existing duplicates (keep latest on_hand_quantity)
-- b) Add unique index on (branch, portal, part_number) for stock
--    This ensures one row per part per location regardless of
--    import hash logic
-- ============================================================

-- Step 1: Remove duplicate stock rows, keeping the most recently
-- inserted row (highest id) for each (branch, portal, part_number)
DELETE FROM service_parts_stock_snapshot_data
WHERE id NOT IN (
  SELECT DISTINCT ON (branch, portal, part_number) id
  FROM service_parts_stock_snapshot_data
  ORDER BY branch, portal, part_number, id DESC
);

-- Step 2: Add unique index to prevent future duplicates
-- If the index already exists, this is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_part_branch_portal
  ON service_parts_stock_snapshot_data (branch, portal, part_number);

-- Verify cleanup
DO $$
DECLARE
  total_rows  INTEGER;
  pv_sit_rows INTEGER;
  ev_sit_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_rows  FROM service_parts_stock_snapshot_data;
  SELECT COUNT(*) INTO pv_sit_rows FROM service_parts_stock_snapshot_data WHERE portal = 'PV' AND branch = 'Sitapura';
  SELECT COUNT(*) INTO ev_sit_rows FROM service_parts_stock_snapshot_data WHERE portal = 'EV' AND branch = 'Sitapura';
  RAISE NOTICE 'After dedup: total=%, PV Sitapura=%, EV Sitapura=%', total_rows, pv_sit_rows, ev_sit_rows;
END $$;
