-- JC Closed but Invoiced Module
-- Upload history
CREATE TABLE IF NOT EXISTS jc_closed_invoiced_uploads (
  id                  bigserial PRIMARY KEY,
  portal              text NOT NULL,           -- 'EV' | 'PV'
  dealer_code         text NOT NULL,           -- '500A840' | '3000840' | '3001440'
  branch_label        text NOT NULL,           -- 'SITAPURA' | 'AJMER ROAD'
  upload_session_id   text NOT NULL,
  uploaded_at         timestamptz DEFAULT now(),
  uploaded_by_email   text,
  row_count           int,
  invoiced_count      int,
  file_name           text
);

-- Main data table
CREATE TABLE IF NOT EXISTS jc_closed_invoiced_data (
  id                    bigserial PRIMARY KEY,
  portal                text NOT NULL,
  dealer_code           text NOT NULL,
  branch_label          text NOT NULL,
  upload_session_id     text NOT NULL,
  
  -- Job card identifiers
  job_card_no           text,
  jc_status             text,
  vehicle_reg_no        text,
  chassis_no            text,
  
  -- Customer
  customer_name         text,
  contact_phone         text,
  account               text,
  
  -- Advisor / Supervisor
  sr_assigned_to        text,
  supervisor            text,
  
  -- Vehicle
  product_line          text,
  parent_product_line   text,
  sr_type               text,
  payment_type          text,
  division              text,
  kms                   int,
  warranty              text,
  amc                   text,
  invoice_format        text,
  
  -- Financials (stored as numeric)
  final_labour_amount   numeric(14,2),
  final_spares_amount   numeric(14,2),
  total_invoice_amount  numeric(14,2),
  total_order_value     numeric(14,2),
  
  -- Status flags
  invoiced              text,
  parts_entry_complete  text,
  jobs_entry_complete   text,
  
  -- Dates
  created_date          timestamptz,
  closed_date           timestamptz,
  completed_date        timestamptz,
  
  -- Misc
  delay_reason          text,
  open_for_days         int,
  
  created_at            timestamptz DEFAULT now()
);

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_jci_portal        ON jc_closed_invoiced_data(portal);
CREATE INDEX IF NOT EXISTS idx_jci_dealer        ON jc_closed_invoiced_data(dealer_code);
CREATE INDEX IF NOT EXISTS idx_jci_session       ON jc_closed_invoiced_data(upload_session_id);
CREATE INDEX IF NOT EXISTS idx_jci_advisor       ON jc_closed_invoiced_data(sr_assigned_to);
CREATE INDEX IF NOT EXISTS idx_jci_closed_date   ON jc_closed_invoiced_data(closed_date);
CREATE INDEX IF NOT EXISTS idx_jci_invoiced      ON jc_closed_invoiced_data(invoiced);

-- RLS
ALTER TABLE jc_closed_invoiced_data    ENABLE ROW LEVEL SECURITY;
ALTER TABLE jc_closed_invoiced_uploads ENABLE ROW LEVEL SECURITY;

-- Admin unrestricted
CREATE POLICY "admin_all_jci_data"    ON jc_closed_invoiced_data    FOR ALL USING (is_admin());
CREATE POLICY "admin_all_jci_uploads" ON jc_closed_invoiced_uploads FOR ALL USING (is_admin());

-- RBAC view (using parts_orders module same as GRN/PNI)
CREATE POLICY "rbac_view_jci_data"    ON jc_closed_invoiced_data    FOR SELECT
  USING (is_admin() OR has_module_view('parts_orders'::text));
CREATE POLICY "rbac_view_jci_uploads" ON jc_closed_invoiced_uploads FOR SELECT
  USING (is_admin() OR has_module_view('parts_orders'::text));
CREATE POLICY "rbac_insert_jci_data"  ON jc_closed_invoiced_data    FOR INSERT
  WITH CHECK (is_admin() OR has_module_view('parts_orders'::text));
CREATE POLICY "rbac_insert_jci_uploads" ON jc_closed_invoiced_uploads FOR INSERT
  WITH CHECK (is_admin() OR has_module_view('parts_orders'::text));
CREATE POLICY "rbac_delete_jci_data"  ON jc_closed_invoiced_data    FOR DELETE
  USING (is_admin() OR has_module_view('parts_orders'::text));
