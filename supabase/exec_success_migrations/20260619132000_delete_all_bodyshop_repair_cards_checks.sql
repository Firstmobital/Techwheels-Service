-- Read-only verification checks for:
-- 20260619132000_delete_all_bodyshop_repair_cards.sql

SELECT count(*) AS remaining_bodyshop_repair_cards
FROM public.bodyshop_repair_cards;

SELECT count(*) AS remaining_bodyshop_assignments
FROM public.bodyshop_assignments;

SELECT count(*) AS remaining_bodyshop_intake_vehicle_photos
FROM public.bodyshop_intake_vehicle_photos;

SELECT count(*) AS remaining_bodyshop_repair_card_documents
FROM public.bodyshop_repair_card_documents;
