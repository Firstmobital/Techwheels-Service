-- Migration: Create user_employee_links table
-- Purpose: Stable 1:N mapping from auth users to operational employee identities
-- Date: 2026-06-01

CREATE TABLE public.user_employee_links (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  employee_code text NOT NULL REFERENCES public.employee_master(employee_code) 
    ON UPDATE CASCADE ON DELETE RESTRICT,
  dealer_code text NOT NULL,
  is_primary boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Uniqueness constraints to prevent duplicate/conflicting mappings
  UNIQUE (user_id, employee_code, dealer_code),
  UNIQUE (user_id, dealer_code) WHERE is_primary = true AND is_active = true
);

-- Indexes for fast lookup
CREATE INDEX idx_user_employee_links_user_id 
  ON public.user_employee_links(user_id);

CREATE INDEX idx_user_employee_links_employee_code 
  ON public.user_employee_links(employee_code);

CREATE INDEX idx_user_employee_links_dealer_code 
  ON public.user_employee_links(dealer_code);

-- Comments for documentation
COMMENT ON TABLE public.user_employee_links IS 
  'Stable mapping from auth users (signup identity) to operational employee identities (CRM records). 
   employee_code = SA_CODE from CRM employee_master (immutable).
   Supports multi-dealer and multi-role users via is_primary and is_active flags.
   This is the authoritative linkage; UI displays user.full_name (signup name) but uses employee_code internally.';

COMMENT ON COLUMN public.user_employee_links.is_primary IS 
  'Only one active primary mapping per user+dealer combination (enforced by unique constraint).';

COMMENT ON COLUMN public.user_employee_links.is_active IS 
  'Allows deactivation without deletion, preserving audit trail.';
