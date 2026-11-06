-- Advisor-entered quantity needed (separate from parts_qty = on-hand stock from snapshot).

alter table public.parts_requests
  add column if not exists parts_qty_required numeric;

comment on column public.parts_requests.parts_qty_required is
  'Quantity the service advisor needs for this line. parts_qty remains on-hand stock from imports.';

create or replace function public.parts_request_create(
  p_registration_number text,
  p_parts_required text,
  p_parts_description text default null,
  p_advisor_remarks text default null,
  p_entry_date date default null,
  p_parts_number text default null,
  p_job_card_number text default null,
  p_customer_name text default null,
  p_vehicle_model text default null,
  p_customer_mobile text default null,
  p_parts_qty_required numeric default null
) returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_advisor_name    text;
  v_employee_code   text;
  v_dealer_code     text;
  v_branch          text;
  v_vehicle_type    text;
  v_job_card_number text;
  v_customer_name   text;
  v_vehicle_model   text;
  v_customer_mobile text;
  v_new_id          bigint;
  v_reg             text    := btrim(coalesce(p_registration_number, ''));
  v_parts_required  text    := btrim(coalesce(p_parts_required, ''));
  v_parts_number    text    := nullif(btrim(coalesce(p_parts_number, '')), '');
  v_search_term     text;
  v_parts_qty       numeric;
  v_distinct_matches int;
  v_ggn_status      text;
  v_qty_required    numeric;
