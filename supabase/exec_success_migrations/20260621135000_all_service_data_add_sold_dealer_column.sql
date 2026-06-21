-- Plan: SUPABASE-002 follow-up
-- Purpose: Add sold_dealer column to all_service_data with strict allowed values.

BEGIN;

ALTER TABLE public.all_service_data
  ADD COLUMN IF NOT EXISTS sold_dealer text;

COMMENT ON COLUMN public.all_service_data.sold_dealer
IS 'Sold dealer classification. Allowed values: Techwheels, Others.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'all_service_data_sold_dealer_chk'
      AND conrelid = 'public.all_service_data'::regclass
  ) THEN
    ALTER TABLE public.all_service_data
      ADD CONSTRAINT all_service_data_sold_dealer_chk
      CHECK (sold_dealer IS NULL OR sold_dealer IN ('Techwheels', 'Others'));
  END IF;
END
$$;

COMMIT;
