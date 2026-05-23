-- Align parts unique keys with import upsert logic.
-- This removes legacy/ambiguous unique constraints and enforces
-- stable idempotency keys based on part + branch + portal + date + source hash.

-- =========================
-- Parts Consumption
-- =========================
ALTER TABLE IF EXISTS public.service_parts_consumption_data
  DROP CONSTRAINT IF EXISTS uq_parts_consumption_key;

DROP INDEX IF EXISTS public.uq_parts_consumption_key;
DROP INDEX IF EXISTS public.uq_parts_consumption_conflict;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_consumption_conflict
  ON public.service_parts_consumption_data (
    part_number,
    branch,
    portal,
    transaction_date,
    source_row_hash
  )
  WHERE branch IS NOT NULL AND source_row_hash IS NOT NULL;

-- =========================
-- Parts Order
-- =========================
ALTER TABLE IF EXISTS public.service_parts_order_data
  DROP CONSTRAINT IF EXISTS uq_parts_order_key;

DROP INDEX IF EXISTS public.uq_parts_order_key;
DROP INDEX IF EXISTS public.uq_parts_order_conflict;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_order_conflict
  ON public.service_parts_order_data (
    part_number,
    branch,
    portal,
    order_date,
    source_row_hash
  )
  WHERE branch IS NOT NULL AND source_row_hash IS NOT NULL;

-- =========================
-- Parts Stock Snapshot
-- =========================
ALTER TABLE IF EXISTS public.service_parts_stock_snapshot_data
  DROP CONSTRAINT IF EXISTS uq_parts_stock_key;

DROP INDEX IF EXISTS public.uq_parts_stock_key;
DROP INDEX IF EXISTS public.uq_parts_stock_conflict;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_stock_conflict
  ON public.service_parts_stock_snapshot_data (
    part_number,
    branch,
    portal,
    snapshot_date,
    source_row_hash
  )
  WHERE branch IS NOT NULL AND source_row_hash IS NOT NULL;
