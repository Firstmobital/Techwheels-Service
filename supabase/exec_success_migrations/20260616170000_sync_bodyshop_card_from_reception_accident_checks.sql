-- Read-only checks for:
-- 20260616170000_sync_bodyshop_card_from_reception_accident.sql

-- 1) Trigger exists and is enabled.
select
  t.tgname as trigger_name,
  c.relname as table_name,
  t.tgenabled as enabled_state
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'service_reception_entries'
  and t.tgname = 'trg_sync_bodyshop_card_from_reception'
  and not t.tgisinternal;

-- 2) Function exists.
select
  p.proname as function_name,
  n.nspname as schema_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'sync_bodyshop_repair_card_from_reception';

-- 3) Drift check: Accident-linked bodyshop cards with SA mismatch.
select
  count(*) as sa_mismatch_count
from public.bodyshop_repair_cards brc
join public.service_reception_entries sre
  on sre.id = brc.reception_entry_id
where upper(trim(coalesce(sre.service_type, ''))) = 'ACCIDENT'
  and (
    coalesce(trim(brc.sa_employee_code), '') <> coalesce(trim(sre.sa_employee_code), '')
    or coalesce(trim(brc.sa_name), '') <> coalesce(trim(coalesce(nullif(sre.sa_display_name, ''), nullif(sre.sa_name, ''))), '')
  );

-- 4) Coverage: Accident reception rows that still have no bodyshop card.
select
  count(*) as accident_rows_without_bodyshop_card
from public.service_reception_entries sre
left join public.bodyshop_repair_cards brc
  on brc.reception_entry_id = sre.id
where upper(trim(coalesce(sre.service_type, ''))) = 'ACCIDENT'
  and brc.id is null;
