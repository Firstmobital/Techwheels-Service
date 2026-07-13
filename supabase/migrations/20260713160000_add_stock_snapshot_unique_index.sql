-- Migration: Add missing unique constraint to service_parts_stock_snapshot_data
-- 
-- ROOT CAUSE: Without this constraint, upsert ON CONFLICT (part_number, branch, portal)
-- silently falls through to plain INSERT, causing duplicate rows per part_number every
-- time a file is uploaded. One Excel file with duplicate part_numbers would insert
-- multiple rows for the same part, inflating stock quantities in all reports.
--
-- This constraint enforces "one stock row per part per branch per portal" which is
-- the correct business rule for a point-in-time snapshot.

-- Step 1: Remove any existing duplicates (keep lowest id = first inserted)
DELETE FROM service_parts_stock_snapshot_data
WHERE id NOT IN (
  SELECT MIN(id)
  FROM service_parts_stock_snapshot_data
  GROUP BY part_number, branch, portal
);

-- Step 2: Create the unique index (this also serves as the constraint for ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_part_branch_portal
  ON service_parts_stock_snapshot_data (part_number, branch, portal);
