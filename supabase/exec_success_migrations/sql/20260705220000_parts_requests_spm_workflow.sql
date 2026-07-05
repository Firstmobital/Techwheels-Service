-- Parts Request & Tracking workflow between Service Advisor and Parts SPM.
-- Additive-only migration: new table, new module row, new RPCs, new RLS policies.
-- Does not modify any existing table/report.

begin;

-- ─── 1. parts_requests table ───────────────────────────────────────────────
create table if not exists public.parts_requests (
  id                  bigserial primary key,
  dealer_code         text,
  advisor_user_id     uuid not null,
  advisor_employee_code text,
  advisor_name        text not null,
  branch              text,
  entry_date          date not null default (now() at time zone 'Asia/Kolkata')::date,
  registration_number text not null,
  parts_required      text not null,
  parts_description   text,
  advisor_remarks     text,
  -- SPM-only fields (read-only for advisor; enforced via RPCs, not raw table writes)
  parts_number        text,
  parts_order_date    date,
  parts_status        text not null default 'Pending'
    constraint parts_requests_status_check
    check (parts_status in (
      'Pending', 'Ordered', 'Back Order', 'In Transit',
      'Received', 'Partially Received', 'Cancelled', 'Delivered to Workshop'
    )),
  spm_remarks         text,
  vehicle_type        text, -- best-effort EV/PV lookup from service_reception_entries.portal
  -- Auto-match bookkeeping (from Parts Order Sheet import) — kept separate from spm_remarks
  -- so SPM's own notes are never silently overwritten by the automated matcher.
  auto_match_note     text,
  last_matched_at     timestamptz,
  matched_order_row_id bigint,
  -- Notification support: flips to false whenever SPM updates the row or an auto-match
  -- changes status; advisor viewing the row flips it back to true.
  advisor_seen        boolean not null default true,
  status_updated_at   timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.parts_requests is
  'Parts Requirement requests raised by Service Advisors and tracked/updated by Parts SPM. Advisor fields writable only by the creating advisor via parts_request_create/parts_request_update_advisor_fields RPCs; SPM fields writable only by admin/parts_spm-modify users via parts_request_spm_update RPC.';

create index if not exists idx_parts_requests_advisor_user_id on public.parts_requests (advisor_user_id);
create index if not exists idx_parts_requests_registration_number on public.parts_requests (registration_number);
create index if not exists idx_parts_requests_parts_number on public.parts_requests (parts_number);
create index if not exists idx_parts_requests_status on public.parts_requests (parts_status);
create index if not exists idx_parts_requests_entry_date on public.parts_requests (entry_date);

drop trigger if exists trg_parts_requests_updated_at on public.parts_requests;
create trigger trg_parts_requests_updated_at
  before update on public.parts_requests
  for each row execute function public.set_updated_at();

alter table public.parts_requests enable row level security;

-- Admin bypass (matches the platform-wide admin_unrestricted_all_ops_v1 convention)
drop policy if exists admin_unrestricted_all_ops_v1 on public.parts_requests;
create policy admin_unrestricted_all_ops_v1 on public.parts_requests
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Parts SPM (module-permitted, view) can see all rows
drop policy if exists parts_spm_view_all on public.parts_requests;
create policy parts_spm_view_all on public.parts_requests
  for select
  using (public.has_module_view('parts_spm'));

-- Advisor can see only their own rows
drop policy if exists advisor_view_own on public.parts_requests;
create policy advisor_view_own on public.parts_requests
  for select
  using (advisor_user_id = auth.uid());

-- All writes go through SECURITY DEFINER RPCs below (insert/update denied directly to
-- non-admin authenticated users so advisor-only vs SPM-only field separation is enforced
-- server-side, not just hidden in the UI).

-- ─── 2. Register the Parts SPM Dashboard module ────────────────────────────
insert into public.modules (name, label, route, is_active, sort_order)
select 'parts_spm', 'Parts SPM Dashboard', '/parts-spm', true,
  coalesce((select max(sort_order) from public.modules), 0) + 1
where not exists (select 1 from public.modules where name = 'parts_spm');

-- ─── 3. RPC: advisor creates a new parts request ───────────────────────────
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

  insert into public.parts_requests (
    dealer_code, advisor_user_id, advisor_employee_code, advisor_name, branch,
    entry_date, registration_number, parts_required, parts_description, advisor_remarks,
    vehicle_type
  ) values (
    v_dealer_code, auth.uid(), v_employee_code, v_advisor_name, v_branch,
    coalesce(p_entry_date, (now() at time zone 'Asia/Kolkata')::date),
    v_reg, v_parts_required, nullif(btrim(coalesce(p_parts_description, '')), ''),
    nullif(btrim(coalesce(p_advisor_remarks, '')), ''),
    v_vehicle_type
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.parts_request_create(text, text, text, text, date) to authenticated;

-- ─── 4. RPC: advisor edits their own advisor-side fields ───────────────────
create or replace function public.parts_request_update_advisor_fields(
  p_id bigint,
  p_registration_number text,
  p_parts_required text,
  p_parts_description text default null,
  p_advisor_remarks text default null,
  p_entry_date date default null
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
      vehicle_type = coalesce(v_vehicle_type, vehicle_type)
  where id = p_id;
end;
$$;

grant execute on function public.parts_request_update_advisor_fields(bigint, text, text, text, text, date) to authenticated;

-- ─── 5. RPC: SPM/admin updates the SPM-only fields ─────────────────────────
create or replace function public.parts_request_spm_update(
  p_id bigint,
  p_parts_number text,
  p_parts_order_date date,
  p_parts_status text,
  p_spm_remarks text
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
      status_updated_at = now(),
      advisor_seen = false
  where id = p_id;

  if not found then
    raise exception 'Parts request not found: %', p_id;
  end if;
end;
$$;

grant execute on function public.parts_request_spm_update(bigint, text, date, text, text) to authenticated;

-- ─── 6. RPC: advisor acknowledges an update (clears notification badge) ────
create or replace function public.parts_request_mark_seen(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select advisor_user_id into v_owner from public.parts_requests where id = p_id;

  if v_owner is null then
    raise exception 'Parts request not found: %', p_id;
  end if;

  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Insufficient permissions';
  end if;

  update public.parts_requests set advisor_seen = true where id = p_id;
end;
$$;

grant execute on function public.parts_request_mark_seen(bigint) to authenticated;

-- ─── 7. RPC: mark all of my own unseen rows as seen (bulk badge clear) ─────
create or replace function public.parts_request_mark_all_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.parts_requests
  set advisor_seen = true
  where advisor_user_id = auth.uid() and advisor_seen = false;
end;
$$;

grant execute on function public.parts_request_mark_all_seen() to authenticated;

commit;
