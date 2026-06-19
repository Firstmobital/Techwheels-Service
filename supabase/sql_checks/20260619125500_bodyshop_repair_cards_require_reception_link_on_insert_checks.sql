-- Read-only verification checks for:
-- 20260619125500_bodyshop_repair_cards_require_reception_link_on_insert.sql

-- 1) Function exists.
SELECT n.nspname AS schema_name, p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'enforce_bodyshop_reception_link_on_insert';

-- 2) Trigger exists on bodyshop_repair_cards and is enabled.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.bodyshop_repair_cards'::regclass
  AND tgname = 'trg_enforce_bodyshop_reception_link_on_insert'
  AND NOT tgisinternal;

-- 3) Hygiene metric (historical backlog only): existing cards with null reception link.
SELECT count(*) AS existing_null_link_cards
FROM public.bodyshop_repair_cards
WHERE reception_entry_id IS NULL;
