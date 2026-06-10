-- Enforce business rule: do not keep zero-quantity rows in parts stock snapshots.
-- 1) Remove existing rows where on_hand_quantity is 0.
-- 2) Ignore future INSERT rows with qty 0.
-- 3) On UPDATE/upsert to qty 0, delete the existing row.

BEGIN;

DELETE FROM public.service_parts_stock_snapshot_data
WHERE COALESCE(on_hand_quantity, 0) = 0;

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

DROP TRIGGER IF EXISTS trg_skip_zero_qty_parts_stock_rows
ON public.service_parts_stock_snapshot_data;

CREATE TRIGGER trg_skip_zero_qty_parts_stock_rows
BEFORE INSERT OR UPDATE
ON public.service_parts_stock_snapshot_data
FOR EACH ROW
EXECUTE FUNCTION public.skip_zero_qty_parts_stock_rows();

COMMIT;
