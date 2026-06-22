-- Purpose:
-- Add two new target columns required for one-time PV/EV backfill mapping.
-- 1) engine_no
-- 2) scheduled_next_service_type

BEGIN;

ALTER TABLE public.all_service_data
  ADD COLUMN IF NOT EXISTS engine_no text,
  ADD COLUMN IF NOT EXISTS scheduled_next_service_type text;

COMMENT ON COLUMN public.all_service_data.engine_no
IS 'Engine number projected from PV/EV source vehicle data during one-time backfill workflows.';

COMMENT ON COLUMN public.all_service_data.scheduled_next_service_type
IS 'Scheduled next service type projected from PV/EV source vehicle data during one-time backfill workflows.';

COMMIT;
