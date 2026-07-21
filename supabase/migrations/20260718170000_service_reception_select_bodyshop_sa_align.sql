-- NO-OP (intentionally empty except guard).
--
-- ORIGINAL CONTENT REMOVED: created service_reception_select_bodyshop_card_sa_v1 with
-- EXISTS (bodyshop_repair_cards …) inside service_reception_entries RLS → PostgreSQL 42P17
-- infinite recursion with bodyshop_repair_cards SELECT policies (production outage, Jul 2026).
--
-- Do NOT re-add that policy. Safe bodyshop SA read paths live in:
--   20260718200000_bodyshop_reception_sa_intake_read_safe.sql (SECURITY DEFINER helper)
--
-- Emergency revert (drops bad policy if it exists):
--   20260718190000_revert_service_reception_rls_recursion.sql

DROP POLICY IF EXISTS service_reception_select_bodyshop_card_sa_v1 ON public.service_reception_entries;
