-- Add invoice upload fields to service_reception_entries
-- Mirrors the estimate upload fields to allow Service Advisors to upload invoices

ALTER TABLE public.service_reception_entries 
ADD COLUMN invoice_storage_path text,
ADD COLUMN invoice_file_name text,
ADD COLUMN invoice_content_type text,
ADD COLUMN invoice_uploaded_at timestamp with time zone,
ADD COLUMN invoice_uploaded_by text,
ADD COLUMN invoice_drive_url text,
ADD COLUMN invoice_drive_file_id text;

COMMENT ON COLUMN public.service_reception_entries.invoice_storage_path IS 'Storage path for uploaded invoice document (in Supabase storage)';
COMMENT ON COLUMN public.service_reception_entries.invoice_file_name IS 'Original filename of uploaded invoice';
COMMENT ON COLUMN public.service_reception_entries.invoice_content_type IS 'MIME type of uploaded invoice file';
COMMENT ON COLUMN public.service_reception_entries.invoice_uploaded_at IS 'Timestamp when invoice was uploaded';
COMMENT ON COLUMN public.service_reception_entries.invoice_uploaded_by IS 'Email/ID of user who uploaded the invoice';
COMMENT ON COLUMN public.service_reception_entries.invoice_drive_url IS 'Google Drive URL if invoice was synced to Drive';
COMMENT ON COLUMN public.service_reception_entries.invoice_drive_file_id IS 'Google Drive file ID if invoice was synced to Drive';
