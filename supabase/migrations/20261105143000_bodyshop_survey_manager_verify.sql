-- Bodyshop manager verify gate between customer survey approval and physical floor.

ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS bodyshop_survey_manager_verify_status text,
  ADD COLUMN IF NOT EXISTS bodyshop_survey_manager_verified_by text,
  ADD COLUMN IF NOT EXISTS bodyshop_survey_manager_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS bodyshop_survey_manager_verify_remark text;

ALTER TABLE public.bodyshop_repair_cards
  DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_survey_manager_verify_status_check;

ALTER TABLE public.bodyshop_repair_cards
  ADD CONSTRAINT bodyshop_repair_cards_survey_manager_verify_status_check
  CHECK (
    bodyshop_survey_manager_verify_status IS NULL
    OR bodyshop_survey_manager_verify_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])
  );

COMMENT ON COLUMN public.bodyshop_repair_cards.bodyshop_survey_manager_verify_status IS
  'Bodyshop manager survey-to-floor gate: pending | verified | rejected. Required before Floor 2/3 assignment (except grandfathered cards already on floor).';

-- Vehicles already on a physical floor are treated as verified.
UPDATE public.bodyshop_repair_cards b
SET
  bodyshop_survey_manager_verify_status = 'verified',
  bodyshop_survey_manager_verified_at = COALESCE(b.bodyshop_floor_since_at, b.updated_at, b.created_at, now())
WHERE lower(trim(COALESCE(b.bodyshop_floor, ''))) IN ('floor 2', 'floor 3')
  AND b.bodyshop_survey_manager_verify_status IS NULL;

CREATE OR REPLACE FUNCTION public.bodyshop_repair_cards_survey_manager_verify_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_survey_approval_status IS DISTINCT FROM OLD.customer_survey_approval_status THEN
    IF lower(trim(COALESCE(NEW.customer_survey_approval_status, ''))) = 'approved'
       AND lower(trim(COALESCE(NEW.bodyshop_floor, ''))) NOT IN ('floor 2', 'floor 3')
       AND NEW.bodyshop_survey_manager_verify_status IS NULL THEN
      NEW.bodyshop_survey_manager_verify_status := 'pending';
    ELSIF lower(trim(COALESCE(NEW.customer_survey_approval_status, ''))) <> 'approved' THEN
      NEW.bodyshop_survey_manager_verify_status := NULL;
      NEW.bodyshop_survey_manager_verified_by := NULL;
      NEW.bodyshop_survey_manager_verified_at := NULL;
      NEW.bodyshop_survey_manager_verify_remark := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bodyshop_repair_cards_survey_manager_verify_trg ON public.bodyshop_repair_cards;

CREATE TRIGGER bodyshop_repair_cards_survey_manager_verify_trg
  BEFORE UPDATE OF customer_survey_approval_status, bodyshop_survey_manager_verify_status
  ON public.bodyshop_repair_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.bodyshop_repair_cards_survey_manager_verify_trg();
