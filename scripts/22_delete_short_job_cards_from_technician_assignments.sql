-- Delete technician assignment rows where normalized job card length is shorter
-- than canonical length of 'JC-MBTPLT-JP2-2627-002164' (25 chars).

begin;

-- Preview target rows.
with params as (
  select char_length('JC-MBTPLT-JP2-2627-002164')::int as min_len
),
short_rows as (
  select
    ta.id,
    ta.job_card_number,
    ta.technician_code,
    ta.technician_name,
    ta.work_status,
    char_length(upper(btrim(coalesce(ta.job_card_number, '')))) as jc_len,
    p.min_len
  from public.technician_assignments ta
  cross join params p
  where char_length(upper(btrim(coalesce(ta.job_card_number, '')))) < p.min_len
)
select *
from short_rows
order by id;

-- Apply delete.
with params as (
  select char_length('JC-MBTPLT-JP2-2627-002164')::int as min_len
),
rows_to_delete as (
  select ta.id
  from public.technician_assignments ta
  cross join params p
  where char_length(upper(btrim(coalesce(ta.job_card_number, '')))) < p.min_len
),
deleted as (
  delete from public.technician_assignments ta
  using rows_to_delete d
  where ta.id = d.id
  returning ta.id, ta.job_card_number, ta.technician_code, ta.work_status
)
select *
from deleted
order by id;

-- Verify remaining short rows.
with params as (
  select char_length('JC-MBTPLT-JP2-2627-002164')::int as min_len
)
select
  count(*) as remaining_short_job_card_rows,
  min(char_length(upper(btrim(coalesce(job_card_number, ''))))) as min_remaining_len
from public.technician_assignments ta
cross join params p
where char_length(upper(btrim(coalesce(ta.job_card_number, '')))) < p.min_len;

commit;
