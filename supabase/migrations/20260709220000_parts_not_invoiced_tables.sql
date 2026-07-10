DROP TABLE IF EXISTS parts_not_invoiced_uploads CASCADE;
DROP TABLE IF EXISTS parts_not_invoiced_data CASCADE;

CREATE TABLE parts_not_invoiced_data (
  id                        BIGSERIAL PRIMARY KEY,
  portal                    TEXT NOT NULL,
  dealer_code               TEXT NOT NULL,
  branch_label              TEXT NOT NULL,
  upload_session_id         UUID NOT NULL,
  uploaded_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  job_card_no               TEXT NOT NULL,
  jc_status                 TEXT,
  vehicle_reg_no            TEXT,
  chassis_no                TEXT,
  customer_name             TEXT,
  sr_assigned_to            TEXT,
  supervisor                TEXT,
  product_line              TEXT,
  parent_product_line       TEXT,
  sr_type                   TEXT,
  payment_type              TEXT,
  division                  TEXT,
  created_date              TIMESTAMPTZ,
  closed_date               TIMESTAMPTZ,
  completed_date            TIMESTAMPTZ,
  final_spares_amount       NUMERIC,
  final_labour_amount       NUMERIC,
  total_order_value         NUMERIC,
  total_invoice_amount      NUMERIC,
  invoiced                  TEXT,
  kms                       INTEGER,
  warranty                  TEXT,
  amc                       TEXT,
  delay_reason              TEXT,
  open_for_days             INTEGER,
  tracking_status           TEXT NOT NULL DEFAULT 'Pending',
  remarks                   TEXT,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pni_portal_idx   ON parts_not_invoiced_data(portal);
CREATE INDEX pni_session_idx  ON parts_not_invoiced_data(upload_session_id);
CREATE INDEX pni_jc_idx       ON parts_not_invoiced_data(job_card_no);
CREATE INDEX pni_reg_idx      ON parts_not_invoiced_data(vehicle_reg_no);
CREATE INDEX pni_uploaded_idx ON parts_not_invoiced_data(uploaded_at);

CREATE TABLE parts_not_invoiced_uploads (
  id                BIGSERIAL PRIMARY KEY,
  portal            TEXT NOT NULL,
  dealer_code       TEXT NOT NULL,
  branch_label      TEXT NOT NULL,
  upload_session_id UUID NOT NULL UNIQUE,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by_email TEXT,
  row_count         INTEGER NOT NULL DEFAULT 0,
  pending_count     INTEGER NOT NULL DEFAULT 0,
  file_name         TEXT
);

ALTER TABLE parts_not_invoiced_data    ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_not_invoiced_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON parts_not_invoiced_data    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "sel_rbac"  ON parts_not_invoiced_data    FOR SELECT TO authenticated USING (is_admin() OR has_module_view('parts_orders'));
CREATE POLICY "ins_rbac"  ON parts_not_invoiced_data    FOR INSERT TO authenticated WITH CHECK (is_admin() OR has_module_modify('parts_orders'));
CREATE POLICY "upd_rbac"  ON parts_not_invoiced_data    FOR UPDATE TO authenticated USING (is_admin() OR has_module_modify('parts_orders'));
CREATE POLICY "del_rbac"  ON parts_not_invoiced_data    FOR DELETE TO authenticated USING (is_admin() OR has_module_delete('parts_orders'));
CREATE POLICY "admin_all" ON parts_not_invoiced_uploads FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "sel_rbac"  ON parts_not_invoiced_uploads FOR SELECT TO authenticated USING (is_admin() OR has_module_view('parts_orders'));
CREATE POLICY "ins_rbac"  ON parts_not_invoiced_uploads FOR INSERT TO authenticated WITH CHECK (is_admin() OR has_module_modify('parts_orders'));
