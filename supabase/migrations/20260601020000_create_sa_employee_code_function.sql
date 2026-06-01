-- Migration: Create my_sa_employee_code() and has_module_action() helper functions
-- Purpose: Stable identity resolution and unified action-based permission checks
-- Date: 2026-06-01

-- Function 1: Resolve current user's primary SA employee code for their dealer
CREATE OR REPLACE FUNCTION public.my_sa_employee_code()
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

-- Function 2: Unified action-based permission check dispatcher
CREATE OR REPLACE FUNCTION public.has_module_action(p_module text, p_action text)
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
