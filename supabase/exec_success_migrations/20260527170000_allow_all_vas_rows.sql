-- Allow full-row VAS uploads (no silent skipping by unique conflict key).
-- Keeps query performance with a non-unique lookup index.

BEGIN;

DROP INDEX IF EXISTS public.uq_service_vas_conflict;

CREATE INDEX IF NOT EXISTS idx_service_vas_lookup
  ON public.service_vas_jc_data (job_card_number, branch, sr_type);

COMMIT;
