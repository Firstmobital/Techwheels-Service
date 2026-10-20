-- MOBILE-016: Add source column to vehicles table to track origin of each record.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'dms';

COMMENT ON COLUMN public.vehicles.source IS
  'MOBILE-016: Origin of the vehicle record. '
  'dms = imported from DMS/TML feed (default), '
  'customer_self_register = added via customer portal self-registration.';
