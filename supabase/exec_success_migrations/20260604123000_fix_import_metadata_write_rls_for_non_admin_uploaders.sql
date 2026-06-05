-- Fix: allow all authenticated uploaders (including non-admin) to update public.import_metadata
-- Date: 2026-06-04
-- Problem:
--   import_metadata_write_admin_v1 allowed writes only for admins.
--   Non-admin users could import rows into allowed tables, but last_updated_at stayed unchanged.
--
-- Approach:
--   Replace admin-only write policy with authenticated INSERT/UPDATE policies.

ALTER TABLE public.import_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_metadata_write_admin_v1 ON public.import_metadata;
DROP POLICY IF EXISTS import_metadata_insert_rbac_v2 ON public.import_metadata;
DROP POLICY IF EXISTS import_metadata_update_rbac_v2 ON public.import_metadata;
DROP POLICY IF EXISTS import_metadata_insert_authenticated_v3 ON public.import_metadata;
DROP POLICY IF EXISTS import_metadata_update_authenticated_v3 ON public.import_metadata;

CREATE POLICY import_metadata_insert_authenticated_v3
ON public.import_metadata
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY import_metadata_update_authenticated_v3
ON public.import_metadata
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
