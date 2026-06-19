-- Clean-slate reset for Bodyshop + Accident reception pipeline.
-- Purpose:
-- 1) Remove all bodyshop tracker data (cards + related tables)
-- 2) Remove all Accident reception rows
-- 3) Keep trigger wiring so future Accident reception inserts recreate bodyshop cards automatically

BEGIN;

-- Safety guard: ensure sync trigger exists before reset so fresh inserts will repopulate bodyshop cards.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.service_reception_entries'::regclass
      AND t.tgname = 'trg_sync_bodyshop_card_from_reception'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Missing trigger trg_sync_bodyshop_card_from_reception on public.service_reception_entries';
  END IF;
END
$$;

WITH
  accident_ids AS (
    SELECT s.id
    FROM public.service_reception_entries s
    WHERE upper(trim(coalesce(s.service_type, ''))) = 'ACCIDENT'
  ),
  del_complaint_access_links AS (
    DELETE FROM public.complaint_access_links cal
    USING accident_ids a
    WHERE cal.reception_entry_id = a.id
    RETURNING 1
  ),
  del_complaint_tickets AS (
    DELETE FROM public.complaint_tickets ct
    USING accident_ids a
    WHERE ct.reception_entry_id = a.id
    RETURNING 1
  ),
  del_assignments AS (
    DELETE FROM public.bodyshop_assignments
    RETURNING 1
  ),
  del_photos AS (
    DELETE FROM public.bodyshop_intake_vehicle_photos
    RETURNING 1
  ),
  del_docs AS (
    DELETE FROM public.bodyshop_repair_card_documents
    RETURNING 1
  ),
  del_cards AS (
    DELETE FROM public.bodyshop_repair_cards
    RETURNING 1
  ),
  del_accident_reception AS (
    DELETE FROM public.service_reception_entries s
    USING accident_ids a
    WHERE s.id = a.id
    RETURNING 1
  )
SELECT
  (SELECT count(*) FROM del_complaint_access_links) AS deleted_complaint_access_links,
  (SELECT count(*) FROM del_complaint_tickets) AS deleted_complaint_tickets,
  (SELECT count(*) FROM del_assignments) AS deleted_bodyshop_assignments,
  (SELECT count(*) FROM del_photos) AS deleted_bodyshop_intake_vehicle_photos,
  (SELECT count(*) FROM del_docs) AS deleted_bodyshop_repair_card_documents,
  (SELECT count(*) FROM del_cards) AS deleted_bodyshop_repair_cards,
  (SELECT count(*) FROM del_accident_reception) AS deleted_accident_reception_rows;

COMMIT;
