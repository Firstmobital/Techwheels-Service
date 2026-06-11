-- ============================================================
-- SUPERSEDED MIGRATION (SUPABASE-002)
-- Original file: 20260610230000_bodyshop_repair_tracker.sql
-- Superseded on: 2026-06-11
--
-- Reason:
--   The original migration encoded a 7-table bodyshop model and legacy
--   module/permission contract that do not match the authoritative deployed
--   schema in local_folder/backups/full_database.sql.
--
-- Governance rule:
--   Keep this migration ID in history, but make it a deterministic no-op.
--   The corrective authoritative bodyshop migration is:
--     20260611170000_supabase_002_bodyshop_authoritative_alignment.sql
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '20260610230000_bodyshop_repair_tracker.sql is superseded by 20260611170000_supabase_002_bodyshop_authoritative_alignment.sql';
END
$$;
