-- Quote document upload for insurance renewal telecalling (Quote Sent disposition)

ALTER TABLE public.insurance_renewal_assignments
  ADD COLUMN IF NOT EXISTS quote_drive_url text,
  ADD COLUMN IF NOT EXISTS quote_drive_file_id text,
  ADD COLUMN IF NOT EXISTS quote_storage_path text,
  ADD COLUMN IF NOT EXISTS quote_file_name text,
  ADD COLUMN IF NOT EXISTS quote_content_type text,
  ADD COLUMN IF NOT EXISTS quote_uploaded_at timestamptz;

COMMENT ON COLUMN public.insurance_renewal_assignments.quote_drive_url IS 'Google Drive URL for quote PDF/image sent to customer (universal-drive-upload).';
COMMENT ON COLUMN public.insurance_renewal_assignments.quote_drive_file_id IS 'Google Drive file id for uploaded quote.';
COMMENT ON COLUMN public.insurance_renewal_assignments.quote_storage_path IS 'Temporary Supabase storage path used before Drive offload.';
COMMENT ON COLUMN public.insurance_renewal_assignments.quote_file_name IS 'Original uploaded quote file name.';
COMMENT ON COLUMN public.insurance_renewal_assignments.quote_content_type IS 'MIME type of uploaded quote file.';
COMMENT ON COLUMN public.insurance_renewal_assignments.quote_uploaded_at IS 'When quote document was last uploaded.';
