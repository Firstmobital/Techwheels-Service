BEGIN;

-- Phase 2: Standardize bodyshop child-table RLS to dealer-scope + module RBAC.
-- Parent table bodyshop_repair_cards already has RBAC v1 policies.

ALTER TABLE public.bodyshop_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodyshop_intake_vehicle_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodyshop_repair_card_documents ENABLE ROW LEVEL SECURITY;

-- =========================
-- bodyshop_assignments RLS
-- =========================
DROP POLICY IF EXISTS bodyshop_assignments_read ON public.bodyshop_assignments;
DROP POLICY IF EXISTS bodyshop_assignments_insert ON public.bodyshop_assignments;
DROP POLICY IF EXISTS bodyshop_assignments_update ON public.bodyshop_assignments;
DROP POLICY IF EXISTS bodyshop_assignments_delete_rbac_v2 ON public.bodyshop_assignments;
DROP POLICY IF EXISTS bodyshop_assignments_select_rbac_v2 ON public.bodyshop_assignments;
DROP POLICY IF EXISTS bodyshop_assignments_insert_rbac_v2 ON public.bodyshop_assignments;
DROP POLICY IF EXISTS bodyshop_assignments_update_rbac_v2 ON public.bodyshop_assignments;

CREATE POLICY bodyshop_assignments_select_rbac_v2
  ON public.bodyshop_assignments
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_view('bodyshop_floor')
        OR public.has_module_modify('bodyshop_floor')
        OR public.has_module_view('bodyshop_repair')
        OR public.has_module_modify('bodyshop_repair')
        OR public.has_module_view('bodyshop_tracker')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_assignments_insert_rbac_v2
  ON public.bodyshop_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      (
        public.has_module_modify('bodyshop_floor')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_assignments_update_rbac_v2
  ON public.bodyshop_assignments
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_modify('bodyshop_floor')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      (
        public.has_module_modify('bodyshop_floor')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_assignments_delete_rbac_v2
  ON public.bodyshop_assignments
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_delete('bodyshop_floor')
        OR public.has_module_delete('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

-- Keep service-role broad access for backend jobs.
DROP POLICY IF EXISTS bodyshop_assignments_service_all ON public.bodyshop_assignments;
CREATE POLICY bodyshop_assignments_service_all
  ON public.bodyshop_assignments
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ===================================
-- bodyshop_intake_vehicle_photos RLS
-- ===================================
DROP POLICY IF EXISTS bodyshop_intake_vehicle_photos_select_rbac_v1 ON public.bodyshop_intake_vehicle_photos;
DROP POLICY IF EXISTS bodyshop_intake_vehicle_photos_insert_rbac_v1 ON public.bodyshop_intake_vehicle_photos;
DROP POLICY IF EXISTS bodyshop_intake_vehicle_photos_update_rbac_v1 ON public.bodyshop_intake_vehicle_photos;
DROP POLICY IF EXISTS bodyshop_intake_vehicle_photos_delete_rbac_v1 ON public.bodyshop_intake_vehicle_photos;

CREATE POLICY bodyshop_intake_vehicle_photos_select_rbac_v2
  ON public.bodyshop_intake_vehicle_photos
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_view('service_advisor')
        OR public.has_module_view('reception')
        OR public.has_module_view('bodyshop_floor')
        OR public.has_module_view('bodyshop_repair')
        OR public.has_module_view('bodyshop_tracker')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_intake_vehicle_photos_insert_rbac_v2
  ON public.bodyshop_intake_vehicle_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      (
        public.has_module_modify('service_advisor')
        OR public.has_module_modify('reception')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_intake_vehicle_photos_update_rbac_v2
  ON public.bodyshop_intake_vehicle_photos
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_modify('service_advisor')
        OR public.has_module_modify('reception')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      (
        public.has_module_modify('service_advisor')
        OR public.has_module_modify('reception')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_intake_vehicle_photos_delete_rbac_v2
  ON public.bodyshop_intake_vehicle_photos
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_delete('service_advisor')
        OR public.has_module_delete('reception')
        OR public.has_module_delete('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

-- ==================================
-- bodyshop_repair_card_documents RLS
-- ==================================
DROP POLICY IF EXISTS bodyshop_repair_card_documents_select_own_dealer ON public.bodyshop_repair_card_documents;
DROP POLICY IF EXISTS bodyshop_repair_card_documents_insert_own_dealer ON public.bodyshop_repair_card_documents;
DROP POLICY IF EXISTS bodyshop_repair_card_documents_update_own_dealer ON public.bodyshop_repair_card_documents;
DROP POLICY IF EXISTS bodyshop_repair_card_documents_delete_own_dealer ON public.bodyshop_repair_card_documents;
DROP POLICY IF EXISTS bodyshop_repair_card_documents_select_rbac_v2 ON public.bodyshop_repair_card_documents;
DROP POLICY IF EXISTS bodyshop_repair_card_documents_insert_rbac_v2 ON public.bodyshop_repair_card_documents;
DROP POLICY IF EXISTS bodyshop_repair_card_documents_update_rbac_v2 ON public.bodyshop_repair_card_documents;
DROP POLICY IF EXISTS bodyshop_repair_card_documents_delete_rbac_v2 ON public.bodyshop_repair_card_documents;

CREATE POLICY bodyshop_repair_card_documents_select_rbac_v2
  ON public.bodyshop_repair_card_documents
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_view('service_advisor')
        OR public.has_module_view('reception')
        OR public.has_module_view('bodyshop_floor')
        OR public.has_module_view('bodyshop_repair')
        OR public.has_module_view('bodyshop_tracker')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_repair_card_documents_insert_rbac_v2
  ON public.bodyshop_repair_card_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      (
        public.has_module_modify('service_advisor')
        OR public.has_module_modify('reception')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_repair_card_documents_update_rbac_v2
  ON public.bodyshop_repair_card_documents
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_modify('service_advisor')
        OR public.has_module_modify('reception')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      (
        public.has_module_modify('service_advisor')
        OR public.has_module_modify('reception')
        OR public.has_module_modify('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_repair_card_documents_delete_rbac_v2
  ON public.bodyshop_repair_card_documents
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_delete('service_advisor')
        OR public.has_module_delete('reception')
        OR public.has_module_delete('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
