-- One-time cleanup: delete all records from public.bodyshop_repair_cards.
-- Note: child rows linked by repair_card_id cascade-delete by FK rules.

BEGIN;

WITH deleted AS (
  DELETE FROM public.bodyshop_repair_cards
  RETURNING id
)
SELECT count(*) AS deleted_bodyshop_repair_cards
FROM deleted;

COMMIT;
