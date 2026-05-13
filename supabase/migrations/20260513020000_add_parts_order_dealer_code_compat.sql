-- Compatibility migration for parts order imports.
-- Some environments have `dealer_name` while app payload may include `dealer_code`.

ALTER TABLE IF EXISTS public.service_parts_order_data
  ADD COLUMN IF NOT EXISTS dealer_code text;

-- Backfill dealer_code from dealer_name when available.
UPDATE public.service_parts_order_data
SET dealer_code = dealer_name
WHERE dealer_code IS NULL
  AND dealer_name IS NOT NULL;
