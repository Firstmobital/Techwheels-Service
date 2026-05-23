-- RBAC Phase 3.3 lock-safe retry migration
-- Purpose: apply the same policy tightening as 20260523143000_phase33_tighten_parts_import_rls.sql
-- without waiting on long table locks in busy environments.
--
-- Operational behavior:
-- - Uses NOWAIT table locks per table section.
-- - If a table is currently busy, that section is skipped with a NOTICE.
-- - Re-run this script until all sections report "applied" and no section reports "skipped".

DO $$
BEGIN
  -- import_metadata
  BEGIN
    LOCK TABLE public.import_metadata IN ACCESS EXCLUSIVE MODE NOWAIT;

    ALTER TABLE public.import_metadata ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS import_metadata_insert_anon ON public.import_metadata;
    DROP POLICY IF EXISTS import_metadata_select_anon ON public.import_metadata;
    DROP POLICY IF EXISTS import_metadata_update_anon ON public.import_metadata;

    DROP POLICY IF EXISTS import_metadata_read_rbac_v1 ON public.import_metadata;
    DROP POLICY IF EXISTS import_metadata_write_admin_v1 ON public.import_metadata;

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

    RAISE NOTICE 'phase33 lock-safe: import_metadata applied';
  EXCEPTION
    WHEN lock_not_available THEN
      RAISE NOTICE 'phase33 lock-safe: import_metadata skipped (table busy, rerun later)';
  END;

  -- part_master
  BEGIN
    LOCK TABLE public.part_master IN ACCESS EXCLUSIVE MODE NOWAIT;

    ALTER TABLE public.part_master ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS part_master_insert_anon ON public.part_master;
    DROP POLICY IF EXISTS part_master_select_anon ON public.part_master;
    DROP POLICY IF EXISTS part_master_update_anon ON public.part_master;

    DROP POLICY IF EXISTS part_master_read_rbac_v1 ON public.part_master;
    DROP POLICY IF EXISTS part_master_write_admin_v1 ON public.part_master;

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

    RAISE NOTICE 'phase33 lock-safe: part_master applied';
  EXCEPTION
    WHEN lock_not_available THEN
      RAISE NOTICE 'phase33 lock-safe: part_master skipped (table busy, rerun later)';
  END;

  -- service_parts_consumption_data
  BEGIN
    LOCK TABLE public.service_parts_consumption_data IN ACCESS EXCLUSIVE MODE NOWAIT;

    ALTER TABLE public.service_parts_consumption_data ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS parts_consumption_delete_anon ON public.service_parts_consumption_data;
    DROP POLICY IF EXISTS parts_consumption_insert_anon ON public.service_parts_consumption_data;
    DROP POLICY IF EXISTS parts_consumption_select_anon ON public.service_parts_consumption_data;
    DROP POLICY IF EXISTS parts_consumption_update_anon ON public.service_parts_consumption_data;

    DROP POLICY IF EXISTS service_parts_consumption_select_rbac_v1 ON public.service_parts_consumption_data;
    DROP POLICY IF EXISTS service_parts_consumption_insert_rbac_v1 ON public.service_parts_consumption_data;
    DROP POLICY IF EXISTS service_parts_consumption_update_rbac_v1 ON public.service_parts_consumption_data;
    DROP POLICY IF EXISTS service_parts_consumption_delete_rbac_v1 ON public.service_parts_consumption_data;

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

    RAISE NOTICE 'phase33 lock-safe: service_parts_consumption_data applied';
  EXCEPTION
    WHEN lock_not_available THEN
      RAISE NOTICE 'phase33 lock-safe: service_parts_consumption_data skipped (table busy, rerun later)';
  END;

  -- service_parts_order_data
  BEGIN
    LOCK TABLE public.service_parts_order_data IN ACCESS EXCLUSIVE MODE NOWAIT;

    ALTER TABLE public.service_parts_order_data ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS parts_order_delete_anon ON public.service_parts_order_data;
    DROP POLICY IF EXISTS parts_order_insert_anon ON public.service_parts_order_data;
    DROP POLICY IF EXISTS parts_order_select_anon ON public.service_parts_order_data;
    DROP POLICY IF EXISTS parts_order_update_anon ON public.service_parts_order_data;

    DROP POLICY IF EXISTS service_parts_order_select_rbac_v1 ON public.service_parts_order_data;
    DROP POLICY IF EXISTS service_parts_order_insert_rbac_v1 ON public.service_parts_order_data;
    DROP POLICY IF EXISTS service_parts_order_update_rbac_v1 ON public.service_parts_order_data;
    DROP POLICY IF EXISTS service_parts_order_delete_rbac_v1 ON public.service_parts_order_data;

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

    RAISE NOTICE 'phase33 lock-safe: service_parts_order_data applied';
  EXCEPTION
    WHEN lock_not_available THEN
      RAISE NOTICE 'phase33 lock-safe: service_parts_order_data skipped (table busy, rerun later)';
  END;

  -- service_parts_stock_snapshot_data
  BEGIN
    LOCK TABLE public.service_parts_stock_snapshot_data IN ACCESS EXCLUSIVE MODE NOWAIT;

    ALTER TABLE public.service_parts_stock_snapshot_data ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS parts_stock_delete_anon ON public.service_parts_stock_snapshot_data;
    DROP POLICY IF EXISTS parts_stock_insert_anon ON public.service_parts_stock_snapshot_data;
    DROP POLICY IF EXISTS parts_stock_select_anon ON public.service_parts_stock_snapshot_data;
    DROP POLICY IF EXISTS parts_stock_update_anon ON public.service_parts_stock_snapshot_data;

    DROP POLICY IF EXISTS service_parts_stock_select_rbac_v1 ON public.service_parts_stock_snapshot_data;
    DROP POLICY IF EXISTS service_parts_stock_insert_rbac_v1 ON public.service_parts_stock_snapshot_data;
    DROP POLICY IF EXISTS service_parts_stock_update_rbac_v1 ON public.service_parts_stock_snapshot_data;
    DROP POLICY IF EXISTS service_parts_stock_delete_rbac_v1 ON public.service_parts_stock_snapshot_data;

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

    RAISE NOTICE 'phase33 lock-safe: service_parts_stock_snapshot_data applied';
  EXCEPTION
    WHEN lock_not_available THEN
      RAISE NOTICE 'phase33 lock-safe: service_parts_stock_snapshot_data skipped (table busy, rerun later)';
  END;
END
$$;
