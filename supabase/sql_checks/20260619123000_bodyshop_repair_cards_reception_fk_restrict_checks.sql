-- Read-only verification checks for:
-- 20260619123000_bodyshop_repair_cards_reception_fk_restrict.sql

-- 1) Confirm delete policy is now RESTRICT/NO ACTION.
SELECT
  c.conname,
  c.confdeltype,
  CASE c.confdeltype
    WHEN 'a' THEN 'NO ACTION/RESTRICT'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE c.confdeltype::text
  END AS delete_rule
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'bodyshop_repair_cards'
  AND c.conname = 'bodyshop_repair_cards_reception_entry_fk';

-- 2) Confirm there are no invalid non-null references.
SELECT count(*) AS invalid_non_null_references
FROM public.bodyshop_repair_cards brc
LEFT JOIN public.service_reception_entries sre
  ON sre.id = brc.reception_entry_id
WHERE brc.reception_entry_id IS NOT NULL
  AND sre.id IS NULL;

-- 3) Optional: list currently orphaned bodyshop cards created historically (reception_entry_id is null).
SELECT id, job_card_no, reg_number, reception_entry_id, created_at, updated_at
FROM public.bodyshop_repair_cards
WHERE reception_entry_id IS NULL
ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST;
