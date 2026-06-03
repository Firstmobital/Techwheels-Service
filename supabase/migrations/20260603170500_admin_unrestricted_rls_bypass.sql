-- 2026-06-03
-- Purpose: Make active admin role globally unblocked by dealer-bound RLS guards.
-- IMPORTANT: This migration is intended for manual execution by operator.
-- Contract: admin bypass must apply at policy layer (not only UI) so admin can validate end-to-end access.

-- Retry-safe execution mode for Supabase SQL Editor:
-- 1) No global BEGIN/COMMIT wrapper (so one lock wait does not roll back all prior sections)
-- 2) Fail fast on lock contention; rerun when load is lower
-- 3) If a section fails with 55P03, rerun only the failed statement/section after blockers clear.
SET lock_timeout = '30s';
SET statement_timeout = '0';

-- service_parts_order_data: admin bypass must skip dealer_code constraint.
-- SECTION 1: public.service_parts_order_data
DROP POLICY IF EXISTS service_parts_order_select_rbac_v1 ON public.service_parts_order_data;
CREATE POLICY service_parts_order_select_rbac_v1
ON public.service_parts_order_data
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('parts_orders')
    AND ((dealer_code IS NULL) OR (dealer_code = public.my_dealer_code()))
  )
);

DROP POLICY IF EXISTS service_parts_order_insert_rbac_v1 ON public.service_parts_order_data;
CREATE POLICY service_parts_order_insert_rbac_v1
ON public.service_parts_order_data
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_modify('parts_orders')
    AND ((dealer_code IS NULL) OR (dealer_code = public.my_dealer_code()))
  )
);

DROP POLICY IF EXISTS service_parts_order_update_rbac_v1 ON public.service_parts_order_data;
CREATE POLICY service_parts_order_update_rbac_v1
ON public.service_parts_order_data
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_modify('parts_orders')
    AND ((dealer_code IS NULL) OR (dealer_code = public.my_dealer_code()))
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_modify('parts_orders')
    AND ((dealer_code IS NULL) OR (dealer_code = public.my_dealer_code()))
  )
);

DROP POLICY IF EXISTS service_parts_order_delete_rbac_v1 ON public.service_parts_order_data;
CREATE POLICY service_parts_order_delete_rbac_v1
ON public.service_parts_order_data
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_delete('parts_orders')
    AND ((dealer_code IS NULL) OR (dealer_code = public.my_dealer_code()))
  )
);

-- service_reception_entries: admin bypass must skip dealer_code ownership gate.
-- SECTION 2: public.service_reception_entries
DROP POLICY IF EXISTS service_reception_select_rbac ON public.service_reception_entries;
CREATE POLICY service_reception_select_rbac
ON public.service_reception_entries
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    (public.my_dealer_code() = dealer_code)
    AND public.has_module_view('reception')
  )
);

DROP POLICY IF EXISTS service_reception_insert_rbac ON public.service_reception_entries;
CREATE POLICY service_reception_insert_rbac
ON public.service_reception_entries
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    (public.my_dealer_code() = dealer_code)
    AND public.has_module_modify('reception')
  )
);

DROP POLICY IF EXISTS service_reception_update_rbac ON public.service_reception_entries;
CREATE POLICY service_reception_update_rbac
ON public.service_reception_entries
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (
    (public.my_dealer_code() = dealer_code)
    AND public.has_module_modify('reception')
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    (public.my_dealer_code() = dealer_code)
    AND public.has_module_modify('reception')
  )
);

DROP POLICY IF EXISTS service_reception_delete_rbac ON public.service_reception_entries;
CREATE POLICY service_reception_delete_rbac
ON public.service_reception_entries
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR (
    (public.my_dealer_code() = dealer_code)
    AND public.has_module_delete('reception')
  )
);

-- settings_model_options: admin bypass must skip dealer_code gate.
-- SECTION 3: public.settings_model_options
DROP POLICY IF EXISTS settings_model_options_select_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_select_v1
ON public.settings_model_options
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    (dealer_code = public.my_dealer_code())
    AND public.has_module_view('settings')
  )
);

DROP POLICY IF EXISTS settings_model_options_insert_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_insert_v1
ON public.settings_model_options
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    (dealer_code = public.my_dealer_code())
    AND public.has_module_view('settings')
  )
);

DROP POLICY IF EXISTS settings_model_options_update_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_update_v1
ON public.settings_model_options
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (
    (dealer_code = public.my_dealer_code())
    AND public.has_module_view('settings')
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    (dealer_code = public.my_dealer_code())
    AND public.has_module_view('settings')
  )
);

DROP POLICY IF EXISTS settings_model_options_delete_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_delete_v1
ON public.settings_model_options
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR (
    (dealer_code = public.my_dealer_code())
    AND public.has_module_view('settings')
  )
);

-- vehicles: admin bypass must skip dealer_code ownership gate.
-- SECTION 4: public.vehicles
DROP POLICY IF EXISTS "vehicles: own dealership select" ON public.vehicles;
CREATE POLICY "vehicles: own dealership select"
ON public.vehicles
FOR SELECT
USING (
  public.is_admin()
  OR (dealer_code = public.my_dealer_code())
);

DROP POLICY IF EXISTS "vehicles: own dealership insert" ON public.vehicles;
CREATE POLICY "vehicles: own dealership insert"
ON public.vehicles
FOR INSERT
WITH CHECK (
  public.is_admin()
  OR (dealer_code = public.my_dealer_code())
);

DROP POLICY IF EXISTS "vehicles: own dealership update" ON public.vehicles;
CREATE POLICY "vehicles: own dealership update"
ON public.vehicles
FOR UPDATE
USING (
  public.is_admin()
  OR (dealer_code = public.my_dealer_code())
)
WITH CHECK (
  public.is_admin()
  OR (dealer_code = public.my_dealer_code())
);

-- storage.objects (autodoc bucket): admin bypass must skip dealer prefix path gate.
-- SECTION 5: storage.objects (autodoc bucket)
DROP POLICY IF EXISTS "autodoc objects: own dealer read" ON storage.objects;
CREATE POLICY "autodoc objects: own dealer read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    (bucket_id = 'autodoc')
    AND (split_part(name, '/', 1) = public.my_dealer_code())
  )
);

DROP POLICY IF EXISTS "autodoc objects: own dealer insert" ON storage.objects;
CREATE POLICY "autodoc objects: own dealer insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    (bucket_id = 'autodoc')
    AND (split_part(name, '/', 1) = public.my_dealer_code())
  )
);

DROP POLICY IF EXISTS "autodoc objects: own dealer update" ON storage.objects;
CREATE POLICY "autodoc objects: own dealer update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (
    (bucket_id = 'autodoc')
    AND (split_part(name, '/', 1) = public.my_dealer_code())
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    (bucket_id = 'autodoc')
    AND (split_part(name, '/', 1) = public.my_dealer_code())
  )
);

DROP POLICY IF EXISTS "autodoc objects: own dealer delete" ON storage.objects;
CREATE POLICY "autodoc objects: own dealer delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR (
    (bucket_id = 'autodoc')
    AND (split_part(name, '/', 1) = public.my_dealer_code())
  )
);

RESET lock_timeout;
RESET statement_timeout;
