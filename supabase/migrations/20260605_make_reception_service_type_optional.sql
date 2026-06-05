-- Allow service_type to be NULL for reception entries
-- Service type will be set by service advisor, not at reception

BEGIN;

-- Drop the old constraint that requires service_type to be non-blank
ALTER TABLE public.service_reception_entries
  DROP CONSTRAINT service_reception_service_type_not_blank;

-- Make service_type nullable (change from NOT NULL to nullable)
ALTER TABLE public.service_reception_entries
  ALTER COLUMN service_type DROP NOT NULL;

-- Add new constraint that allows NULL but disallows blank strings when present
ALTER TABLE public.service_reception_entries
  ADD CONSTRAINT service_reception_service_type_check CHECK (service_type IS NULL OR length(btrim(service_type)) > 0);

COMMIT;
