-- Read-only diagnostic for:
-- SA page shows Accident rows, but Bodyshop Repair shows 0 cards.
-- Run as the same logged-in user/session context where issue reproduces.

-- 1) Current user business scope and role tokens used by Bodyshop Repair page.
select
  s.employee_code,
  s.department,
  s.role,
  s.location,
  s.fuel_type
from public.get_my_bodyshop_employee_scope() s
order by s.employee_code;

-- 2) Current user's module permissions (view/modify) relevant to card auto-create path.
select
  p.module_name,
  p.can_view,
  p.can_modify,
  p.can_delete
from public.get_all_my_permissions() p
where p.module_name in (
  'service_advisor',
  'reception',
  'bodyshop_repair',
  'bodyshop_floor',
  'bodyshop_tracker'
)
order by p.module_name;

-- 3) Visible Accident reception rows in current month (same page period default).
-- Adjust date window if needed.
with accident_rows as (
  select
    sre.id,
    sre.created_at,
    sre.dealer_code,
    sre.branch,
    sre.service_type,
    sre.sa_employee_code,
    coalesce(nullif(trim(sre.sa_display_name), ''), nullif(trim(sre.sa_name), '')) as sa_name,
    upper(trim(coalesce(nullif(sre.jc_number, ''), nullif(sre.reg_number, '')))) as intake_key
  from public.service_reception_entries sre
  where upper(trim(coalesce(sre.service_type, ''))) = 'ACCIDENT'
    and sre.created_at >= date_trunc('month', now())
    and sre.created_at < date_trunc('month', now()) + interval '1 month'
)
select *
from accident_rows
order by created_at desc;

-- 4) For those Accident rows, show whether bodyshop card exists and mapped SA fields.
with accident_rows as (
  select
    sre.id,
    sre.created_at,
    sre.dealer_code,
    sre.branch,
    sre.sa_employee_code,
    coalesce(nullif(trim(sre.sa_display_name), ''), nullif(trim(sre.sa_name), '')) as sa_name,
    upper(trim(coalesce(nullif(sre.jc_number, ''), nullif(sre.reg_number, '')))) as intake_key
  from public.service_reception_entries sre
  where upper(trim(coalesce(sre.service_type, ''))) = 'ACCIDENT'
    and sre.created_at >= date_trunc('month', now())
    and sre.created_at < date_trunc('month', now()) + interval '1 month'
)
select
  a.id as reception_entry_id,
  a.created_at as reception_created_at,
  a.dealer_code,
  a.branch,
  a.sa_employee_code as reception_sa_employee_code,
  a.sa_name as reception_sa_name,
  a.intake_key,
  brc.id as repair_card_id,
  brc.reception_entry_id as card_reception_entry_id,
  brc.job_card_no,
  brc.sa_employee_code as card_sa_employee_code,
  brc.sa_name as card_sa_name,
  brc.current_stage,
  brc.overall_status,
  brc.created_at as card_created_at
from accident_rows a
left join public.bodyshop_repair_cards brc
  on brc.reception_entry_id = a.id
order by a.created_at desc;

-- 5) Count of visible Accident rows that have no bodyshop card yet.
with accident_rows as (
  select sre.id
  from public.service_reception_entries sre
  where upper(trim(coalesce(sre.service_type, ''))) = 'ACCIDENT'
    and sre.created_at >= date_trunc('month', now())
    and sre.created_at < date_trunc('month', now()) + interval '1 month'
)
select count(*) as accident_rows_without_bodyshop_card
from accident_rows a
left join public.bodyshop_repair_cards brc
  on brc.reception_entry_id = a.id
where brc.id is null;

-- 6) Trigger health check: reception->bodyshop sync trigger must exist and be enabled.
select
  t.tgname,
  t.tgenabled,
  c.relname as table_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'service_reception_entries'
  and t.tgname = 'trg_sync_bodyshop_card_from_reception'
  and not t.tgisinternal;
