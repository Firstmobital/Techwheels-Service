-- ============================================================
-- SUPABASE-002 Phase 3 Rollback: Bodyshop RBAC + Grant Hardening
-- Created: 2026-06-11
-- Reverts migration: 20260611182000_supabase_002_bodyshop_rbac_grants_hardening.sql
-- ============================================================

BEGIN;

-- Restore original permissive bodyshop_assignments policies.
ALTER POLICY bodyshop_assignments_read
ON public.bodyshop_assignments
USING (true);

ALTER POLICY bodyshop_assignments_insert
ON public.bodyshop_assignments
WITH CHECK (true);

ALTER POLICY bodyshop_assignments_update
ON public.bodyshop_assignments
USING (true)
WITH CHECK (true);

-- Restore bodyshop_repair_cards policy to admin-only behavior.
ALTER POLICY admin_unrestricted_all_ops_v1
ON public.bodyshop_repair_cards
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Restore anon grants previously present in authoritative dump snapshot.
GRANT ALL ON TABLE public.bodyshop_assignments TO anon;
GRANT ALL ON TABLE public.bodyshop_repair_cards TO anon;
GRANT ALL ON SEQUENCE public.bodyshop_assignments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.bodyshop_repair_cards_id_seq TO anon;
GRANT ALL ON FUNCTION public.update_bodyshop_assignments_updated_at() TO anon;

COMMIT;
