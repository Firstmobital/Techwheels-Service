-- Guardrail: once a bodyshop card is linked to a reception row, prevent unlink/relink drift.
-- This complements FK ON DELETE RESTRICT and blocks manual UPDATE paths that can orphan cards.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_bodyshop_reception_link_drift()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.reception_entry_id IS NOT NULL THEN
    -- Block unlink of an already linked card.
    IF NEW.reception_entry_id IS NULL THEN
      RAISE EXCEPTION
        'Cannot set reception_entry_id to NULL for bodyshop_repair_cards.id=%; delete/close card with explicit workflow instead.',
        OLD.id;
    END IF;

    -- Block re-link to a different reception row.
    IF NEW.reception_entry_id IS DISTINCT FROM OLD.reception_entry_id THEN
      RAISE EXCEPTION
        'Cannot change reception_entry_id for bodyshop_repair_cards.id=% from % to %.',
        OLD.id, OLD.reception_entry_id, NEW.reception_entry_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_bodyshop_reception_link_drift
  ON public.bodyshop_repair_cards;

CREATE TRIGGER trg_prevent_bodyshop_reception_link_drift
BEFORE UPDATE OF reception_entry_id
ON public.bodyshop_repair_cards
FOR EACH ROW
EXECUTE FUNCTION public.prevent_bodyshop_reception_link_drift();

COMMIT;
