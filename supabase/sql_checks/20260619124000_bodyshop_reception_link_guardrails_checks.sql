-- Read-only verification checks for:
-- 20260619124000_bodyshop_reception_link_guardrails.sql

-- 1) Function exists.
SELECT n.nspname AS schema_name, p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'prevent_bodyshop_reception_link_drift';

-- 2) Trigger exists on bodyshop_repair_cards and is enabled.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.bodyshop_repair_cards'::regclass
  AND tgname = 'trg_prevent_bodyshop_reception_link_drift'
  AND NOT tgisinternal;

-- 3) Ongoing hygiene signal: cards currently not linked to reception.
SELECT id, job_card_no, reg_number, reception_entry_id, created_at, updated_at
FROM public.bodyshop_repair_cards
WHERE reception_entry_id IS NULL
ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST;
