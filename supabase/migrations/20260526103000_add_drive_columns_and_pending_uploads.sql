BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.documents') IS NULL THEN
    RAISE EXCEPTION 'public.documents not found. Authoritative full_database.sql defines documents under public schema. Run this migration against the Techwheels project/database matching that dump.';
  END IF;

  ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS drive_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS drive_file_id TEXT DEFAULT NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.pending_drive_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL,
  resource_id UUID NULL,
  job_card_id UUID NOT NULL,
  doc_type TEXT NULL,
  registration_no TEXT NULL,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  drive_file_id TEXT NULL,
  drive_url TEXT NULL,
  status TEXT NOT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_drive_uploads_job_card_id
  ON public.pending_drive_uploads (job_card_id);

CREATE INDEX IF NOT EXISTS idx_pending_drive_uploads_status
  ON public.pending_drive_uploads (status);

CREATE INDEX IF NOT EXISTS idx_pending_drive_uploads_created_at
  ON public.pending_drive_uploads (created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_pending_drive_uploads_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pending_drive_uploads_touch_updated_at ON public.pending_drive_uploads;
CREATE TRIGGER pending_drive_uploads_touch_updated_at
BEFORE UPDATE ON public.pending_drive_uploads
FOR EACH ROW
EXECUTE FUNCTION public.touch_pending_drive_uploads_updated_at();

COMMIT;
