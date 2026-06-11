begin;

alter table public.bodyshop_repair_cards
  add column if not exists reception_entry_id bigint;

comment on column public.bodyshop_repair_cards.reception_entry_id is
  'Canonical link to source Accident reception row; one bodyshop repair card per reception entry.';

with candidates as (
  select
    b.id as card_id,
    r.id as reception_id,
    row_number() over (
      partition by b.id
      order by
        case
          when nullif(trim(b.job_card_no), '') is not null
            and upper(trim(b.job_card_no)) = upper(trim(coalesce(r.jc_number, ''))) then 0
          when nullif(trim(b.reg_number), '') is not null
            and upper(trim(b.reg_number)) = upper(trim(coalesce(r.reg_number, ''))) then 1
          else 2
        end,
        r.created_at desc,
        r.id desc
    ) as rn
  from public.bodyshop_repair_cards b
  join public.service_reception_entries r
    on lower(trim(coalesce(r.service_type, ''))) = 'accident'
   and (
     (nullif(trim(b.job_card_no), '') is not null and upper(trim(b.job_card_no)) = upper(trim(coalesce(r.jc_number, ''))))
     or
     (nullif(trim(b.reg_number), '') is not null and upper(trim(b.reg_number)) = upper(trim(coalesce(r.reg_number, ''))))
   )
  where b.reception_entry_id is null
), best as (
  select card_id, reception_id
  from candidates
  where rn = 1
)
update public.bodyshop_repair_cards b
set reception_entry_id = best.reception_id,
    updated_at = now()
from best
where b.id = best.card_id
  and b.reception_entry_id is null;

with ranked as (
  select
    id,
    reception_entry_id,
    row_number() over (
      partition by reception_entry_id
      order by
        updated_at desc nulls last,
        created_at desc nulls last,
        id desc
    ) as rn
  from public.bodyshop_repair_cards
  where reception_entry_id is not null
)
delete from public.bodyshop_repair_cards b
using ranked r
where b.id = r.id
  and r.rn > 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bodyshop_repair_cards_reception_entry_fk'
      and conrelid = 'public.bodyshop_repair_cards'::regclass
  ) then
    alter table public.bodyshop_repair_cards
      add constraint bodyshop_repair_cards_reception_entry_fk
      foreign key (reception_entry_id)
      references public.service_reception_entries(id)
      on delete set null;
  end if;
end
$$;

create unique index if not exists ux_bodyshop_repair_cards_reception_entry_id
  on public.bodyshop_repair_cards (reception_entry_id)
  where reception_entry_id is not null;

create index if not exists idx_bodyshop_repair_cards_reception_entry_id
  on public.bodyshop_repair_cards (reception_entry_id);

commit;
