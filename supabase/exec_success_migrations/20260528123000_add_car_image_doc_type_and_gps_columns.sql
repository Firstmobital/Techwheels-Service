-- Add Car Image support for AutoDoc vehicle lookup gate.
-- Authoritative baseline: local_folder/backups/full_database.sql
-- Changes:
-- 1) Add new documents.doc_type enum value: car_image
-- 2) Add GPS metadata columns to documents for stamped car image auditability

BEGIN;

ALTER TYPE public.doc_type
ADD VALUE IF NOT EXISTS 'car_image';

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS gps_city TEXT,
ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;

ALTER TABLE public.documents
DROP CONSTRAINT IF EXISTS documents_gps_lat_check;

ALTER TABLE public.documents
ADD CONSTRAINT documents_gps_lat_check
CHECK (gps_lat IS NULL OR (gps_lat >= -90 AND gps_lat <= 90));

ALTER TABLE public.documents
DROP CONSTRAINT IF EXISTS documents_gps_lng_check;

ALTER TABLE public.documents
ADD CONSTRAINT documents_gps_lng_check
CHECK (gps_lng IS NULL OR (gps_lng >= -180 AND gps_lng <= 180));

COMMENT ON COLUMN public.documents.gps_lat IS 'Latitude captured when document photo was taken/uploaded (used for car_image).';
COMMENT ON COLUMN public.documents.gps_lng IS 'Longitude captured when document photo was taken/uploaded (used for car_image).';
COMMENT ON COLUMN public.documents.gps_city IS 'City name resolved from GPS coordinates at capture time (used for car_image).';
COMMENT ON COLUMN public.documents.captured_at IS 'Timestamp when the media was captured with GPS metadata (used for car_image).';

COMMIT;
