-- Phase E: Compatibility bridge during app switch window
-- If legacy row-per-role inserts continue temporarily, this trigger maps them
-- into the canonical active one-row-per-job-card record and skips duplicate inserts.

create or replace function public.bodyshop_assignments_legacy_insert_bridge()
returns trigger
language plpgsql
as $$
declare
  v_target_id bigint;
  v_role text;
begin
  v_role := upper(btrim(coalesce(new.role, '')));
  if v_role = 'DENTER' then
    v_role := 'DENTOR';
  end if;

  -- If an active canonical row already exists for this job card, update it and skip insert.
  select b.id
    into v_target_id
  from public.bodyshop_assignments b
  where upper(btrim(b.job_card_number)) = upper(btrim(new.job_card_number))
    and b.is_active = true
  order by coalesce(b.updated_at, b.assigned_at, b.created_at) desc, b.id desc
  limit 1;

  if v_target_id is not null then
    update public.bodyshop_assignments b
    set
      dentor_employee_code = case when v_role = 'DENTOR' then new.employee_code else b.dentor_employee_code end,
      dentor_employee_name = case when v_role = 'DENTOR' then new.employee_name else b.dentor_employee_name end,
      dentor_work_status = case when v_role = 'DENTOR' then coalesce(new.work_status, b.dentor_work_status) else b.dentor_work_status end,
      dentor_remark = case when v_role = 'DENTOR' then coalesce(new.remark, b.dentor_remark) else b.dentor_remark end,
      dentor_out_ts = case when v_role = 'DENTOR' then coalesce(new.out_ts, b.dentor_out_ts) else b.dentor_out_ts end,

      painter_employee_code = case when v_role = 'PAINTER' then new.employee_code else b.painter_employee_code end,
      painter_employee_name = case when v_role = 'PAINTER' then new.employee_name else b.painter_employee_name end,
      painter_work_status = case when v_role = 'PAINTER' then coalesce(new.work_status, b.painter_work_status) else b.painter_work_status end,
      painter_remark = case when v_role = 'PAINTER' then coalesce(new.remark, b.painter_remark) else b.painter_remark end,
      painter_out_ts = case when v_role = 'PAINTER' then coalesce(new.out_ts, b.painter_out_ts) else b.painter_out_ts end,

      technician_employee_code = case when v_role = 'TECHNICIAN' then new.employee_code else b.technician_employee_code end,
      technician_employee_name = case when v_role = 'TECHNICIAN' then new.employee_name else b.technician_employee_name end,
      technician_work_status = case when v_role = 'TECHNICIAN' then coalesce(new.work_status, b.technician_work_status) else b.technician_work_status end,
      technician_remark = case when v_role = 'TECHNICIAN' then coalesce(new.remark, b.technician_remark) else b.technician_remark end,
      technician_out_ts = case when v_role = 'TECHNICIAN' then coalesce(new.out_ts, b.technician_out_ts) else b.technician_out_ts end,

      electrician_employee_code = case when v_role = 'ELECTRICIAN' then new.employee_code else b.electrician_employee_code end,
      electrician_employee_name = case when v_role = 'ELECTRICIAN' then new.employee_name else b.electrician_employee_name end,
      electrician_work_status = case when v_role = 'ELECTRICIAN' then coalesce(new.work_status, b.electrician_work_status) else b.electrician_work_status end,
      electrician_remark = case when v_role = 'ELECTRICIAN' then coalesce(new.remark, b.electrician_remark) else b.electrician_remark end,
      electrician_out_ts = case when v_role = 'ELECTRICIAN' then coalesce(new.out_ts, b.electrician_out_ts) else b.electrician_out_ts end,

      det_employee_code = case when v_role = 'DET' then new.employee_code else b.det_employee_code end,
      det_employee_name = case when v_role = 'DET' then new.employee_name else b.det_employee_name end,
      det_work_status = case when v_role = 'DET' then coalesce(new.work_status, b.det_work_status) else b.det_work_status end,
      det_remark = case when v_role = 'DET' then coalesce(new.remark, b.det_remark) else b.det_remark end,
      det_out_ts = case when v_role = 'DET' then coalesce(new.out_ts, b.det_out_ts) else b.det_out_ts end,

      updated_at = now()
    where b.id = v_target_id;

    return null;
  end if;

  -- First row for this job card: seed role-specific columns on NEW row from legacy payload.
  if v_role = 'DENTOR' then
    new.dentor_employee_code := new.employee_code;
    new.dentor_employee_name := new.employee_name;
    new.dentor_work_status := coalesce(new.work_status, new.dentor_work_status);
    new.dentor_remark := coalesce(new.remark, new.dentor_remark);
    new.dentor_out_ts := coalesce(new.out_ts, new.dentor_out_ts);
  elsif v_role = 'PAINTER' then
    new.painter_employee_code := new.employee_code;
    new.painter_employee_name := new.employee_name;
    new.painter_work_status := coalesce(new.work_status, new.painter_work_status);
    new.painter_remark := coalesce(new.remark, new.painter_remark);
    new.painter_out_ts := coalesce(new.out_ts, new.painter_out_ts);
  elsif v_role = 'TECHNICIAN' then
    new.technician_employee_code := new.employee_code;
    new.technician_employee_name := new.employee_name;
    new.technician_work_status := coalesce(new.work_status, new.technician_work_status);
    new.technician_remark := coalesce(new.remark, new.technician_remark);
    new.technician_out_ts := coalesce(new.out_ts, new.technician_out_ts);
  elsif v_role = 'ELECTRICIAN' then
    new.electrician_employee_code := new.employee_code;
    new.electrician_employee_name := new.employee_name;
    new.electrician_work_status := coalesce(new.work_status, new.electrician_work_status);
    new.electrician_remark := coalesce(new.remark, new.electrician_remark);
    new.electrician_out_ts := coalesce(new.out_ts, new.electrician_out_ts);
  elsif v_role = 'DET' then
    new.det_employee_code := new.employee_code;
    new.det_employee_name := new.employee_name;
    new.det_work_status := coalesce(new.work_status, new.det_work_status);
    new.det_remark := coalesce(new.remark, new.det_remark);
    new.det_out_ts := coalesce(new.out_ts, new.det_out_ts);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bodyshop_assignments_legacy_insert_bridge on public.bodyshop_assignments;

create trigger trg_bodyshop_assignments_legacy_insert_bridge
before insert on public.bodyshop_assignments
for each row
execute function public.bodyshop_assignments_legacy_insert_bridge();
