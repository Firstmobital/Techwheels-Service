-- Read-only verification checks for:
-- 20260619131000_relink_bodyshop_cards_with_clear_reception_match.sql

-- A) Remaining backlog after relink.
SELECT count(*) AS remaining_null_link_cards
FROM public.bodyshop_repair_cards
WHERE reception_entry_id IS NULL;

-- B) Show remaining null-link cards for manual review.
SELECT id, job_card_no, reg_number, location, portal, branch_label, created_at, updated_at
FROM public.bodyshop_repair_cards
WHERE reception_entry_id IS NULL
ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST;

-- C) Data integrity safety check: no non-null orphan references.
SELECT count(*) AS invalid_non_null_references
FROM public.bodyshop_repair_cards brc
LEFT JOIN public.service_reception_entries sre
  ON sre.id = brc.reception_entry_id
WHERE brc.reception_entry_id IS NOT NULL
  AND sre.id IS NULL;

-- D) Optional audit sample: recently relinked cards.
SELECT brc.id, brc.job_card_no, brc.reg_number, brc.reception_entry_id, brc.updated_at
FROM public.bodyshop_repair_cards brc
WHERE brc.updated_at >= now() - interval '1 day'
ORDER BY brc.updated_at DESC, brc.id DESC
LIMIT 100;
