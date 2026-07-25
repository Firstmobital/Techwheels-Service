-- Verify quote upload columns exist (required for Quote Sent upload)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'insurance_renewal_assignments'
  AND column_name IN (
    'quote_drive_url',
    'quote_drive_file_id',
    'quote_storage_path',
    'quote_file_name',
    'quote_content_type',
    'quote_uploaded_at'
  )
ORDER BY column_name;
-- Expect 6 rows. If fewer, run: supabase/migrations/20260725104500_insurance_renewal_quote_upload.sql
