-- Prevent orphan bodyshop cards when a reception row is deleted.
-- Change FK behavior from ON DELETE SET NULL to ON DELETE RESTRICT.

BEGIN;

ALTER TABLE public.bodyshop_repair_cards
  DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_reception_entry_fk;

ALTER TABLE public.bodyshop_repair_cards
  ADD CONSTRAINT bodyshop_repair_cards_reception_entry_fk
  FOREIGN KEY (reception_entry_id)
  REFERENCES public.service_reception_entries(id)
  ON DELETE RESTRICT;

COMMIT;
