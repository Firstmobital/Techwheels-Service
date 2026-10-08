-- A vehicle cannot be placed on Floor 2 or Floor 3 until the customer
-- has approved the survey document. Cars already on a floor are left as-is.
-- Cash / non-survey visits (no survey approval doc and no customer decision) are unchanged.

CREATE OR REPLACE FUNCTION public.bodyshop_block_floor_until_customer_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_floor text := btrim(COALESCE(NEW.bodyshop_floor, ''));
  v_old_floor text := btrim(COALESCE(OLD.bodyshop_floor, ''));
  v_customer text := lower(btrim(COALESCE(NEW.customer_survey_approval_status, '')));
  v_survey text := lower(btrim(COALESCE(NEW.survey_status, '')));
  v_has_doc boolean := false;
BEGIN
  IF v_new_floor NOT IN ('Floor 2', 'Floor 3') THEN
    RETURN NEW;
  END IF;

  IF v_new_floor = v_old_floor THEN
    RETURN NEW;
  END IF;

  IF v_customer = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.bodyshop_repair_card_documents d
    WHERE d.repair_card_id = NEW.id
      AND d.doc_key = 'doc_survey_approval'
  ) INTO v_has_doc;

  IF v_has_doc OR v_survey = 'approved' OR v_customer IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'Customer must approve the survey document before this vehicle can go to the floor'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bodyshop_block_floor_until_customer_approved ON public.bodyshop_repair_cards;

CREATE TRIGGER bodyshop_block_floor_until_customer_approved
  BEFORE UPDATE OF bodyshop_floor ON public.bodyshop_repair_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.bodyshop_block_floor_until_customer_approved();
