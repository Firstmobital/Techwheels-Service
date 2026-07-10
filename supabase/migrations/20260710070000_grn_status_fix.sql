-- Fix grn_status generated column to respect the Excel 'status' field.
-- Previously: only checked sap_invoice_no presence → ALL rows with an invoice
--             were marked "GRN Received", even "In Transit" rows.
-- Now:
--   status = 'In Transit'              → 'In Transit'
--   sap_invoice_no present (non-blank) → 'GRN Received'
--   otherwise                          → 'GRN Pending'

ALTER TABLE grn_report_data
  DROP COLUMN grn_status;

ALTER TABLE grn_report_data
  ADD COLUMN grn_status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN LOWER(TRIM(COALESCE(status, ''))) = 'in transit'
        THEN 'In Transit'
      WHEN sap_invoice_no IS NOT NULL AND sap_invoice_no <> ''
        THEN 'GRN Received'
      ELSE 'GRN Pending'
    END
  ) STORED;
