-- Relax overly strict non-negative check constraints for parts tables
-- to allow signed adjustments/returns in source data.

ALTER TABLE IF EXISTS public.service_parts_consumption_data
  DROP CONSTRAINT IF EXISTS ck_parts_consumption_non_negative;

ALTER TABLE IF EXISTS public.service_parts_consumption_data
  ADD CONSTRAINT ck_parts_consumption_non_negative
  CHECK (
    COALESCE(otc_quantity, 0) >= 0
    AND COALESCE(ws_quantity, 0) >= 0
    AND COALESCE(quantity_consumed, 0) >= 0
    AND COALESCE(total_consumption, 0) >= 0
    AND (unit_cost IS NULL OR unit_cost >= 0)
    AND (total_cost IS NULL OR total_cost >= 0)
  );

ALTER TABLE IF EXISTS public.service_parts_order_data
  DROP CONSTRAINT IF EXISTS ck_parts_order_non_negative;

ALTER TABLE IF EXISTS public.service_parts_order_data
  ADD CONSTRAINT ck_parts_order_non_negative
  CHECK (
    COALESCE(ordered_quantity, 0) >= 0
    AND COALESCE(received_quantity, 0) >= 0
    AND COALESCE(backorder_quantity, 0) >= 0
    AND (confirmation_qty IS NULL OR confirmation_qty >= 0)
    AND (challan_qty IS NULL OR challan_qty >= 0)
    AND (invoice_qty IS NULL OR invoice_qty >= 0)
    AND (intransit_qty IS NULL OR intransit_qty >= 0)
  );

ALTER TABLE IF EXISTS public.service_parts_stock_snapshot_data
  DROP CONSTRAINT IF EXISTS ck_parts_stock_non_negative;

ALTER TABLE IF EXISTS public.service_parts_stock_snapshot_data
  ADD CONSTRAINT ck_parts_stock_non_negative
  CHECK (
    COALESCE(on_hand_quantity, 0) >= 0
    AND (weighted_cost IS NULL OR weighted_cost >= 0)
    AND (inventory_value IS NULL OR inventory_value >= 0)
    AND (weighted_avg_cost IS NULL OR weighted_avg_cost >= 0)
    AND (total_price_value IS NULL OR total_price_value >= 0)
  );
