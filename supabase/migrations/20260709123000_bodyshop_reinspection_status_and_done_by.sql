-- Bodyshop Re-Inspection (RI) floor stage support
-- Adds reinspection_status and expands reinspection_type for floor RI Done By options.
--
-- IMPORTANT: Drop the old reinspection_type check BEFORE rewriting values.
-- Old allowed values: team_member | surveyor
-- New allowed values: floor_incharge | surveyor | other
--
-- Rollback:
--   ALTER TABLE public.bodyshop_repair_cards DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_reinspection_status_check;
--   ALTER TABLE public.bodyshop_repair_cards DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_reinspection_type_check;
--   ALTER TABLE public.bodyshop_repair_cards DROP COLUMN IF NOT EXISTS reinspection_status;
--   UPDATE public.bodyshop_repair_cards SET reinspection_type = 'team_member' WHERE reinspection_type = 'floor_incharge';
--   UPDATE public.bodyshop_repair_cards SET reinspection_type = NULL WHERE reinspection_type = 'other';
--   ALTER TABLE public.bodyshop_repair_cards
--     ADD CONSTRAINT bodyshop_repair_cards_reinspection_type_check
--     CHECK (reinspection_type = ANY (ARRAY['team_member'::text, 'surveyor'::text]));

-- 1) Add RI status column (safe if already applied from a partial run)
ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS reinspection_status text DEFAULT 'pending'::text;

-- 2) Drop BOTH checks first so value rewrites cannot violate the old type check
ALTER TABLE public.bodyshop_repair_cards
  DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_reinspection_type_check;

ALTER TABLE public.bodyshop_repair_cards
  DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_reinspection_status_check;

-- 3) Migrate legacy type values (must happen AFTER the new type check is added)
UPDATE public.bodyshop_repair_cards
SET reinspection_type = 'floor_incharge'
WHERE lower(btrim(coalesce(reinspection_type, ''))) = 'team_member';

-- 4) Backfill status for existing rows
UPDATE public.bodyshop_repair_cards
SET reinspection_status = CASE
  WHEN reinspection_at IS NOT NULL THEN 'completed'
  ELSE 'pending'
END
WHERE reinspection_status IS NULL
   OR btrim(reinspection_status) = '';

-- 5) Replace type check: Floor Incharge / Surveyor / Other
ALTER TABLE public.bodyshop_repair_cards
  ADD CONSTRAINT bodyshop_repair_cards_reinspection_type_check
  CHECK (
    reinspection_type IS NULL
    OR reinspection_type = ANY (ARRAY[
      'floor_incharge'::text,
      'surveyor'::text,
      'other'::text
    ])
  );

-- 6) Status check: Pending / Completed
ALTER TABLE public.bodyshop_repair_cards
  ADD CONSTRAINT bodyshop_repair_cards_reinspection_status_check
  CHECK (reinspection_status = ANY (ARRAY['pending'::text, 'completed'::text]));

COMMENT ON COLUMN public.bodyshop_repair_cards.reinspection_status IS
  'Re-Inspection (RI) status on bodyshop floor: pending or completed.';

COMMENT ON COLUMN public.bodyshop_repair_cards.reinspection_type IS
  'RI Done By role: floor_incharge, surveyor, or other.';
