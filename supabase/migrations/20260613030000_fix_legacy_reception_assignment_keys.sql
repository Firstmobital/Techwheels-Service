-- Fix legacy technician assignment keys that still use RECEPTION-<id>
-- and prevent recurrence when reception rows later receive a real JC number.

begin;

-- 1) Backfill existing legacy keys to canonical JC number where available.
with legacy_map as (
  select
    ta.id as assignment_id,
    upper(btrim(sre.jc_number)) as canonical_jc
  from public.technician_assignments ta
  join public.service_reception_entries sre
    on sre.id = substring(upper(btrim(ta.job_card_number)) from '^RECEPTION-([0-9]+)$')::bigint
  where upper(btrim(ta.job_card_number)) ~ '^RECEPTION-[0-9]+$'
    and nullif(btrim(sre.jc_number), '') is not null
)
update public.technician_assignments ta
set
  job_card_number = lm.canonical_jc,
  updated_at = now()
from legacy_map lm
where ta.id = lm.assignment_id
  and upper(btrim(ta.job_card_number)) <> lm.canonical_jc;

-- 2) Canonicalize incoming technician assignment keys on write.
create or replace function public.normalize_technician_assignment_job_card_number()
returns trigger
language plpgsql
as $$
declare
  reception_id_text text;
  mapped_jc text;
begin
  if NEW.job_card_number is not null then
    NEW.job_card_number := upper(btrim(NEW.job_card_number));
  end if;

  if NEW.job_card_number is null or NEW.job_card_number = '' then
    return NEW;
  end if;

  reception_id_text := substring(NEW.job_card_number from '^RECEPTION-([0-9]+)$');
  if reception_id_text is null then
    return NEW;
  end if;

  select upper(btrim(jc_number))
    into mapped_jc
  from public.service_reception_entries
  where id = reception_id_text::bigint
    and nullif(btrim(jc_number), '') is not null
  limit 1;

  if mapped_jc is not null and mapped_jc <> '' then
    NEW.job_card_number := mapped_jc;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_normalize_technician_assignments_jc on public.technician_assignments;
create trigger trg_normalize_technician_assignments_jc
before insert or update on public.technician_assignments
for each row execute function public.normalize_technician_assignment_job_card_number();

-- 3) When reception gets/changes a JC number, rewrite matching legacy assignment keys.
create or replace function public.sync_reception_jc_to_legacy_technician_assignments()
returns trigger
language plpgsql
as $$
declare
  new_jc text;
begin
  new_jc := upper(btrim(coalesce(NEW.jc_number, '')));
  if new_jc = '' then
    return NEW;
  end if;

  update public.technician_assignments
  set
    job_card_number = new_jc,
    updated_at = now()
  where upper(btrim(job_card_number)) = ('RECEPTION-' || NEW.id::text);

  return NEW;
end;
$$;

drop trigger if exists trg_sync_reception_jc_to_technician_assignments on public.service_reception_entries;
create trigger trg_sync_reception_jc_to_technician_assignments
after insert or update of jc_number on public.service_reception_entries
for each row execute function public.sync_reception_jc_to_legacy_technician_assignments();

commit;
