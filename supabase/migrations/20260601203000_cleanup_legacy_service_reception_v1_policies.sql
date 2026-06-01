-- Migration: Cleanup legacy v1 policies on service_reception_entries
-- Purpose:
-- 1) Remove obsolete v1 policies that coexist with current RBAC policies.
-- 2) Prevent permissive OR-combination behavior across duplicate policies.
-- Date: 2026-06-01

BEGIN;

DROP POLICY IF EXISTS service_reception_select_v1 ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_insert_v1 ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_update_v1 ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_delete_v1 ON public.service_reception_entries;

COMMIT;
