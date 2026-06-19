-- Guardrail: block creation of new bodyshop repair cards without reception linkage.
-- Keeps existing historical NULL rows untouched until manually cleaned.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_bodyshop_reception_link_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reception_entry_id IS NULL THEN
    RAISE EXCEPTION
      'reception_entry_id is required when creating bodyshop_repair_cards (id=%).',
      COALESCE(NEW.id, -1);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_bodyshop_reception_link_on_insert
  ON public.bodyshop_repair_cards;

CREATE TRIGGER trg_enforce_bodyshop_reception_link_on_insert
BEFORE INSERT
ON public.bodyshop_repair_cards
FOR EACH ROW
EXECUTE FUNCTION public.enforce_bodyshop_reception_link_on_insert();

COMMIT;
