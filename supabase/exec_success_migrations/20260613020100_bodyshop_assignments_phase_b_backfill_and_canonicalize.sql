-- Phase B: Backfill role-specific columns and canonicalize active rows
-- Strategy:
-- 1) Pick one canonical active row per job_card_number.
-- 2) Backfill new role columns from latest active legacy row per role.
-- 3) Deactivate duplicate active rows per job_card_number.

begin;

with role_latest as (
  select *
  from (
    select
      id,
      upper(btrim(job_card_number)) as jc_key,
      case
        when upper(btrim(role)) = 'DENTER' then 'DENTOR'
        else upper(btrim(role))
      end as role_key,
      employee_code,
      employee_name,
      work_status,
      remark,
      out_ts,
      assigned_at,
      updated_at,
      created_at,
      row_number() over (
        partition by upper(btrim(job_card_number)), case when upper(btrim(role)) = 'DENTER' then 'DENTOR' else upper(btrim(role)) end
        order by coalesce(updated_at, assigned_at, created_at) desc, id desc
      ) as rn
    from public.bodyshop_assignments
    where coalesce(is_active, true) = true
      and btrim(job_card_number) <> ''
  ) t
  where t.rn = 1
),
canonical as (
  select *
  from (
    select
      id,
      upper(btrim(job_card_number)) as jc_key,
      row_number() over (
        partition by upper(btrim(job_card_number))
        order by coalesce(updated_at, assigned_at, created_at) desc, id desc
      ) as rn
    from public.bodyshop_assignments
    where coalesce(is_active, true) = true
      and btrim(job_card_number) <> ''
  ) c
  where c.rn = 1
)
update public.bodyshop_assignments b
set
  dentor_employee_code = coalesce(dentor.employee_code, b.dentor_employee_code),
  dentor_employee_name = coalesce(dentor.employee_name, b.dentor_employee_name),
  dentor_work_status = coalesce(dentor.work_status, b.dentor_work_status),
  dentor_remark = coalesce(dentor.remark, b.dentor_remark),
  dentor_out_ts = coalesce(dentor.out_ts, b.dentor_out_ts),

  painter_employee_code = coalesce(painter.employee_code, b.painter_employee_code),
  painter_employee_name = coalesce(painter.employee_name, b.painter_employee_name),
  painter_work_status = coalesce(painter.work_status, b.painter_work_status),
  painter_remark = coalesce(painter.remark, b.painter_remark),
  painter_out_ts = coalesce(painter.out_ts, b.painter_out_ts),

  technician_employee_code = coalesce(tech.employee_code, b.technician_employee_code),
  technician_employee_name = coalesce(tech.employee_name, b.technician_employee_name),
  technician_work_status = coalesce(tech.work_status, b.technician_work_status),
  technician_remark = coalesce(tech.remark, b.technician_remark),
  technician_out_ts = coalesce(tech.out_ts, b.technician_out_ts),

  electrician_employee_code = coalesce(ele.employee_code, b.electrician_employee_code),
  electrician_employee_name = coalesce(ele.employee_name, b.electrician_employee_name),
  electrician_work_status = coalesce(ele.work_status, b.electrician_work_status),
  electrician_remark = coalesce(ele.remark, b.electrician_remark),
  electrician_out_ts = coalesce(ele.out_ts, b.electrician_out_ts),

  det_employee_code = coalesce(det.employee_code, b.det_employee_code),
  det_employee_name = coalesce(det.employee_name, b.det_employee_name),
  det_work_status = coalesce(det.work_status, b.det_work_status),
  det_remark = coalesce(det.remark, b.det_remark),
  det_out_ts = coalesce(det.out_ts, b.det_out_ts),

  updated_at = now()
from canonical c
left join role_latest dentor on dentor.jc_key = c.jc_key and dentor.role_key = 'DENTOR'
left join role_latest painter on painter.jc_key = c.jc_key and painter.role_key = 'PAINTER'
left join role_latest tech on tech.jc_key = c.jc_key and tech.role_key = 'TECHNICIAN'
left join role_latest ele on ele.jc_key = c.jc_key and ele.role_key = 'ELECTRICIAN'
left join role_latest det on det.jc_key = c.jc_key and det.role_key = 'DET'
where b.id = c.id;

-- Deactivate non-canonical active duplicates per job card.
with canonical as (
  select *
  from (
    select
      id,
      upper(btrim(job_card_number)) as jc_key,
      row_number() over (
        partition by upper(btrim(job_card_number))
        order by coalesce(updated_at, assigned_at, created_at) desc, id desc
      ) as rn
    from public.bodyshop_assignments
    where coalesce(is_active, true) = true
      and btrim(job_card_number) <> ''
  ) c
  where c.rn = 1
)
update public.bodyshop_assignments b
set
  is_active = false,
  updated_at = now()
from canonical c
where upper(btrim(b.job_card_number)) = c.jc_key
  and b.id <> c.id
  and coalesce(b.is_active, true) = true;

commit;
