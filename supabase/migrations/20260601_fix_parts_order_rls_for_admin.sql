-- Migration: Fix Parts Order RLS to allow admin imports
-- Purpose: Allow admin users to insert parts orders with any dealer_code during imports
-- Admin users should not be restricted by dealer_code matching

BEGIN;

DROP POLICY IF EXISTS service_parts_order_insert_rbac_v1 ON public.service_parts_order_data;

CREATE POLICY service_parts_order_insert_rbac_v1
ON public.service_parts_order_data
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_modify('parts_orders')
    AND (dealer_code IS NULL OR dealer_code = public.my_dealer_code())
  )
);

-- Also update the UPDATE policy for consistency
DROP POLICY IF EXISTS service_parts_order_update_rbac_v1 ON public.service_parts_order_data;

CREATE POLICY service_parts_order_update_rbac_v1
ON public.service_parts_order_data
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_modify('parts_orders')
    AND (dealer_code IS NULL OR dealer_code = public.my_dealer_code())
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_modify('parts_orders')
    AND (dealer_code IS NULL OR dealer_code = public.my_dealer_code())
  )
);

COMMIT;