begin
  if v_reg = '' then raise exception 'Registration number is required'; end if;
  if v_parts_required = '' then raise exception 'Parts required is required'; end if;

  v_qty_required := p_parts_qty_required;
  if v_qty_required is not null and v_qty_required <= 0 then
    raise exception 'Quantity required must be greater than zero';
  end if;

  if v_parts_number is not null then
    if exists (
      select 1
      from public.parts_requests pr
      where upper(btrim(pr.registration_number)) = upper(v_reg)
        and upper(replace(coalesce(pr.parts_number, ''), ' ', ''))
            = upper(replace(v_parts_number, ' ', ''))
        and pr.parts_status not in ('Done', 'Cancelled', 'Delivered to Workshop')
    ) then
      raise exception 'An open parts request already exists for this vehicle and part number.';
    end if;
  end if;

  select uel.employee_code, uel.dealer_code
  into v_employee_code, v_dealer_code
  from public.user_employee_links uel
  where uel.user_id = auth.uid() and uel.is_active = true
  order by uel.is_primary desc, uel.updated_at desc limit 1;

  select em.employee_name, em.location
  into v_advisor_name, v_branch
  from public.employee_master em
  where em.employee_code = v_employee_code;

  if v_advisor_name is null then
    select coalesce(u.full_name, auth.jwt()->>'email') into v_advisor_name
    from public.users u where u.id = auth.uid();
  end if;
  v_advisor_name := coalesce(v_advisor_name, 'Unknown');

  declare
    r_vehicle_type    text; r_job_card_number text;
    r_customer_name   text; r_vehicle_model   text; r_customer_mobile text;
  begin
    select sre.portal, sre.jc_number, sre.owner_name, sre.model, sre.owner_phone
    into r_vehicle_type, r_job_card_number, r_customer_name, r_vehicle_model, r_customer_mobile
    from public.service_reception_entries sre
    where upper(btrim(sre.reg_number)) = upper(v_reg)
    order by sre.created_at desc limit 1;

    v_vehicle_type    := r_vehicle_type;
    v_job_card_number := coalesce(nullif(btrim(coalesce(p_job_card_number,  '')), ''), r_job_card_number);
    v_customer_name   := coalesce(nullif(btrim(coalesce(p_customer_name,    '')), ''), r_customer_name);
    v_vehicle_model   := coalesce(nullif(btrim(coalesce(p_vehicle_model,    '')), ''), r_vehicle_model);
    v_customer_mobile := coalesce(nullif(btrim(coalesce(p_customer_mobile,  '')), ''), r_customer_mobile);
  end;

  if v_parts_number is not null then
    select sum(on_hand_quantity) into v_parts_qty
    from public.service_parts_stock_snapshot_data
    where upper(replace(part_number,' ','')) = upper(replace(v_parts_number,' ',''));
  else
    v_search_term := nullif(btrim(coalesce(p_parts_description, '')), '');
    if v_search_term is null then v_search_term := v_parts_required; end if;
    select count(distinct part_number) into v_distinct_matches
    from public.service_parts_stock_snapshot_data
    where part_description ilike ('%' || v_search_term || '%');
    if v_distinct_matches = 1 then
      select sum(on_hand_quantity) into v_parts_qty
      from public.service_parts_stock_snapshot_data
      where part_description ilike ('%' || v_search_term || '%');
    end if;
  end if;

  if v_parts_number is not null and v_reg <> '' and v_parts_required <> '' then
    v_ggn_status := public.ggn_stock_status_for_part(v_parts_number);
  end if;

  insert into public.parts_requests (
    dealer_code, advisor_user_id, advisor_employee_code, advisor_name, branch,
    entry_date, registration_number, parts_required, parts_description, advisor_remarks,
    vehicle_type, parts_qty, parts_qty_required, parts_number, job_card_number, customer_name, vehicle_model,
    customer_mobile, ggn_stock_status
  ) values (
    v_dealer_code, auth.uid(), v_employee_code, v_advisor_name, v_branch,
    coalesce(p_entry_date, (now() at time zone 'Asia/Kolkata')::date),
    v_reg, v_parts_required,
    nullif(btrim(coalesce(p_parts_description,'')), ''),
    nullif(btrim(coalesce(p_advisor_remarks,  '')), ''),
    v_vehicle_type, v_parts_qty, v_qty_required, v_parts_number,
    v_job_card_number, v_customer_name, v_vehicle_model, v_customer_mobile,
    v_ggn_status
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

create or replace function public.parts_request_update_advisor_fields(
  p_id bigint,
  p_registration_number text,
  p_parts_required text,
  p_parts_description text default null,
  p_advisor_remarks text default null,
  p_entry_date date default null,
  p_parts_number text default null,
  p_customer_mobile text default null,
  p_parts_qty_required numeric default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner           uuid;
  v_current_status  text;
  v_reg             text := btrim(coalesce(p_registration_number, ''));
  v_parts_required  text := btrim(coalesce(p_parts_required, ''));
  v_vehicle_type    text; v_job_card_number text;
  v_customer_name   text; v_vehicle_model   text; v_customer_mobile text;
  v_parts_number    text;
begin
  select advisor_user_id, parts_status into v_owner, v_current_status
  from public.parts_requests where id = p_id;

  if v_owner is null then raise exception 'Parts request not found: %', p_id; end if;
  if not (v_owner = auth.uid() or public.is_admin()) then raise exception 'Insufficient permissions'; end if;
  if v_current_status in ('Done', 'Cancelled') and not public.is_admin() then
    raise exception 'This request is closed and can no longer be edited';
  end if;
  if v_reg = '' then raise exception 'Registration number is required'; end if;
  if v_parts_required = '' then raise exception 'Parts required is required'; end if;
  if p_parts_qty_required is not null and p_parts_qty_required <= 0 then
    raise exception 'Quantity required must be greater than zero';
  end if;

  select sre.portal, sre.jc_number, sre.owner_name, sre.model, sre.owner_phone
  into v_vehicle_type, v_job_card_number, v_customer_name, v_vehicle_model, v_customer_mobile
  from public.service_reception_entries sre
  where upper(btrim(sre.reg_number)) = upper(v_reg)
  order by sre.created_at desc limit 1;

  v_customer_mobile := coalesce(
    nullif(btrim(coalesce(p_customer_mobile, '')), ''),
    v_customer_mobile
  );

  v_parts_number := coalesce(nullif(btrim(coalesce(p_parts_number,'')), ''), (
    select parts_number from public.parts_requests where id = p_id
  ));

  update public.parts_requests
  set registration_number = v_reg,
      parts_required      = v_parts_required,
      parts_description   = nullif(btrim(coalesce(p_parts_description, '')), ''),
      advisor_remarks     = nullif(btrim(coalesce(p_advisor_remarks,   '')), ''),
      entry_date          = coalesce(p_entry_date, entry_date),
      vehicle_type        = coalesce(v_vehicle_type,    vehicle_type),
      job_card_number     = coalesce(v_job_card_number, job_card_number),
      customer_name       = coalesce(v_customer_name,   customer_name),
      vehicle_model       = coalesce(v_vehicle_model,   vehicle_model),
      customer_mobile     = coalesce(v_customer_mobile, customer_mobile),
      parts_number        = coalesce(nullif(btrim(coalesce(p_parts_number,'')), ''), parts_number),
      parts_qty_required  = coalesce(p_parts_qty_required, parts_qty_required),
      ggn_stock_status    = public.ggn_stock_status_for_part(v_parts_number)
  where id = p_id;
end;
$$;
