-- ============================================================
-- SUPABASE-002 Phase 4.1: Preserve zero-quantity stock rows
-- Created: 2026-06-11
--
-- Goal:
--   Replace destructive zero-qty suppression with retention behavior so
--   zero-quantity rows are preserved for analytics/audit continuity.
--
-- Notes:
--   Historical rows already deleted by prior migration cannot be reconstructed
--   from this migration; this change prevents further loss.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.skip_zero_qty_parts_stock_rows()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Retention mode: keep all rows, including on_hand_quantity = 0.
  RETURN NEW;
END;
$$;

COMMIT;
