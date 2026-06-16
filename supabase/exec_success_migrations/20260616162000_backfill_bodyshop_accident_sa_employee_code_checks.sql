-- Read-only verification for:
-- 20260616162000_backfill_bodyshop_accident_sa_employee_code.sql

-- 1) Accident reception rows still missing sa_employee_code (should drop).
select
  count(*) as accident_rows_missing_sa_code
from public.service_reception_entries
where service_type = 'Accident'
  and coalesce(trim(sa_employee_code), '') = '';

-- 2) Breakdown by SA label for remaining missing rows (should ideally be 0 rows).
select
  coalesce(nullif(trim(sa_display_name), ''), nullif(trim(sa_name), ''), 'UNKNOWN') as sa_label,
  count(*) as missing_count
from public.service_reception_entries
where service_type = 'Accident'
  and coalesce(trim(sa_employee_code), '') = ''
group by 1
order by missing_count desc, sa_label;

-- 3) Bodyshop cards linked to Accident reception rows with missing/mismatched SA code (should be 0 rows).
select
  count(*) as bodyshop_cards_with_sa_mismatch
from public.bodyshop_repair_cards brc
join public.service_reception_entries sre
  on sre.id = brc.reception_entry_id
where sre.service_type = 'Accident'
  and (
    coalesce(trim(brc.sa_employee_code), '') = ''
    or coalesce(trim(brc.sa_employee_code), '') <> coalesce(trim(sre.sa_employee_code), '')
  );

-- 4) Quick advisor distribution for BODY SHOP SA in bodyshop cards.
select
  coalesce(nullif(trim(brc.sa_name), ''), 'UNKNOWN') as sa_name,
  coalesce(nullif(trim(brc.sa_employee_code), ''), 'NO_CODE') as sa_code,
  count(*) as card_count
from public.bodyshop_repair_cards brc
group by 1, 2
order by card_count desc, sa_name;
