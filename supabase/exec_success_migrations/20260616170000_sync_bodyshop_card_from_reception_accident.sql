-- Long-term fix: keep bodyshop_repair_cards synchronized with Accident reception rows.
--
-- Root cause addressed:
-- bodyshop cards can be created before final SA mapping is saved in service_reception_entries,
-- causing stale/null sa_employee_code in bodyshop_repair_cards and missing scoped visibility.
--
-- This migration introduces:
-- 1) trigger function to upsert/sync bodyshop card from reception row on insert/update
-- 2) trigger on service_reception_entries for relevant columns
-- 3) one-time drift repair for existing Accident-linked cards

begin;

create or replace function public.sync_bodyshop_repair_card_from_reception()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_accident boolean;
  v_job_card_no text;
  v_sa_name text;
begin
  v_is_accident := upper(trim(coalesce(new.service_type, ''))) = 'ACCIDENT';
  if not v_is_accident then
    return new;
  end if;

  v_job_card_no := upper(trim(coalesce(nullif(new.jc_number, ''), nullif(new.reg_number, ''))));
  if v_job_card_no is null or v_job_card_no = '' then
    return new;
  end if;

  v_sa_name := coalesce(nullif(trim(new.sa_display_name), ''), nullif(trim(new.sa_name), ''), null);

  update public.bodyshop_repair_cards brc
  set
    job_card_no = v_job_card_no,
    reg_number = new.reg_number,
    customer_name = new.owner_name,
    customer_phone = new.owner_phone,
    branch = new.branch,
    sa_employee_code = new.sa_employee_code,
    sa_name = coalesce(v_sa_name, brc.sa_name),
    received_at = coalesce(brc.received_at, new.created_at),
    updated_at = now()
  where brc.reception_entry_id = new.id;

  if not found then
    insert into public.bodyshop_repair_cards (
      reception_entry_id,
      job_card_no,
      reg_number,
      customer_name,
      customer_phone,
      branch,
      sa_employee_code,
      sa_name,
      current_stage,
      current_stage_name,
      overall_status,
      received_at,
      created_at,
      updated_at
    ) values (
      new.id,
      v_job_card_no,
      new.reg_number,
      new.owner_name,
      new.owner_phone,
      new.branch,
      new.sa_employee_code,
      v_sa_name,
      1,
      'Vehicle Receiving',
      'active',
      coalesce(new.created_at, now()),
      now(),
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_bodyshop_card_from_reception on public.service_reception_entries;
create trigger trg_sync_bodyshop_card_from_reception
after insert or update of
  service_type,
  jc_number,
  reg_number,
  owner_name,
  owner_phone,
  branch,
  sa_employee_code,
  sa_name,
  sa_display_name
on public.service_reception_entries
for each row
execute function public.sync_bodyshop_repair_card_from_reception();

-- One-time drift repair for existing Accident-linked rows.
with source_reception as (
  select
    sre.id as reception_entry_id,
    upper(trim(coalesce(nullif(sre.jc_number, ''), nullif(sre.reg_number, '')))) as job_card_no,
    sre.reg_number,
    sre.owner_name,
    sre.owner_phone,
    sre.branch,
    sre.sa_employee_code,
    coalesce(nullif(trim(sre.sa_display_name), ''), nullif(trim(sre.sa_name), '')) as sa_name,
    sre.created_at
  from public.service_reception_entries sre
  where upper(trim(coalesce(sre.service_type, ''))) = 'ACCIDENT'
    and upper(trim(coalesce(nullif(sre.jc_number, ''), nullif(sre.reg_number, '')))) <> ''
)
update public.bodyshop_repair_cards brc
set
  job_card_no = src.job_card_no,
  reg_number = src.reg_number,
  customer_name = src.owner_name,
  customer_phone = src.owner_phone,
  branch = src.branch,
  sa_employee_code = src.sa_employee_code,
  sa_name = coalesce(src.sa_name, brc.sa_name),
  received_at = coalesce(brc.received_at, src.created_at),
  updated_at = now()
from source_reception src
where brc.reception_entry_id = src.reception_entry_id
  and (
    coalesce(trim(brc.sa_employee_code), '') <> coalesce(trim(src.sa_employee_code), '')
    or coalesce(trim(brc.sa_name), '') <> coalesce(trim(src.sa_name), '')
    or coalesce(trim(brc.job_card_no), '') <> coalesce(trim(src.job_card_no), '')
  );

commit;
