-- Read-only verification checks for:
-- 20260619134000_reset_bodyshop_and_accident_reception_clean_slate.sql

SELECT count(*) AS remaining_bodyshop_repair_cards
FROM public.bodyshop_repair_cards;

SELECT count(*) AS remaining_bodyshop_assignments
FROM public.bodyshop_assignments;

SELECT count(*) AS remaining_bodyshop_intake_vehicle_photos
FROM public.bodyshop_intake_vehicle_photos;

SELECT count(*) AS remaining_bodyshop_repair_card_documents
FROM public.bodyshop_repair_card_documents;

SELECT count(*) AS remaining_complaint_access_links_for_accident
FROM public.complaint_access_links cal
JOIN public.service_reception_entries s
  ON s.id = cal.reception_entry_id
WHERE upper(trim(coalesce(s.service_type, ''))) = 'ACCIDENT';

SELECT count(*) AS remaining_complaint_tickets_for_accident
FROM public.complaint_tickets ct
JOIN public.service_reception_entries s
  ON s.id = ct.reception_entry_id
WHERE upper(trim(coalesce(s.service_type, ''))) = 'ACCIDENT';

SELECT count(*) AS remaining_accident_reception_rows
FROM public.service_reception_entries s
WHERE upper(trim(coalesce(s.service_type, ''))) = 'ACCIDENT';

SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.service_reception_entries'::regclass
  AND tgname = 'trg_sync_bodyshop_card_from_reception'
  AND NOT tgisinternal;
