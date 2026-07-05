-- Gives advisors optional Parts Number entry access (business requirement: sometimes the
-- advisor already knows the correct part number and shouldn't have to wait for Parts SPM
-- to fill it in later). Purely additive:
--   - parts_request_create: new optional p_parts_number param. When supplied, it is used
--     directly and takes priority over the existing fuzzy description-based stock lookup
--     for the initial Parts Qty auto-population (exact part-number match is more reliable).
--   - parts_request_update_advisor_fields: new optional p_parts_number param so the advisor
--     can add/correct it later while the request is still theirs to edit.
--   - parts_request_spm_update (admin/SPM path) is completely untouched — Parts SPM can
--     still freely edit or correct whatever the advisor entered, same as before.
-- No existing data, columns, RLS policies, or other RPCs are modified.

begin;

-- ─── parts_request_create: accepts an optional advisor-supplied Parts Number ───────────
drop function if exists public.parts_request_create(text, text, text, text, date);

create or replace function public.parts_request_create(
  p_registration_number text,
  p_parts_required text,
  p_parts_description text default null,
  p_advisor_remarks text default null,
  p_entry_date date default null,
  p_parts_number text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advisor_name text;
  v_employee_code text;
  v_dealer_code text;
  v_branch text;
  v_vehicle_type text;
  v_new_id bigint;
  v_reg text := btrim(coalesce(p_registration_number, ''));
  v_parts_required text := btrim(coalesce(p_parts_required, ''));
  v_parts_number text := nullif(btrim(coalesce(p_parts_number, '')), '');
  v_search_term text;
  v_parts_qty numeric;
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

  -- Best-effort EV/PV lookup from the most recent reception entry for this registration
  select sre.portal into v_vehicle_type
  from public.service_reception_entries sre
  where upper(btrim(sre.reg_number)) = upper(v_reg)
  order by sre.created_at desc
  limit 1;

  if v_parts_number is not null then
    -- Advisor already knows the exact part number — use it directly, no fuzzy matching
    -- needed.
    select sum(on_hand_quantity)
    into v_parts_qty
    from public.service_parts_stock_snapshot_data
    where upper(replace(part_number, ' ', '')) = upper(replace(v_parts_number, ' ', ''));
  else
    -- Best-effort initial Parts Qty: fuzzy-match parts description/required text against
    -- current stock on hand. Only set if the match resolves to exactly one distinct part
    -- number (avoids showing a misleading quantity for an ambiguous text match). Left null
    -- (displayed as "Not Available") otherwise — refreshed automatically on next import.
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
    vehicle_type, parts_qty, parts_number
  ) values (
    v_dealer_code, auth.uid(), v_employee_code, v_advisor_name, v_branch,
    coalesce(p_entry_date, (now() at time zone 'Asia/Kolkata')::date),
    v_reg, v_parts_required, nullif(btrim(coalesce(p_parts_description, '')), ''),
    nullif(btrim(coalesce(p_advisor_remarks, '')), ''),
    v_vehicle_type, v_parts_qty, v_parts_number
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.parts_request_create(text, text, text, text, date, text) to authenticated;

-- ─── parts_request_update_advisor_fields: advisor can add/correct Parts Number too ─────
drop function if exists public.parts_request_update_advisor_fields(bigint, text, text, text, text, date);

create or replace function public.parts_request_update_advisor_fields(
  p_id bigint,
  p_registration_number text,
  p_parts_required text,
  p_parts_description text default null,
  p_advisor_remarks text default null,
  p_entry_date date default null,
  p_parts_number text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_reg text := btrim(coalesce(p_registration_number, ''));
  v_parts_required text := btrim(coalesce(p_parts_required, ''));
  v_vehicle_type text;
begin
  select advisor_user_id into v_owner from public.parts_requests where id = p_id;

  if v_owner is null then
    raise exception 'Parts request not found: %', p_id;
  end if;

  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Insufficient permissions';
  end if;

  if v_reg = '' then
    raise exception 'Registration number is required';
  end if;
  if v_parts_required = '' then
    raise exception 'Parts required is required';
  end if;

  select sre.portal into v_vehicle_type
  from public.service_reception_entries sre
  where upper(btrim(sre.reg_number)) = upper(v_reg)
  order by sre.created_at desc
  limit 1;

  update public.parts_requests
  set registration_number = v_reg,
      parts_required = v_parts_required,
      parts_description = nullif(btrim(coalesce(p_parts_description, '')), ''),
      advisor_remarks = nullif(btrim(coalesce(p_advisor_remarks, '')), ''),
      entry_date = coalesce(p_entry_date, entry_date),
      vehicle_type = coalesce(v_vehicle_type, vehicle_type),
      -- Advisor-supplied Parts Number is optional: only overwrite when they actually
      -- typed something. SPM/admin edits via parts_request_spm_update remain completely
      -- independent and can still correct it at any time.
      parts_number = coalesce(nullif(btrim(coalesce(p_parts_number, '')), ''), parts_number)
  where id = p_id;
end;
$$;

grant execute on function public.parts_request_update_advisor_fields(bigint, text, text, text, text, date, text) to authenticated;

commit;
