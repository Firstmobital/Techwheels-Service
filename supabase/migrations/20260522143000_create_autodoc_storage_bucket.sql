-- Migration: Ensure AutoDoc storage bucket and RLS policies exist
-- Note: Run manually in Supabase SQL editor or migration pipeline.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'autodoc',
  'autodoc',
  false,
  157286400,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
    'video/mp4',
    'video/quicktime',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "autodoc objects: own dealer read" ON storage.objects;
CREATE POLICY "autodoc objects: own dealer read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'autodoc'
  AND split_part(name, '/', 1) = public.my_dealer_code()
);

DROP POLICY IF EXISTS "autodoc objects: own dealer insert" ON storage.objects;
CREATE POLICY "autodoc objects: own dealer insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'autodoc'
  AND split_part(name, '/', 1) = public.my_dealer_code()
);

DROP POLICY IF EXISTS "autodoc objects: own dealer update" ON storage.objects;
CREATE POLICY "autodoc objects: own dealer update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'autodoc'
  AND split_part(name, '/', 1) = public.my_dealer_code()
)
WITH CHECK (
  bucket_id = 'autodoc'
  AND split_part(name, '/', 1) = public.my_dealer_code()
);

DROP POLICY IF EXISTS "autodoc objects: own dealer delete" ON storage.objects;
CREATE POLICY "autodoc objects: own dealer delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'autodoc'
  AND split_part(name, '/', 1) = public.my_dealer_code()
);
