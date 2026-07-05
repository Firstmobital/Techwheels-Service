-- Adds a "Parts Qty" field to the Parts Request workflow: read-only for the advisor,
-- auto-populated from current stock (service_parts_stock_snapshot_data) at request
-- creation time, and kept fresh by the parts-request-order-match edge function on every
-- Parts Order Sheet / Stock Snapshot import. SPM can manually override when needed.
-- Additive-only: new column + recreated RPCs with a new trailing optional parameter.

begin;

alter table public.parts_requests
  add column if not exists parts_qty numeric;

comment on column public.parts_requests.parts_qty is
  'Auto-computed available stock quantity for the requested part (best-effort match against service_parts_stock_snapshot_data). Read-only for advisors; SPM may manually override via parts_request_spm_update. Refreshed automatically after every Parts Order Sheet / Stock Snapshot import.';

-- ─── Recreate parts_request_create: also computes an initial best-effort parts_qty ────
drop function if exists public.parts_request_create(text, text, text, text, date);

create or replace function public.parts_request_create(
  p_registration_number text,
  p_parts_required text,
  p_parts_description text default null,
  p_advisor_remarks text default null,
  p_entry_date date default null
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

  insert into public.parts_requests (
    dealer_code, advisor_user_id, advisor_employee_code, advisor_name, branch,
    entry_date, registration_number, parts_required, parts_description, advisor_remarks,
    vehicle_type, parts_qty
  ) values (
    v_dealer_code, auth.uid(), v_employee_code, v_advisor_name, v_branch,
    coalesce(p_entry_date, (now() at time zone 'Asia/Kolkata')::date),
    v_reg, v_parts_required, nullif(btrim(coalesce(p_parts_description, '')), ''),
    nullif(btrim(coalesce(p_advisor_remarks, '')), ''),
    v_vehicle_type, v_parts_qty
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.parts_request_create(text, text, text, text, date) to authenticated;

-- ─── Recreate parts_request_spm_update: accepts optional manual Parts Qty override ─────
drop function if exists public.parts_request_spm_update(bigint, text, date, text, text);

create or replace function public.parts_request_spm_update(
  p_id bigint,
  p_parts_number text,
  p_parts_order_date date,
  p_parts_status text,
  p_spm_remarks text,
  p_parts_qty numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := btrim(coalesce(p_parts_status, ''));
begin
  if not (public.is_admin() or public.has_module_modify('parts_spm')) then
    raise exception 'Insufficient permissions';
  end if;

  if v_status = '' then
    raise exception 'Parts status is required';
  end if;

  if v_status not in (
    'Pending', 'Ordered', 'Back Order', 'In Transit',
    'Received', 'Partially Received', 'Cancelled', 'Delivered to Workshop'
  ) then
    raise exception 'Invalid parts status: %', v_status;
  end if;

  update public.parts_requests
  set parts_number = nullif(btrim(coalesce(p_parts_number, '')), ''),
      parts_order_date = p_parts_order_date,
      parts_status = v_status,
      spm_remarks = nullif(btrim(coalesce(p_spm_remarks, '')), ''),
      parts_qty = coalesce(p_parts_qty, parts_qty), -- manual override only when explicitly provided
      status_updated_at = now(),
      advisor_seen = false
  where id = p_id;

  if not found then
    raise exception 'Parts request not found: %', p_id;
  end if;
end;
$$;

grant execute on function public.parts_request_spm_update(bigint, text, date, text, text, numeric) to authenticated;

commit;
