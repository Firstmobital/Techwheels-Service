-- ============================================================
-- SUPABASE-002 Phase 4.2/4.3 Rollback: Location + Portal semantics split
-- Created: 2026-06-11
-- Reverts migration:
--   20260611201500_supabase_002_location_portal_semantics_split.sql
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS idx_sre_location_portal;
DROP INDEX IF EXISTS idx_brc_location_portal;
DROP INDEX IF EXISTS idx_jccd_location_portal;

ALTER TABLE public.service_reception_entries
  DROP CONSTRAINT IF EXISTS service_reception_entries_portal_check;
ALTER TABLE public.bodyshop_repair_cards
  DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_portal_check;
ALTER TABLE public.job_card_closed_data
  DROP CONSTRAINT IF EXISTS job_card_closed_data_portal_check;

ALTER TABLE public.service_reception_entries
  DROP COLUMN IF EXISTS branch_label,
  DROP COLUMN IF EXISTS portal,
  DROP COLUMN IF EXISTS location;

ALTER TABLE public.bodyshop_repair_cards
  DROP COLUMN IF EXISTS branch_label,
  DROP COLUMN IF EXISTS portal,
  DROP COLUMN IF EXISTS location;

ALTER TABLE public.job_card_closed_data
  DROP COLUMN IF EXISTS branch_label,
  DROP COLUMN IF EXISTS portal,
  DROP COLUMN IF EXISTS location;

COMMIT;
