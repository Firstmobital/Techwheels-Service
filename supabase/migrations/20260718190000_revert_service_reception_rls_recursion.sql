-- EMERGENCY REVERT: restore service_reception_entries SELECT policies to authoritative state.
--
-- Root cause of production outage (PostgreSQL 42P17):
--   20260718170000 added service_reception_select_bodyshop_card_sa_v1 which SELECTs
--   bodyshop_repair_cards inside a service_reception_entries policy. bodyshop_repair_cards
--   SELECT policy already references service_reception_entries → infinite RLS recursion.
--
-- Authoritative source (full_database.sql / full_metadata.sql) has ONLY these 5 SELECT policies:
--   service_reception_select_sa
--   service_reception_select_rbac
--   service_reception_select_floor_incharge
--   service_reception_select_crm_dealer_scope
--   service_reception_select_bodyshop_floor_incharge_v1
--
-- Do NOT re-add cross-table RLS EXISTS between these two tables without SECURITY DEFINER helpers.

DROP POLICY IF EXISTS service_reception_select_bodyshop_card_sa_v1 ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_select_sa_modify_v1 ON public.service_reception_entries;
