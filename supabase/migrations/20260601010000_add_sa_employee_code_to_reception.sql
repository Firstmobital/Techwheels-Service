-- Migration: Add sa_employee_code and sa_display_name columns to service_reception_entries
-- Purpose: Link to immutable SA_CODE (employee_code) from CRM; cache display name from signup
-- Date: 2026-06-01
-- 
-- Rationale: 
-- - sa_employee_code = employee_code (SA_CODE from CRM, immutable, used for all RLS/logic)
-- - sa_display_name = user.full_name (signup name, mutable, used only for UI display)
-- - sa_name = original CRM SA_NAME (immutable, kept as audit/alias reference only)

ALTER TABLE public.service_reception_entries
  ADD COLUMN sa_employee_code text REFERENCES public.employee_master(employee_code),
  ADD COLUMN sa_display_name text;

-- Index for fast SA lookup by employee code (only internal queries use this)
CREATE INDEX idx_service_reception_sa_lookup 
  ON public.service_reception_entries(dealer_code, sa_employee_code, created_at DESC);

-- Index for display name searches (optional, for reporting)
CREATE INDEX idx_service_reception_sa_display 
  ON public.service_reception_entries(dealer_code, sa_display_name);

COMMENT ON COLUMN public.service_reception_entries.sa_employee_code IS 
  'Immutable reference to employee code (SA_CODE from CRM employee_master). 
   Used internally for all RLS filtering and business logic. 
   This is the stable identity that never changes.';

COMMENT ON COLUMN public.service_reception_entries.sa_display_name IS 
  'Cache of user.full_name (signup name) for display purposes only. 
   Denormalized for convenience; use sa_employee_code for all filtering/logic. 
   Can be stale if user updates their display name; not used for access control.';

COMMENT ON COLUMN public.service_reception_entries.sa_name IS 
  'Original CRM SA_NAME value (immutable, like "JAIN, ARJHANT"). 
   Kept for audit trail and backward compatibility. 
   Never used for filtering or access decisions; use sa_employee_code instead.';
