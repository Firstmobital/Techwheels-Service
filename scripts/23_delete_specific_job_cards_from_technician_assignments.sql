-- Delete only the explicitly provided job cards from technician_assignments.

begin;

with target_job_cards as (
  select upper(btrim(v.job_card_number)) as job_card_number
  from (
    values
      ('JCASDFG4567'),
      ('JC0987GHGJK'),
      ('JC435678'),
      ('JC00987'),
      ('JC00111'),
      ('JCTEST0002323'),
      ('JC-JC-MBTPLT-JP2-2627-002'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX4'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX3'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX2'),
      ('RJ45CU0802JC-MBTPLT-JP2-'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX1'),
      ('JC-MBTPLT-XXX-YYYY-AAAAA3'),
      ('JC-MBTPLT-XXX-BBBB-AAAAA3'),
      ('JC-MBTPLT-XXX-BBBB-AAAAA4'),
      ('RJ59CB2006JC-MBTPLT-JP2-')
  ) as v(job_card_number)
),
rows_to_delete as (
  select
    ta.id,
    ta.job_card_number,
    ta.technician_code,
    ta.technician_name,
    ta.work_status
  from public.technician_assignments ta
  join target_job_cards t
    on upper(btrim(coalesce(ta.job_card_number, ''))) = t.job_card_number
)
-- Preview matching rows
select * from rows_to_delete order by id;

-- Audit target values not found BEFORE delete.
with target_job_cards as (
  select upper(btrim(v.job_card_number)) as job_card_number
  from (
    values
      ('JCASDFG4567'),
      ('JC0987GHGJK'),
      ('JC435678'),
      ('JC00987'),
      ('JC00111'),
      ('JCTEST0002323'),
      ('JC-JC-MBTPLT-JP2-2627-002'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX4'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX3'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX2'),
      ('RJ45CU0802JC-MBTPLT-JP2-'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX1'),
      ('JC-MBTPLT-XXX-YYYY-AAAAA3'),
      ('JC-MBTPLT-XXX-BBBB-AAAAA3'),
      ('JC-MBTPLT-XXX-BBBB-AAAAA4'),
      ('RJ59CB2006JC-MBTPLT-JP2-')
  ) as v(job_card_number)
)
select t.job_card_number as pre_delete_not_found_job_card_number
from target_job_cards t
left join public.technician_assignments ta
  on upper(btrim(coalesce(ta.job_card_number, ''))) = t.job_card_number
where ta.id is null
order by t.job_card_number;

with target_job_cards as (
  select upper(btrim(v.job_card_number)) as job_card_number
  from (
    values
      ('JCASDFG4567'),
      ('JC0987GHGJK'),
      ('JC435678'),
      ('JC00987'),
      ('JC00111'),
      ('JCTEST0002323'),
      ('JC-JC-MBTPLT-JP2-2627-002'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX4'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX3'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX2'),
      ('RJ45CU0802JC-MBTPLT-JP2-'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX1'),
      ('JC-MBTPLT-XXX-YYYY-AAAAA3'),
      ('JC-MBTPLT-XXX-BBBB-AAAAA3'),
      ('JC-MBTPLT-XXX-BBBB-AAAAA4'),
      ('RJ59CB2006JC-MBTPLT-JP2-')
  ) as v(job_card_number)
),
deleted as (
  delete from public.technician_assignments ta
  using target_job_cards t
  where upper(btrim(coalesce(ta.job_card_number, ''))) = t.job_card_number
  returning ta.id, ta.job_card_number, ta.technician_code, ta.work_status
)
select * from deleted order by id;

-- Audit target values still not present AFTER delete.
with target_job_cards as (
  select upper(btrim(v.job_card_number)) as job_card_number
  from (
    values
      ('JCASDFG4567'),
      ('JC0987GHGJK'),
      ('JC435678'),
      ('JC00987'),
      ('JC00111'),
      ('JCTEST0002323'),
      ('JC-JC-MBTPLT-JP2-2627-002'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX4'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX3'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX2'),
      ('RJ45CU0802JC-MBTPLT-JP2-'),
      ('JC-MBTPLT-XXX-YYYY-XXXXX1'),
      ('JC-MBTPLT-XXX-YYYY-AAAAA3'),
      ('JC-MBTPLT-XXX-BBBB-AAAAA3'),
      ('JC-MBTPLT-XXX-BBBB-AAAAA4'),
      ('RJ59CB2006JC-MBTPLT-JP2-')
  ) as v(job_card_number)
)
select t.job_card_number as post_delete_not_found_job_card_number
from target_job_cards t
left join public.technician_assignments ta
  on upper(btrim(coalesce(ta.job_card_number, ''))) = t.job_card_number
where ta.id is null
order by t.job_card_number;

commit;
