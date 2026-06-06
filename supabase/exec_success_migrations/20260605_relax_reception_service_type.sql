-- Simplified migration: Allow NULL service_type via constraint relaxation only
-- No transaction wrapper, single statements

-- Drop the old constraint
ALTER TABLE public.service_reception_entries DROP CONSTRAINT IF EXISTS service_reception_service_type_not_blank;
