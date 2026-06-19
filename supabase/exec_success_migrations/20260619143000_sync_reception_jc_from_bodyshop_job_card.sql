-- Keep service_reception_entries.jc_number in sync when bodyshop job_card_no is corrected.
-- Direction: bodyshop_repair_cards -> service_reception_entries

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_reception_jc_from_bodyshop_job_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_jc text;
BEGIN
  -- Only act when row is linked to reception.
  IF NEW.reception_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_new_jc := upper(trim(coalesce(NEW.job_card_no, '')));
  IF v_new_jc = '' THEN
    RETURN NEW;
  END IF;

  -- Mirror the existing app/database rule for valid JC format minimum length.
  IF length(v_new_jc) < 25 THEN
    RETURN NEW;
  END IF;

  UPDATE public.service_reception_entries sre
  SET jc_number = v_new_jc,
      updated_at = now()
  WHERE sre.id = NEW.reception_entry_id
    AND upper(trim(coalesce(sre.jc_number, ''))) IS DISTINCT FROM v_new_jc;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reception_jc_from_bodyshop_job_card
  ON public.bodyshop_repair_cards;

CREATE TRIGGER trg_sync_reception_jc_from_bodyshop_job_card
AFTER INSERT OR UPDATE OF job_card_no, reception_entry_id
ON public.bodyshop_repair_cards
FOR EACH ROW
EXECUTE FUNCTION public.sync_reception_jc_from_bodyshop_job_card();

COMMIT;
