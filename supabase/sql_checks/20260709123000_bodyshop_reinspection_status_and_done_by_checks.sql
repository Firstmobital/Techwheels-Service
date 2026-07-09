-- Read-only verification checks for:
-- supabase/migrations/20260709123000_bodyshop_reinspection_status_and_done_by.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) reinspection_status column exists with expected default/type
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bodyshop_repair_cards'
  AND column_name IN ('reinspection_status', 'reinspection_type', 'reinspection_by', 'reinspection_at')
ORDER BY column_name;

-- 2) Status + type check constraints present with expected allowed values
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.bodyshop_repair_cards'::regclass
  AND conname IN (
    'bodyshop_repair_cards_reinspection_status_check',
    'bodyshop_repair_cards_reinspection_type_check'
  )
ORDER BY conname;

-- 3) No legacy team_member values remain
SELECT COUNT(*) AS legacy_team_member_count
FROM public.bodyshop_repair_cards
WHERE lower(btrim(coalesce(reinspection_type, ''))) = 'team_member';

-- 4) Status values are only pending/completed (or null before backfill — should be 0 after migration)
SELECT reinspection_status, COUNT(*) AS row_count
FROM public.bodyshop_repair_cards
GROUP BY reinspection_status
ORDER BY reinspection_status NULLS FIRST;
