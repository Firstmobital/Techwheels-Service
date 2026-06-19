-- Add pricing and insurance detail columns to all_service_data
-- Uses IF NOT EXISTS so the migration is idempotent.

ALTER TABLE public.all_service_data
  ADD COLUMN IF NOT EXISTS ex_showroom_price NUMERIC,
  ADD COLUMN IF NOT EXISTS idv NUMERIC,
  ADD COLUMN IF NOT EXISTS last_insurance_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS last_insurance_comapny TEXT,
  ADD COLUMN IF NOT EXISTS last_insurance_policy_number TEXT;
