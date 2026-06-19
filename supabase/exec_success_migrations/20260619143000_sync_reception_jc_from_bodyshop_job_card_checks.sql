-- Read-only verification checks for:
-- 20260619143000_sync_reception_jc_from_bodyshop_job_card.sql

-- 1) Function exists.
SELECT n.nspname AS schema_name, p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'sync_reception_jc_from_bodyshop_job_card';

-- 2) Trigger exists and is enabled.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.bodyshop_repair_cards'::regclass
  AND tgname = 'trg_sync_reception_jc_from_bodyshop_job_card'
  AND NOT tgisinternal;

-- 3) Drift audit: linked rows where reception jc_number differs from bodyshop job_card_no.
SELECT
  brc.id AS bodyshop_id,
  brc.reception_entry_id,
  brc.job_card_no AS bodyshop_job_card_no,
  sre.jc_number AS reception_jc_number,
  brc.updated_at AS bodyshop_updated_at,
  sre.updated_at AS reception_updated_at
FROM public.bodyshop_repair_cards brc
JOIN public.service_reception_entries sre
  ON sre.id = brc.reception_entry_id
WHERE brc.reception_entry_id IS NOT NULL
  AND upper(trim(coalesce(brc.job_card_no, ''))) <> ''
  AND length(upper(trim(coalesce(brc.job_card_no, '')))) >= 25
  AND upper(trim(coalesce(sre.jc_number, ''))) IS DISTINCT FROM upper(trim(coalesce(brc.job_card_no, '')))
ORDER BY brc.updated_at DESC NULLS LAST, brc.id DESC;
