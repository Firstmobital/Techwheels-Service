CREATE TABLE IF NOT EXISTS grn_report_data (
  id BIGSERIAL PRIMARY KEY,
  portal TEXT NOT NULL,
  branch TEXT NOT NULL,
  upload_session_id UUID NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sap_invoice_no TEXT,
  order_no TEXT,
  transaction_number TEXT,
  part_no TEXT,
  invoice_date TEXT,
  status TEXT,
  warehouse_name TEXT,
  commit_flag TEXT,
  recd_qty INTEGER,
  spares_order_type TEXT,
  condition TEXT,
  transaction_date TEXT,
  vendor_invoice_no TEXT,
  discount_amount TEXT,
  net_amount TEXT,
  other_charges_amount TEXT,
  total_invoice_amount TEXT,
  vendor_name TEXT,
  payer_code TEXT,
  sap_order_num TEXT,
  irn TEXT,
  irn_date TEXT,
  gst_invoice_no TEXT,
  tcs_amount TEXT,
  lr_docket_no TEXT,
  challan_no TEXT,
  challan_date TEXT,
  challan_qty INTEGER,
  purchase_order_date TEXT,
  division_name TEXT,
  order_type TEXT,
  movement_type TEXT,
  cgst TEXT,
  igst TEXT,
  sgst TEXT,
  line_item_invoice_total TEXT,
  weighted_avg TEXT,
  source TEXT,
  grn_status TEXT GENERATED ALWAYS AS (
    CASE WHEN sap_invoice_no IS NOT NULL AND sap_invoice_no <> ''
    THEN 'GRN Received' ELSE 'GRN Pending' END
  ) STORED
);

CREATE INDEX IF NOT EXISTS grn_report_data_portal_idx ON grn_report_data(portal);
CREATE INDEX IF NOT EXISTS grn_report_data_session_idx ON grn_report_data(upload_session_id);
CREATE INDEX IF NOT EXISTS grn_report_data_part_no_idx ON grn_report_data(part_no);
CREATE INDEX IF NOT EXISTS grn_report_data_sap_inv_idx ON grn_report_data(sap_invoice_no);

CREATE TABLE IF NOT EXISTS grn_upload_history (
  id BIGSERIAL PRIMARY KEY,
  portal TEXT NOT NULL,
  branch TEXT NOT NULL,
  upload_session_id UUID NOT NULL UNIQUE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by_user_id UUID,
  uploaded_by_name TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  file_name TEXT
);

ALTER TABLE grn_report_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_upload_history ENABLE ROW LEVEL SECURITY;
