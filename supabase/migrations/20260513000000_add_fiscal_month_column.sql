-- Add fiscal_month column to service_parts_consumption_data
ALTER TABLE public.service_parts_consumption_data
ADD COLUMN IF NOT EXISTS fiscal_month integer;

-- Add fiscal_month column to service_parts_order_data
ALTER TABLE public.service_parts_order_data
ADD COLUMN IF NOT EXISTS fiscal_month integer;

-- Add fiscal_month column to service_parts_stock_snapshot_data
ALTER TABLE public.service_parts_stock_snapshot_data
ADD COLUMN IF NOT EXISTS fiscal_month integer;
