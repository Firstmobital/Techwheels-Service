-- Generated from /Users/vkbin/Downloads/JOB CARD.xlsx
-- Updates service_reception_entries.service_type using jc_number mapping from sheet
begin;

create temp table tmp_service_type_fix (
  jc_number text primary key,
  reg_number text,
  expected_current_service_type text,
  actual_service_type text not null
) on commit drop;

insert into tmp_service_type_fix (jc_number, reg_number, expected_current_service_type, actual_service_type) values
  ('JC-MBTPLT-JP1-2526-013419', 'RJ60CE5096', 'Third Free Service', 'Second Free Service'),
  ('JC-MBTPLT-JP1-2627-002254', 'RJ45CQ2731', 'Paid Service', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-002475', 'RJ59UA0598', 'Running Repairs', 'PDI'),
  ('JC-MBTPLT-JP1-2627-002487', 'RJ45CP3576', 'Paid Service', 'E Breakdown'),
  ('JC-MBTPLT-JP1-2627-002574', 'RJ45CL1649', 'Running Repairs', 'Paid Service'),
  ('JC-MBTPLT-JP1-2627-002583', 'RJ02CF5373', 'Running Repairs', 'Paid Service'),
  ('JC-MBTPLT-JP1-2627-003046', 'RJ60CB7741', 'Paid Service', 'Campaign'),
  ('JC-MBTPLT-JP1-2627-003047', 'RJ60CH3695', 'Updation', 'Campaign'),
  ('JC-MBTPLT-JP1-2627-003051', 'RJ45CE6225', 'Second Free Service', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-003052', 'RJ60CH3305', 'Updation', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-003056', 'RJ60CH6840', 'Campaign', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-003077', 'RJ60CH8061', 'First Free Service', 'Campaign'),
  ('JC-MBTPLT-JP1-2627-003086', 'RJ45CR0995', 'E Breakdown', 'Paid Service'),
  ('JC-MBTPLT-JP1-2627-003104', '22BH3383A', 'Paid Service', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-003118', 'RJ41CB3621', 'Updation', 'Campaign'),
  ('JC-MBTPLT-JP1-2627-003143', '26BH6223D', 'Updation', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-003152', 'RJ60CE8909', 'Running Repairs', 'E Breakdown'),
  ('JC-MBTPLT-JP1-2627-003157', 'RJ29CC3080', 'Campaign', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-003165', '25BH3562J', 'Paid Service', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-003168', '22BH2624E', 'Paid Service', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-003185', '24BH7940M', 'Paid Service', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-003198', '25BH1453P', 'Running Repairs', 'Third Free Service'),
  ('JC-MBTPLT-JP1-2627-003227', 'RJ45CY3710', 'Running Repairs', 'Paid Service'),
  ('JC-MBTPLT-JP1-2627-003233', 'RJ59UA1642', 'Running Repairs', 'Second Free Service'),
  ('JC-MBTPLT-JP1-2627-003245', 'RJ60CH7321', 'First Free Service', 'Running Repairs'),
  ('JC-MBTPLT-JP1-2627-003265', 'RJ45CV1961', 'Paid Service', 'Running Repairs'),
  ('JC-MBTPLT-JP2-2627-000603', 'RJ59CA2700', 'Running Repairs', 'Paid Service'),
  ('JC-MBTPLT-JP2-2627-001552', 'RJ14TH2699', 'Running Repairs', 'First Free Service'),
  ('JC-MBTPLT-JP2-2627-001729', 'RJ60CE0236', 'Running Repairs', 'Accident'),
  ('JC-MBTPLT-JP2-2627-001740', 'RJ45CR7011', 'Running Repairs', 'Paid Service'),
  ('JC-MBTPLT-JP2-2627-001891', 'RJ45CZ4942', 'Running Repairs', 'Accident'),
  ('JC-MBTPLT-JP2-2627-002044', 'RJ60CH1411', 'Running Repairs', 'Accident'),
  ('JC-MBTPLT-JP2-2627-002308', 'RJ60CD7722', 'Running Repairs', 'Paid Service'),
  ('JC-MBTPLT-JP2-2627-002311', 'RJ45CZ4663', 'Paid Service', 'Running Repairs'),
  ('JC-MBTPLT-JP2-2627-002362', 'RJ29CC1291', 'Paid Service', 'Running Repairs'),
  ('JC-MBTPLT-JP2-2627-002420', 'RJ03CC0008', 'Third Free Service', 'Third Free Service'),
  ('JC-MBTPLT-JP2-2627-002495', 'RJ60C1086', 'Paid Service', 'Running Repairs'),
  ('JC-MBTPLT-JP2-2627-002496', 'RJ45CX3797', 'Paid Service', 'Running Repairs'),
  ('JC-MBTPLT-JP2-2627-002557', 'RJ14TG4809', 'Running Repairs', 'Paid Service'),
  ('JC-MBTPLT-JP2-2627-002571', 'RJ45CZ5349', 'Paid Service', 'Running Repairs');

-- Preview rows that will change
select r.id, r.jc_number, r.reg_number, r.service_type as current_service_type, f.actual_service_type as new_service_type
from service_reception_entries r
join tmp_service_type_fix f on upper(trim(r.jc_number)) = upper(trim(f.jc_number))
where coalesce(trim(r.service_type), '') is distinct from trim(f.actual_service_type)
order by r.id;

-- Apply update with accurate old/new output
with candidates as (
  select
    r.id,
    r.jc_number,
    r.reg_number,
    r.service_type as old_service_type,
    trim(f.actual_service_type) as new_service_type
  from service_reception_entries r
  join tmp_service_type_fix f on upper(trim(r.jc_number)) = upper(trim(f.jc_number))
  where (coalesce(trim(f.expected_current_service_type), '') = '' or coalesce(trim(r.service_type), '') = trim(f.expected_current_service_type))
    and coalesce(trim(r.service_type), '') is distinct from trim(f.actual_service_type)
),
updated as (
  update service_reception_entries r
  set service_type = c.new_service_type,
      updated_at = now()
  from candidates c
  where r.id = c.id
  returning r.id
)
select
  c.id,
  c.jc_number,
  c.reg_number,
  c.old_service_type,
  c.new_service_type
from candidates c
join updated u on u.id = c.id
order by c.id;

-- Audit: mappings that did not find any row by jc_number
select f.*
from tmp_service_type_fix f
left join service_reception_entries r on upper(trim(r.jc_number)) = upper(trim(f.jc_number))
where r.id is null
order by f.jc_number;

commit;