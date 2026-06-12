begin;

-- Safety cleanup for legacy duplicate rows that may remain after canonical reception migration.
-- Rule: keep latest row per canonical key and delete older duplicates.
-- Canonical key priority:
--   1) reception_entry_id (when present)
--   2) normalized job_card_no
--   3) normalized reg_number
with keyed as (
  select
    id,
    case
      when reception_entry_id is not null then 'R:' || reception_entry_id::text
      when nullif(trim(job_card_no), '') is not null then 'J:' || upper(trim(job_card_no))
      when nullif(trim(reg_number), '') is not null then 'G:' || upper(trim(reg_number))
      else null
    end as canonical_key,
    updated_at,
    created_at
  from public.bodyshop_repair_cards
), ranked as (
  select
    id,
    canonical_key,
    row_number() over (
      partition by canonical_key
      order by
        updated_at desc nulls last,
        created_at desc nulls last,
        id desc
    ) as rn
  from keyed
  where canonical_key is not null
)
delete from public.bodyshop_repair_cards b
using ranked r
where b.id = r.id
  and r.rn > 1;

commit;
