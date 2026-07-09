-- Service Advisor parts workflow: Received / Ready / Done self-service actions
-- Additive only: new columns + new statuses + new advisor RPCs. No existing columns,
-- statuses, or SPM/admin workflow behavior are changed or removed.

alter table public.parts_requests
  add column if not exists received_at timestamptz,
  add column if not exists received_by_name text,
  add column if not exists done_at timestamptz,
  add column if not exists done_by_name text;

alter table public.parts_requests drop constraint if exists parts_requests_status_check;
alter table public.parts_requests add constraint parts_requests_status_check
  check (parts_status = any (array[
    'Pending','Ordered','Back Order','In Transit','Received',
    'Partially Received','Cancelled','Delivered to Workshop',
    'Ready','Done'
  ]));

-- Keep SPM/admin manual override in sync with the extended status list.
create or replace function public.parts_request_spm_update(
  p_id bigint, p_parts_number text, p_parts_order_date date, p_parts_status text,
  p_spm_remarks text, p_parts_qty numeric default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    'Received', 'Partially Received', 'Cancelled', 'Delivered to Workshop',
    'Ready', 'Done'
  ) then
    raise exception 'Invalid parts status: %', v_status;
  end if;

  update public.parts_requests
  set parts_number = nullif(btrim(coalesce(p_parts_number, '')), ''),
      parts_order_date = p_parts_order_date,
      parts_status = v_status,
      spm_remarks = nullif(btrim(coalesce(p_spm_remarks, '')), ''),
      parts_qty = coalesce(p_parts_qty, parts_qty),
      status_updated_at = now(),
      advisor_seen = false
  where id = p_id;

  if not found then
    raise exception 'Parts request not found: %', p_id;
  end if;
end;
$function$;

-- Advisor edits (registration/parts required/description/remarks/parts number) are now
-- locked once a request reaches Done, for the advisor role only. Admin can still edit.
create or replace function public.parts_request_update_advisor_fields(
  p_id bigint, p_registration_number text, p_parts_required text,
  p_parts_description text default null, p_advisor_remarks text default null,
  p_entry_date date default null, p_parts_number text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_current_status text;
  v_reg text := btrim(coalesce(p_registration_number, ''));
  v_parts_required text := btrim(coalesce(p_parts_required, ''));
  v_vehicle_type text;
begin
  select advisor_user_id, parts_status into v_owner, v_current_status
  from public.parts_requests where id = p_id;

  if v_owner is null then
    raise exception 'Parts request not found: %', p_id;
  end if;

  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Insufficient permissions';
  end if;

  if v_current_status = 'Done' and not public.is_admin() then
    raise exception 'This request is marked Done and can no longer be edited';
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
      parts_number = coalesce(nullif(btrim(coalesce(p_parts_number, '')), ''), parts_number)
  where id = p_id;
end;
$function$;

-- Resolve the current caller's display name the same way parts_request_create does.
create or replace function public._parts_request_caller_name()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
  v_employee_code text;
begin
  select uel.employee_code into v_employee_code
  from public.user_employee_links uel
  where uel.user_id = auth.uid() and uel.is_active = true
  order by uel.is_primary desc, uel.updated_at desc
  limit 1;

  if v_employee_code is not null then
    select em.employee_name into v_name
    from public.employee_master em
    where em.employee_code = v_employee_code;
  end if;

  if v_name is null then
    select coalesce(u.full_name, auth.jwt()->>'email') into v_name
    from public.users u where u.id = auth.uid();
  end if;

  return coalesce(v_name, 'Unknown');
end;
$function$;

-- Advisor (owner) or admin marks parts physically Received. Only valid from Ordered
-- (or the legacy In Transit / Back Order / Partially Received in-flight states) so a
-- request that's still Pending can't skip straight to Received by mistake.
create or replace function public.parts_request_advisor_mark_received(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_status text;
begin
  select advisor_user_id, parts_status into v_owner, v_status
  from public.parts_requests where id = p_id;

  if v_owner is null then
    raise exception 'Parts request not found: %', p_id;
  end if;
  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Insufficient permissions';
  end if;
  if v_status not in ('Ordered', 'In Transit', 'Back Order', 'Partially Received') then
    raise exception 'Parts must be Ordered before they can be marked Received (current status: %)', v_status;
  end if;

  update public.parts_requests
  set parts_status = 'Received',
      received_at = now(),
      received_by_name = public._parts_request_caller_name(),
      status_updated_at = now()
  where id = p_id;
end;
$function$;

-- Advisor (owner) or admin marks the repair Ready (Received -> Ready).
create or replace function public.parts_request_advisor_mark_ready(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_status text;
begin
  select advisor_user_id, parts_status into v_owner, v_status
  from public.parts_requests where id = p_id;

  if v_owner is null then
    raise exception 'Parts request not found: %', p_id;
  end if;
  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Insufficient permissions';
  end if;
  if v_status <> 'Received' then
    raise exception 'Parts must be Received before marking Ready (current status: %)', v_status;
  end if;

  update public.parts_requests
  set parts_status = 'Ready',
      status_updated_at = now()
  where id = p_id;
end;
$function$;

-- Advisor (owner) or admin marks the vehicle Done (Ready -> Done). Terminal state —
-- hidden from the advisor's own list afterwards, remains visible to Admin.
create or replace function public.parts_request_advisor_mark_done(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_status text;
begin
  select advisor_user_id, parts_status into v_owner, v_status
  from public.parts_requests where id = p_id;

  if v_owner is null then
    raise exception 'Parts request not found: %', p_id;
  end if;
  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Insufficient permissions';
  end if;
  if v_status <> 'Ready' then
    raise exception 'Vehicle must be Ready before marking Done (current status: %)', v_status;
  end if;

  update public.parts_requests
  set parts_status = 'Done',
      done_at = now(),
      done_by_name = public._parts_request_caller_name(),
      status_updated_at = now()
  where id = p_id;
end;
$function$;

grant execute on function public.parts_request_advisor_mark_received(bigint) to authenticated;
grant execute on function public.parts_request_advisor_mark_ready(bigint) to authenticated;
grant execute on function public.parts_request_advisor_mark_done(bigint) to authenticated;
