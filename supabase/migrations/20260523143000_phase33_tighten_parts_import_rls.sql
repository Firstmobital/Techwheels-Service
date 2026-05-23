-- RBAC Phase 3.3 policy tightening
-- Scope: replace permissive anon/authenticated policies with module-aware authenticated policies.
-- Paired temporary verification file:
-- supabase/sql_checks/20260523143000_phase33_tighten_parts_import_rls_checks.sql

-- Enable RLS on legacy reporting/import tables that previously had permissive policies.
ALTER TABLE public.import_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_parts_consumption_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_parts_order_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_parts_stock_snapshot_data ENABLE ROW LEVEL SECURITY;

-- Remove permissive legacy policies (authenticated, anon USING true).
DROP POLICY IF EXISTS import_metadata_insert_anon ON public.import_metadata;
DROP POLICY IF EXISTS import_metadata_select_anon ON public.import_metadata;
DROP POLICY IF EXISTS import_metadata_update_anon ON public.import_metadata;

DROP POLICY IF EXISTS part_master_insert_anon ON public.part_master;
DROP POLICY IF EXISTS part_master_select_anon ON public.part_master;
DROP POLICY IF EXISTS part_master_update_anon ON public.part_master;

DROP POLICY IF EXISTS parts_consumption_delete_anon ON public.service_parts_consumption_data;
DROP POLICY IF EXISTS parts_consumption_insert_anon ON public.service_parts_consumption_data;
DROP POLICY IF EXISTS parts_consumption_select_anon ON public.service_parts_consumption_data;
DROP POLICY IF EXISTS parts_consumption_update_anon ON public.service_parts_consumption_data;

DROP POLICY IF EXISTS parts_order_delete_anon ON public.service_parts_order_data;
DROP POLICY IF EXISTS parts_order_insert_anon ON public.service_parts_order_data;
DROP POLICY IF EXISTS parts_order_select_anon ON public.service_parts_order_data;
DROP POLICY IF EXISTS parts_order_update_anon ON public.service_parts_order_data;

DROP POLICY IF EXISTS parts_stock_delete_anon ON public.service_parts_stock_snapshot_data;
DROP POLICY IF EXISTS parts_stock_insert_anon ON public.service_parts_stock_snapshot_data;
DROP POLICY IF EXISTS parts_stock_select_anon ON public.service_parts_stock_snapshot_data;
DROP POLICY IF EXISTS parts_stock_update_anon ON public.service_parts_stock_snapshot_data;

-- Import metadata: readable by RBAC-enabled users; write limited to admins.
CREATE POLICY import_metadata_read_rbac_v1
ON public.import_metadata
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.has_module_view('job_cards')
  OR public.has_module_view('reports')
  OR public.has_module_view('parts_inventory')
  OR public.has_module_view('parts_orders')
  OR public.has_module_view('parts_consumption')
);

CREATE POLICY import_metadata_write_admin_v1
ON public.import_metadata
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Part master: broad read for parts/job-card consumers; writes remain admin-only.
CREATE POLICY part_master_read_rbac_v1
ON public.part_master
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.has_module_view('job_cards')
  OR public.has_module_view('parts_inventory')
  OR public.has_module_view('parts_orders')
  OR public.has_module_view('parts_consumption')
);

CREATE POLICY part_master_write_admin_v1
ON public.part_master
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Parts consumption: module-scoped read/write/delete.
CREATE POLICY service_parts_consumption_select_rbac_v1
ON public.service_parts_consumption_data
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.has_module_view('parts_consumption')
);

CREATE POLICY service_parts_consumption_insert_rbac_v1
ON public.service_parts_consumption_data
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR public.has_module_modify('parts_consumption')
);

CREATE POLICY service_parts_consumption_update_rbac_v1
ON public.service_parts_consumption_data
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR public.has_module_modify('parts_consumption')
)
WITH CHECK (
  public.is_admin()
  OR public.has_module_modify('parts_consumption')
);

CREATE POLICY service_parts_consumption_delete_rbac_v1
ON public.service_parts_consumption_data
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR public.has_module_delete('parts_consumption')
);

-- Parts order: module-scoped + dealer guard where dealer_code is populated.
CREATE POLICY service_parts_order_select_rbac_v1
ON public.service_parts_order_data
FOR SELECT
TO authenticated
USING (
  (
    public.is_admin()
    OR public.has_module_view('parts_orders')
  )
  AND (dealer_code IS NULL OR dealer_code = public.my_dealer_code())
);

CREATE POLICY service_parts_order_insert_rbac_v1
ON public.service_parts_order_data
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.is_admin()
    OR public.has_module_modify('parts_orders')
  )
  AND (dealer_code IS NULL OR dealer_code = public.my_dealer_code())
);

CREATE POLICY service_parts_order_update_rbac_v1
ON public.service_parts_order_data
FOR UPDATE
TO authenticated
USING (
  (
    public.is_admin()
    OR public.has_module_modify('parts_orders')
  )
  AND (dealer_code IS NULL OR dealer_code = public.my_dealer_code())
)
WITH CHECK (
  (
    public.is_admin()
    OR public.has_module_modify('parts_orders')
  )
  AND (dealer_code IS NULL OR dealer_code = public.my_dealer_code())
);

CREATE POLICY service_parts_order_delete_rbac_v1
ON public.service_parts_order_data
FOR DELETE
TO authenticated
USING (
  (
    public.is_admin()
    OR public.has_module_delete('parts_orders')
  )
  AND (dealer_code IS NULL OR dealer_code = public.my_dealer_code())
);

-- Parts stock snapshot: module-scoped read/write/delete.
CREATE POLICY service_parts_stock_select_rbac_v1
ON public.service_parts_stock_snapshot_data
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.has_module_view('parts_inventory')
);

CREATE POLICY service_parts_stock_insert_rbac_v1
ON public.service_parts_stock_snapshot_data
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR public.has_module_modify('parts_inventory')
);

CREATE POLICY service_parts_stock_update_rbac_v1
ON public.service_parts_stock_snapshot_data
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR public.has_module_modify('parts_inventory')
)
WITH CHECK (
  public.is_admin()
  OR public.has_module_modify('parts_inventory')
);

CREATE POLICY service_parts_stock_delete_rbac_v1
ON public.service_parts_stock_snapshot_data
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR public.has_module_delete('parts_inventory')
);
