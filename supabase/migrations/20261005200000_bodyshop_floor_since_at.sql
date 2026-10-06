-- When advisor sends vehicle to bodyshop floor (Floor 2 / Floor 3), record first entry time.
-- Age on floor is measured from this timestamp, not from role assignment.

ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS bodyshop_floor_since_at timestamptz;

COMMENT ON COLUMN public.bodyshop_repair_cards.bodyshop_floor_since_at IS
  'First time vehicle was sent to Floor 2/3 from Bodyshop Repair (advisor). Not reset on Floor 2↔3 change.';

CREATE OR REPLACE FUNCTION public.trg_bodyshop_repair_cards_floor_since_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_floor text;
  old_floor text;
BEGIN
  IF NEW.bodyshop_floor_since_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  new_floor := lower(trim(COALESCE(NEW.bodyshop_floor, '')));
  old_floor := lower(trim(COALESCE(OLD.bodyshop_floor, '')));

  IF new_floor IN ('floor 2', 'floor 3')
     AND old_floor NOT IN ('floor 2', 'floor 3') THEN
    NEW.bodyshop_floor_since_at := COALESCE(NEW.survay_info_updated_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bodyshop_repair_cards_floor_since_at ON public.bodyshop_repair_cards;

CREATE TRIGGER bodyshop_repair_cards_floor_since_at
  BEFORE INSERT OR UPDATE OF bodyshop_floor, bodyshop_floor_since_at, survay_info_updated_at
  ON public.bodyshop_repair_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_bodyshop_repair_cards_floor_since_at();

-- Backfill: vehicles already on a floor — use survey send timestamp when available.
UPDATE public.bodyshop_repair_cards
SET bodyshop_floor_since_at = COALESCE(survay_info_updated_at, updated_at)
WHERE bodyshop_floor_since_at IS NULL
  AND lower(trim(COALESCE(bodyshop_floor, ''))) IN ('floor 2', 'floor 3');
