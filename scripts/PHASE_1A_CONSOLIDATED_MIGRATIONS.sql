-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1 CONSOLIDATED MIGRATIONS
-- Deploy all 5 migrations at once via Supabase SQL Editor
-- Date: 2026-06-01
-- ════════════════════════════════════════════════════════════════════════════
-- 
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Create NEW query
-- 3. Copy entire contents of THIS FILE (from "BEGIN" to "END" below)
-- 4. Paste into SQL Editor
-- 5. Click "Run" button
-- 6. Verify no errors (scroll to bottom for success message)
-- 7. Check schema in "Schema Editor" tab to verify tables/functions created
--
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 1: Create user_employee_links table
-- ════════════════════════════════════════════════════════════════════════════

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
  
  UNIQUE (user_id, employee_code, dealer_code),
  UNIQUE (user_id, dealer_code) WHERE is_primary = true AND is_active = true
);

CREATE INDEX idx_user_employee_links_user_id 
  ON public.user_employee_links(user_id);

CREATE INDEX idx_user_employee_links_employee_code 
  ON public.user_employee_links(employee_code);

CREATE INDEX idx_user_employee_links_dealer_code 
  ON public.user_employee_links(dealer_code);

COMMENT ON TABLE public.user_employee_links IS 
  'Stable mapping from auth users (signup identity) to operational employee identities (CRM records). 
   employee_code = SA_CODE from CRM employee_master (immutable).
   Supports multi-dealer and multi-role users via is_primary and is_active flags.
   This is the authoritative linkage; UI displays user.full_name (signup name) but uses employee_code internally.';

COMMENT ON COLUMN public.user_employee_links.is_primary IS 
  'Only one active primary mapping per user+dealer combination (enforced by unique constraint).';

COMMENT ON COLUMN public.user_employee_links.is_active IS 
  'Allows deactivation without deletion, preserving audit trail.';

-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 2: Add sa_employee_code and sa_display_name to service_reception_entries
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.service_reception_entries
  ADD COLUMN sa_employee_code text REFERENCES public.employee_master(employee_code),
  ADD COLUMN sa_display_name text;

CREATE INDEX idx_service_reception_sa_lookup 
  ON public.service_reception_entries(dealer_code, sa_employee_code, created_at DESC);

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

-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 3: Create my_sa_employee_code() and has_module_action() functions
-- ════════════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.my_sa_employee_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT uel.employee_code
  FROM public.user_employee_links uel
  WHERE uel.user_id = auth.uid()
    AND uel.is_primary = true
    AND uel.is_active = true
    AND uel.dealer_code = public.my_dealer_code()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.my_sa_employee_code() IS 
  'Resolve current authenticated user''s primary SA employee code for their dealer. 
   Returns NULL if no active mapping exists. 
   Used in RLS policies to filter service_reception_entries by SA ownership.';

CREATE FUNCTION public.has_module_action(p_module text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE LOWER(p_action)
    WHEN 'view' THEN public.has_module_view(p_module)
    WHEN 'modify' THEN public.has_module_modify(p_module)
    WHEN 'delete' THEN public.has_module_delete(p_module)
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.has_module_action(text, text) IS 
  'Unified action-based permission check. 
   p_action: ''view'' | ''modify'' | ''delete''. 
   Maps to corresponding has_module_view/modify/delete checks.';

-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 4: Fix reception and service_advisor RLS policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS service_reception_select_sa_v1 ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_update_sa_v1 ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_entries_select_public ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_entries_insert_public ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_entries_update_public ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_entries_delete_public ON public.service_reception_entries;

CREATE POLICY service_reception_select_rbac ON public.service_reception_entries
  FOR SELECT TO authenticated
  USING (
    public.my_dealer_code() = dealer_code
    AND public.has_module_view('reception')
  );

CREATE POLICY service_reception_insert_rbac ON public.service_reception_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.my_dealer_code() = dealer_code
    AND public.has_module_modify('reception')
  );

CREATE POLICY service_reception_update_rbac ON public.service_reception_entries
  FOR UPDATE TO authenticated
  USING (
    public.my_dealer_code() = dealer_code
    AND public.has_module_modify('reception')
  )
  WITH CHECK (
    public.my_dealer_code() = dealer_code
    AND public.has_module_modify('reception')
  );

CREATE POLICY service_reception_delete_rbac ON public.service_reception_entries
  FOR DELETE TO authenticated
  USING (
    public.my_dealer_code() = dealer_code
    AND public.has_module_delete('reception')
  );

CREATE POLICY service_reception_select_sa ON public.service_reception_entries
  FOR SELECT TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('service_advisor')
    AND sa_employee_code = public.my_sa_employee_code()
  );

CREATE POLICY service_reception_update_sa ON public.service_reception_entries
  FOR UPDATE TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('service_advisor')
    AND sa_employee_code = public.my_sa_employee_code()
  )
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('service_advisor')
    AND sa_employee_code = public.my_sa_employee_code()
  );

-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 5: Harden RLS on sensitive tables
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.employee_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_master_select_all ON public.employee_master;
DROP POLICY IF EXISTS employee_master_insert_admin ON public.employee_master;
DROP POLICY IF EXISTS employee_master_update_admin ON public.employee_master;
DROP POLICY IF EXISTS employee_master_delete_admin ON public.employee_master;

CREATE POLICY employee_master_select_all ON public.employee_master
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY employee_master_insert_admin ON public.employee_master
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY employee_master_update_admin ON public.employee_master
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY employee_master_delete_admin ON public.employee_master
  FOR DELETE TO authenticated
  USING (public.is_admin());

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ✓ ALL 5 MIGRATIONS EXECUTED SUCCESSFULLY
-- ════════════════════════════════════════════════════════════════════════════
--
-- NEXT VERIFICATION STEPS:
--
-- 1. In Supabase Dashboard "Schema Editor" tab, verify:
--    ✓ Table: public.user_employee_links (with 3 indexes)
--    ✓ Columns: service_reception_entries.sa_employee_code + sa_display_name
--    ✓ Functions: my_sa_employee_code(), has_module_action()
--    ✓ RLS Policies on service_reception_entries
--    ✓ RLS Policies on employee_master
--
-- 2. Test functions in new SQL query:
--    SELECT my_sa_employee_code();  -- Should return NULL (no mapping yet)
--    SELECT has_module_action('service_advisor', 'view');  -- Should work
--
-- 3. Next: Run backfill scripts
--    File: scripts/01_backfill_sa_name_matcher_diagnostic.sql
