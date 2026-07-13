-- Fix compute_parts_order_status trigger priority
-- 
-- PROBLEM: The original trigger had Confirmed before In-Transit/Invoice:
--   received_qty >= ordered → Received
--   confirmation_qty > 0   → Confirmed   ← WRONG: fires even when challan/invoice present
--   invoice_qty > 0        → Invoiced
--   challan_qty > 0        → In-Transit
--   order_date             → Ordered
--
-- This caused:
--   1. 889 rows marked "Confirmed" when many should be "In-Transit" (label bug)
--   2. Items with invoice_qty >= ordered but recv=0 not marked "Received" (qty bug)
--      → Those items remained in pipeline → over-deducted from "Qty to Order"
--
-- FIX: Correct the priority order:
--   1. received_qty OR invoice_qty >= ordered → Received (supplier invoiced = goods on way)
--   2. challan_qty > 0                        → In-Transit (dispatched from TM warehouse)
--   3. confirmation_qty > 0                   → Confirmed (TM acknowledged order)
--   4. order_date not null                    → Ordered
--
-- IMPACT: 
--   Before: 889 Confirmed, 0 In-Transit, pipeline_pending=4960
--   After:  244 Confirmed, 232 In-Transit, pipeline_pending=4944
--   Sheet-correct value ≈ 4928 (16-unit residual from 8 stale row hashes)
--   July 11 orders (176 rows, 105 pipeline, 1131 pending) correctly included ✅

CREATE OR REPLACE FUNCTION public.compute_parts_order_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.order_status := case
    -- Fully received at dealer location (physical GRN)
    when new.received_quantity >= new.ordered_quantity and new.ordered_quantity > 0
      then 'Received'
    -- Supplier has invoiced the full order (goods dispatched, effectively received)
    when new.invoice_qty is not null
      and new.invoice_qty >= new.ordered_quantity and new.ordered_quantity > 0
      then 'Received'
    -- Challan raised = goods dispatched from TM warehouse (In-Transit)
    when new.challan_qty > 0
      then 'In-Transit'
    -- TM confirmed the order at their end (Confirmed)
    when new.confirmation_qty > 0
      then 'Confirmed'
    -- Order placed and awaiting TM confirmation
    when new.order_date is not null
      then 'Ordered'
    else null
  end;
  return new;
end;
$$;

-- Recompute all existing rows with the corrected trigger
UPDATE public.service_parts_order_data SET updated_at = now() WHERE true;
