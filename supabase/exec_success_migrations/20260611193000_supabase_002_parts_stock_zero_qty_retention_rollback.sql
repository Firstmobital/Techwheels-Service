-- ============================================================
-- SUPABASE-002 Phase 4.1 Rollback: Reinstate zero-qty suppression
-- Created: 2026-06-11
-- Reverts migration:
--   20260611193000_supabase_002_parts_stock_zero_qty_retention.sql
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.skip_zero_qty_parts_stock_rows()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.on_hand_quantity, 0) = 0 THEN
    IF TG_OP = 'UPDATE' THEN
      DELETE FROM public.service_parts_stock_snapshot_data
      WHERE id = OLD.id;
    END IF;

    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
