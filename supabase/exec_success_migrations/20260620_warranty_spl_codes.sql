-- Create warranty SPL codes data table for 9800xx special charge codes
CREATE TABLE IF NOT EXISTS warranty_spl_codes_data (
  id BIGSERIAL PRIMARY KEY,
  dealer_code TEXT,
  portal TEXT,
  job_card_number TEXT,
  prowac_no TEXT,
  sap_claim TEXT,
  job_code TEXT,
  code_label TEXT,
  part_number TEXT,
  description TEXT,
  list_price NUMERIC DEFAULT 0,
  misc_chgs NUMERIC DEFAULT 0,
  labour_chgs NUMERIC DEFAULT 0,
  spl_labour_chgs NUMERIC DEFAULT 0,
  dealer_invc_no TEXT,
  invc_date DATE,
  posting_document_number TEXT,
  posting_date TEXT,
  hsn_code TEXT,
  sac_code TEXT,
  tml_reference_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spl_job_code ON warranty_spl_codes_data(job_code);
CREATE INDEX IF NOT EXISTS idx_spl_invc_date ON warranty_spl_codes_data(invc_date);
CREATE INDEX IF NOT EXISTS idx_spl_portal ON warranty_spl_codes_data(portal);

-- Enable RLS
ALTER TABLE warranty_spl_codes_data ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY IF NOT EXISTS "allow_read_spl_codes" ON warranty_spl_codes_data
  FOR SELECT TO authenticated USING (true);

-- Allow service role to insert
CREATE POLICY IF NOT EXISTS "allow_service_insert_spl_codes" ON warranty_spl_codes_data
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "allow_service_delete_spl_codes" ON warranty_spl_codes_data
  FOR DELETE TO service_role USING (true);
