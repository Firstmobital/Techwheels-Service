-- Allow advisors to explicitly provide Job Card No., Customer Name, and Vehicle Model
-- in the New Parts Requirement form (multi-row entry).
--
-- Previously parts_request_create only auto-filled these from service_reception_entries
-- (matching on registration_number). If no reception entry exists the fields were null.
-- Now the RPC accepts optional p_job_card_number / p_customer_name / p_vehicle_model
-- params — explicit values take priority over the auto-lookup, which remains as fallback.

create or replace function public.parts_request_create(
  p_registration_number text,
  p_parts_required      text,
  p_parts_description   text    default null,
  p_advisor_remarks     text    default null,
  p_entry_date          date    default null,
  p_parts_number        text    default null,
  -- NEW: explicit header fields (override auto-lookup when provided)
  p_job_card_number     text    default null,
  p_customer_name       text    default null,
  p_vehicle_model       text    default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_advisor_name    text;
  v_employee_code   text;
  v_dealer_code     text;
  v_branch          text;
  v_vehicle_type    text;
  v_job_card_number text;
  v_customer_name   text;
  v_vehicle_model   text;
  v_new_id          bigint;
  v_reg             text    := btrim(coalesce(p_registration_number, ''));
  v_parts_required  text    := btrim(coalesce(p_parts_required, ''));
  v_parts_number    text    := nullif(btrim(coalesce(p_parts_number, '')), '');
  v_search_term     text;
  v_parts_qty       numeric;
  v_distinct_matches int;
begin
  if v_reg = '' then
    raise exception 'Registration number is required';
  end if;
  if v_parts_required = '' then
    raise exception 'Parts required is required';
  end if;

  select uel.employee_code, uel.dealer_code
  into v_employee_code, v_dealer_code
  from public.user_employee_links uel
  where uel.user_id = auth.uid() and uel.is_active = true
  order by uel.is_primary desc, uel.updated_at desc
  limit 1;

  select em.employee_name, em.location
  into v_advisor_name, v_branch
  from public.employee_master em
  where em.employee_code = v_employee_code;

  if v_advisor_name is null then
    select coalesce(u.full_name, auth.jwt()->>'email') into v_advisor_name
    from public.users u where u.id = auth.uid();
  end if;
  v_advisor_name := coalesce(v_advisor_name, 'Unknown');

  -- Auto-lookup from service_reception_entries (fallback when explicit params not given)
  declare
    r_vehicle_type    text;
    r_job_card_number text;
    r_customer_name   text;
    r_vehicle_model   text;
  begin
    select sre.portal, sre.jc_number, sre.owner_name, sre.model
    into r_vehicle_type, r_job_card_number, r_customer_name, r_vehicle_model
    from public.service_reception_entries sre
    where upper(btrim(sre.reg_number)) = upper(v_reg)
    order by sre.created_at desc
    limit 1;

    -- Explicit params take priority; auto-lookup fills the gaps
    v_vehicle_type    := r_vehicle_type;
    v_job_card_number := coalesce(nullif(btrim(coalesce(p_job_card_number, '')), ''), r_job_card_number);
    v_customer_name   := coalesce(nullif(btrim(coalesce(p_customer_name,   '')), ''), r_customer_name);
    v_vehicle_model   := coalesce(nullif(btrim(coalesce(p_vehicle_model,   '')), ''), r_vehicle_model);
  end;

  -- Stock qty lookup (unchanged)
  if v_parts_number is not null then
    select sum(on_hand_quantity)
    into v_parts_qty
    from public.service_parts_stock_snapshot_data
    where upper(replace(part_number, ' ', '')) = upper(replace(v_parts_number, ' ', ''));
  else
    v_search_term := nullif(btrim(coalesce(p_parts_description, '')), '');
    if v_search_term is null then
      v_search_term := v_parts_required;
    end if;
    select count(distinct part_number)
    into v_distinct_matches
    from public.service_parts_stock_snapshot_data
    where part_description ilike ('%' || v_search_term || '%');

    if v_distinct_matches = 1 then
      select sum(on_hand_quantity)
      into v_parts_qty
      from public.service_parts_stock_snapshot_data
      where part_description ilike ('%' || v_search_term || '%');
    end if;
  end if;

  insert into public.parts_requests (
    dealer_code, advisor_user_id, advisor_employee_code, advisor_name, branch,
    entry_date, registration_number, parts_required, parts_description, advisor_remarks,
    vehicle_type, parts_qty, parts_number, job_card_number, customer_name, vehicle_model
  ) values (
    v_dealer_code, auth.uid(), v_employee_code, v_advisor_name, v_branch,
    coalesce(p_entry_date, (now() at time zone 'Asia/Kolkata')::date),
    v_reg, v_parts_required,
    nullif(btrim(coalesce(p_parts_description, '')), ''),
    nullif(btrim(coalesce(p_advisor_remarks,   '')), ''),
    v_vehicle_type, v_parts_qty, v_parts_number,
    v_job_card_number, v_customer_name, v_vehicle_model
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$;

-- Grant remains the same (function overloads by signature, so old callers still work)
grant execute on function public.parts_request_create(text, text, text, text, date, text, text, text, text) to authenticated;
