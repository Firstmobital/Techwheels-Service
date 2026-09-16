-- MOBILE-011 Phase 1
-- Customer phone=phone sessions + SECURITY DEFINER RPCs.
-- Customers are not public.users. Workshop tables stay unggranted to anon.
-- Rollback:
--   drop function if exists public.customer_start_session(text, text);
--   drop function if exists public.customer_end_session(text);
--   drop function if exists public.customer_list_my_vehicles(text);
--   drop function if exists public.customer_get_active_job(text, text);
--   drop function if exists public.customer_get_service_history(text, text);
--   drop function if exists public.customer_submit_complaint(text, text, jsonb);
--   drop function if exists public.customer_submit_feedback(text, text, jsonb);
--   drop function if exists public.customer_list_estimates(text, text);
--   drop function if exists public.customer_set_estimate_decision(text, text, text, text);
--   drop function if exists public.customer_get_gate_pass(text, text);
--   drop function if exists public.customer_collect_vehicles(text);
--   drop function if exists public.customer_require_session(text);
--   drop function if exists public.customer_reject_staff_jwt();
--   drop function if exists public.customer_hash_token(text);
--   drop function if exists public.customer_last10_digits(text);
--   drop function if exists public.customer_norm_reg(text);
--   drop table if exists public.customer_auth_attempts;
--   drop table if exists public.customer_sessions;
--   drop table if exists public.customer_profiles;
-- Execution: This file can be run in one go.

begin;

-- Close the 2026-09-15 anon SELECT hole. Staff RLS is TO authenticated.
revoke select on public.service_reception_entries from anon;
drop policy if exists "Allow public select service_reception_entries" on public.service_reception_entries;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_customer_live_intake'
  ) then
    revoke execute on function public.get_customer_live_intake(text) from anon;
  end if;
end $$;

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  phone text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint customer_profiles_phone_check check (phone ~ '^[0-9]{10}$')
);

comment on table public.customer_profiles is
  'MOBILE-011: customer identity is phone only. auth_user_id stays null until Phase 4 OTP.';

create table if not exists public.customer_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.customer_profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists customer_sessions_profile_idx
  on public.customer_sessions (profile_id, expires_at desc);

create table if not exists public.customer_auth_attempts (
  id bigint generated always as identity primary key,
  phone_key text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists customer_auth_attempts_phone_time_idx
  on public.customer_auth_attempts (phone_key, attempted_at desc);

alter table public.customer_profiles enable row level security;
alter table public.customer_sessions enable row level security;
alter table public.customer_auth_attempts enable row level security;

revoke all on table public.customer_profiles from anon, authenticated;
revoke all on table public.customer_sessions from anon, authenticated;
revoke all on table public.customer_auth_attempts from anon, authenticated;

create or replace function public.customer_last10_digits(p text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')) >= 10
      then right(regexp_replace(p, '[^0-9]', '', 'g'), 10)
    else null
  end;
$$;

create or replace function public.customer_norm_reg(p text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g')), '');
$$;

create or replace function public.customer_hash_token(p_token text)
returns text
language sql
immutable
set search_path to public, extensions
as $$
  select encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.customer_reject_staff_jwt()
returns void
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  if auth.uid() is not null
     and exists (select 1 from public.users u where u.id = auth.uid()) then
    raise exception 'forbidden';
  end if;
end;
$$;

create or replace function public.customer_require_session(p_session_token text)
returns table (
  profile_id uuid,
  phone text,
  session_id uuid
)
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_hash text;
begin
  perform public.customer_reject_staff_jwt();

  if p_session_token is null or btrim(p_session_token) = '' then
    raise exception 'Session expired.';
  end if;

  v_hash := public.customer_hash_token(btrim(p_session_token));

  return query
  select p.id, p.phone, s.id
  from public.customer_sessions s
  join public.customer_profiles p on p.id = s.profile_id
  where s.token_hash = v_hash
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if not found then
    raise exception 'Session expired.';
  end if;
end;
$$;

create or replace function public.customer_collect_vehicles(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_phone text := public.customer_last10_digits(p_phone);
  v_rows jsonb := '[]'::jsonb;
begin
  if v_phone is null then
    return '[]'::jsonb;
  end if;

  with rec as (
    select
      1 as src_rank,
      s.id::text as source_id,
      'reception'::text as source,
      public.customer_norm_reg(s.reg_number) as reg_key,
      s.reg_number,
      s.model,
      null::text as vin,
      s.owner_name,
      s.owner_phone,
      s.service_type,
      s.sa_name,
      s.sa_display_name,
      s.jc_number,
      s.branch,
      s.created_at,
      s.invoice_done_at,
      s.km_reading::numeric as km_reading,
      s.remark,
      s.estimate_storage_path,
      s.estimate_drive_url,
      s.invoice_storage_path,
      s.invoice_drive_url
    from public.service_reception_entries s
    where public.customer_last10_digits(s.owner_phone) = v_phone
      and public.customer_norm_reg(s.reg_number) is not null
  ),
  veh as (
    select
      2 as src_rank,
      public.customer_norm_reg(v.reg_number) as source_id,
      'vehicles'::text as source,
      public.customer_norm_reg(v.reg_number) as reg_key,
      v.reg_number,
      v.model,
      v.vin,
      v.owner_name,
      v.owner_phone,
      null::text as service_type,
      null::text as sa_name,
      null::text as sa_display_name,
      null::text as jc_number,
      null::text as branch,
      v.created_at,
      null::timestamptz as invoice_done_at,
      null::numeric as km_reading,
      null::text as remark,
      null::text as estimate_storage_path,
      null::text as estimate_drive_url,
      null::text as invoice_storage_path,
      null::text as invoice_drive_url
    from public.vehicles v
    where public.customer_last10_digits(v.owner_phone) = v_phone
      and public.customer_norm_reg(v.reg_number) is not null
  ),
  bs as (
    select
      3 as src_rank,
      b.id::text as source_id,
      'bodyshop'::text as source,
      public.customer_norm_reg(b.reg_number) as reg_key,
      b.reg_number,
      null::text as model,
      null::text as vin,
      b.customer_name as owner_name,
      b.customer_phone as owner_phone,
      'Body & Paint'::text as service_type,
      b.sa_name,
      b.sa_name as sa_display_name,
      b.job_card_no as jc_number,
      b.branch,
      b.created_at,
      b.delivered_at as invoice_done_at,
      null::numeric as km_reading,
      b.overall_status as remark,
      null::text as estimate_storage_path,
      null::text as estimate_drive_url,
      null::text as invoice_storage_path,
      null::text as invoice_drive_url
    from public.bodyshop_repair_cards b
    where public.customer_last10_digits(b.customer_phone) = v_phone
      and public.customer_norm_reg(b.reg_number) is not null
  ),
  asd as (
    select
      4 as src_rank,
      a.id::text as source_id,
      'all_service_data'::text as source,
      public.customer_norm_reg(a.vehicle_registration_number) as reg_key,
      a.vehicle_registration_number as reg_number,
      a.model,
      a.chassis_no as vin,
      nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), '') as owner_name,
      coalesce(
        public.customer_last10_digits(a.last_service_customer_mobile_no),
        v_phone
      ) as owner_phone,
      a.last_service_type as service_type,
      a.last_service_dealer as sa_name,
      a.last_service_dealer as sa_display_name,
      a.extended_warranty_order_no as jc_number,
      a.sold_dealer as branch,
      coalesce(a.last_service_date::timestamptz, a.created_at) as created_at,
      a.last_service_date::timestamptz as invoice_done_at,
      nullif(regexp_replace(coalesce(a.last_service_km, ''), '[^0-9]', '', 'g'), '')::numeric as km_reading,
      a.product_line as remark,
      null::text as estimate_storage_path,
      null::text as estimate_drive_url,
      null::text as invoice_storage_path,
      null::text as invoice_drive_url
    from public.all_service_data a
    where public.customer_norm_reg(a.vehicle_registration_number) is not null
      and (
        public.customer_last10_digits(a.last_service_customer_mobile_no) = v_phone
        or exists (
          select 1
          from unnest(regexp_split_to_array(coalesce(a.contact_phones, ''), '[,;/|]+')) as part
          where public.customer_last10_digits(part) = v_phone
        )
      )
  ),
  united as (
    select * from rec
    union all
    select * from veh
    union all
    select * from bs
    union all
    select * from asd
  ),
  picked as (
    select distinct on (reg_key)
      source_id,
      source,
      reg_key,
      reg_number,
      model,
      vin,
      owner_name,
      owner_phone,
      service_type,
      sa_name,
      sa_display_name,
      jc_number,
      branch,
      created_at,
      invoice_done_at,
      km_reading,
      remark,
      estimate_storage_path,
      estimate_drive_url,
      invoice_storage_path,
      invoice_drive_url
    from united
    where reg_key is not null
    order by reg_key, src_rank, created_at desc nulls last
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', source_id,
        'source', source,
        'reg_number', reg_number,
        'reg_key', reg_key,
        'model', model,
        'vin', vin,
        'owner_name', owner_name,
        'owner_phone', owner_phone,
        'service_type', service_type,
        'sa_name', sa_name,
        'sa_display_name', sa_display_name,
        'jc_number', jc_number,
        'branch', branch,
        'created_at', created_at,
        'invoice_done_at', invoice_done_at,
        'km_reading', km_reading,
        'remark', remark,
        'estimate_storage_path', estimate_storage_path,
        'estimate_drive_url', estimate_drive_url,
        'invoice_storage_path', invoice_storage_path,
        'invoice_drive_url', invoice_drive_url
      )
      order by reg_number
    ),
    '[]'::jsonb
  )
  into v_rows
  from picked;

  return v_rows;
end;
$$;

create or replace function public.customer_start_session(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_user text := public.customer_last10_digits(p_username);
  v_pass text := public.customer_last10_digits(p_password);
  v_phone_key text := coalesce(v_user, v_pass, 'invalid');
  v_attempt_count int;
  v_vehicles jsonb;
  v_profile_id uuid;
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
begin
  perform public.customer_reject_staff_jwt();

  insert into public.customer_auth_attempts (phone_key) values (v_phone_key);
  select count(*) into v_attempt_count
  from public.customer_auth_attempts
  where phone_key = v_phone_key
    and attempted_at > now() - interval '15 minutes';
  if v_attempt_count > 10 then
    raise exception 'Invalid mobile number.';
  end if;

  if v_user is null or v_pass is null or v_user <> v_pass then
    raise exception 'Invalid mobile number.';
  end if;

  v_vehicles := public.customer_collect_vehicles(v_user);
  if v_vehicles is null or jsonb_array_length(v_vehicles) = 0 then
    raise exception 'No vehicle found for this mobile number.';
  end if;

  insert into public.customer_profiles (phone, last_login_at, updated_at)
  values (v_user, now(), now())
  on conflict (phone) do update
    set last_login_at = now(),
        updated_at = now()
  returning id into v_profile_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.customer_sessions (profile_id, token_hash, expires_at)
  values (v_profile_id, public.customer_hash_token(v_token), v_expires);

  return jsonb_build_object(
    'session_token', v_token,
    'expires_at', v_expires,
    'phone', v_user,
    'vehicles', v_vehicles
  );
end;
$$;

create or replace function public.customer_end_session(p_session_token text)
returns void
language plpgsql
security definer
set search_path to public, extensions
as $$
begin
  perform public.customer_reject_staff_jwt();
  if p_session_token is null or btrim(p_session_token) = '' then
    return;
  end if;
  update public.customer_sessions
  set revoked_at = now()
  where token_hash = public.customer_hash_token(btrim(p_session_token))
    and revoked_at is null;
end;
$$;

create or replace function public.customer_list_my_vehicles(p_session_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  return public.customer_collect_vehicles(v_sess.phone);
end;
$$;

create or replace function public.customer_assert_reg(p_session_token text, p_reg_number text)
returns text
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text := public.customer_norm_reg(p_reg_number);
  v_ok boolean := false;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  if v_reg is null then
    raise exception 'Vehicle not found for this session.';
  end if;
  select exists (
    select 1
    from jsonb_array_elements(public.customer_collect_vehicles(v_sess.phone)) v
    where v->>'reg_key' = v_reg
  ) into v_ok;
  if not v_ok then
    raise exception 'Vehicle not found for this session.';
  end if;
  return v_reg;
end;
$$;

create or replace function public.customer_my_reg_keys(p_phone text)
returns text[]
language sql
stable
security definer
set search_path to public
as $$
  select coalesce(array_agg(v->>'reg_key'), '{}'::text[])
  from jsonb_array_elements(public.customer_collect_vehicles(p_phone)) v;
$$;

create or replace function public.customer_get_active_job(p_session_token text, p_reg_number text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_regs text[];
  v_job jsonb;
  v_vehicle jsonb;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);

  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  end if;

  select jsonb_build_object(
    'id', s.id,
    'source', 'reception',
    'reg_number', s.reg_number,
    'reg_key', public.customer_norm_reg(s.reg_number),
    'model', s.model,
    'owner_name', s.owner_name,
    'owner_phone', s.owner_phone,
    'service_type', s.service_type,
    'sa_name', s.sa_name,
    'sa_display_name', s.sa_display_name,
    'jc_number', s.jc_number,
    'branch', s.branch,
    'created_at', s.created_at,
    'invoice_done_at', s.invoice_done_at,
    'km_reading', s.km_reading,
    'remark', s.remark,
    'estimate_storage_path', s.estimate_storage_path,
    'estimate_drive_url', s.estimate_drive_url,
    'invoice_storage_path', s.invoice_storage_path,
    'invoice_drive_url', s.invoice_drive_url,
    'status', case when s.invoice_done_at is null then 'in_service' else 'delivered' end
  )
  into v_job
  from public.service_reception_entries s
  where public.customer_norm_reg(s.reg_number) = any(v_regs)
    and (v_reg is null or public.customer_norm_reg(s.reg_number) = v_reg)
  order by (s.invoice_done_at is null) desc, s.created_at desc
  limit 1;

  if v_job is null then
    select jsonb_build_object(
      'id', b.id,
      'source', 'bodyshop',
      'reg_number', b.reg_number,
      'reg_key', public.customer_norm_reg(b.reg_number),
      'model', null,
      'owner_name', b.customer_name,
      'owner_phone', b.customer_phone,
      'service_type', 'Body & Paint',
      'sa_name', b.sa_name,
      'sa_display_name', b.sa_name,
      'jc_number', b.job_card_no,
      'branch', b.branch,
      'created_at', b.created_at,
      'invoice_done_at', b.delivered_at,
      'km_reading', null,
      'remark', b.overall_status,
      'status', case
        when coalesce(b.overall_status, '') in ('delivered', 'closed') or b.delivered_at is not null
          then 'delivered'
        else 'in_service'
      end
    )
    into v_job
    from public.bodyshop_repair_cards b
    where public.customer_norm_reg(b.reg_number) = any(v_regs)
      and (v_reg is null or public.customer_norm_reg(b.reg_number) = v_reg)
    order by b.created_at desc
    limit 1;
  end if;

  select v
  into v_vehicle
  from jsonb_array_elements(public.customer_collect_vehicles(v_sess.phone)) v
  where v_reg is null or v->>'reg_key' = v_reg
  limit 1;

  return jsonb_build_object(
    'phone', v_sess.phone,
    'vehicle', v_vehicle,
    'job', v_job
  );
end;
$$;

create or replace function public.customer_get_service_history(p_session_token text, p_reg_number text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_regs text[];
  v_rows jsonb := '[]'::jsonb;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  end if;

  select coalesce(jsonb_agg(item order by (item->>'service_date') desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', 'rec-' || s.id::text,
      'source', 'reception',
      'reg_number', s.reg_number,
      'service_date', coalesce(s.invoice_done_at, s.created_at),
      'jc_number', s.jc_number,
      'service_type', s.service_type,
      'km_reading', s.km_reading,
      'service_advisor', coalesce(s.sa_display_name, s.sa_name),
      'total_amount', s.expected_invoice_amount,
      'status', case when s.invoice_done_at is null then 'In service' else 'Delivered' end,
      'invoice_storage_path', s.invoice_storage_path,
      'invoice_drive_url', s.invoice_drive_url
    ) as item
    from public.service_reception_entries s
    where public.customer_norm_reg(s.reg_number) = any(v_regs)
      and (v_reg is null or public.customer_norm_reg(s.reg_number) = v_reg)

    union all

    select jsonb_build_object(
      'id', 'asd-' || a.id::text,
      'source', 'all_service_data',
      'reg_number', a.vehicle_registration_number,
      'service_date', a.last_service_date,
      'jc_number', a.extended_warranty_order_no,
      'service_type', a.last_service_type,
      'km_reading', nullif(regexp_replace(coalesce(a.last_service_km, ''), '[^0-9]', '', 'g'), '')::numeric,
      'service_advisor', a.last_service_dealer,
      'total_amount', null,
      'status', 'Delivered'
    )
    from public.all_service_data a
    where public.customer_norm_reg(a.vehicle_registration_number) = any(v_regs)
      and (v_reg is null or public.customer_norm_reg(a.vehicle_registration_number) = v_reg)
      and a.last_service_date is not null
  ) hist;

  return v_rows;
end;
$$;

create or replace function public.customer_submit_complaint(p_session_token text, p_reg_number text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_id bigint;
  v_text text;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  v_text := nullif(btrim(coalesce(p_payload->>'text', p_payload->>'feedback_text', '')), '');
  if v_text is null and jsonb_typeof(p_payload->'problems') = 'array' then
    select string_agg('Point ' || ord::text || ': ' || btrim(elem), E'\n')
    into v_text
    from jsonb_array_elements_text(p_payload->'problems') with ordinality as t(elem, ord)
    where btrim(elem) <> '';
    if coalesce(btrim(p_payload->>'notes'), '') <> '' then
      v_text := trim(both E'\n' from coalesce(v_text, '') || E'\nAdditional Notes: ' || btrim(p_payload->>'notes'));
    end if;
  end if;

  if v_text is null or btrim(v_text) = '' then
    raise exception 'Complaint text is required.';
  end if;

  insert into public.post_feedback_bot_data (
    vehicle_registration_number,
    customer_name,
    mobile_number,
    rating,
    feedback_text,
    service_type,
    service_advisor_name,
    branch,
    model,
    mode,
    complaint_date_time
  ) values (
    v_reg,
    nullif(btrim(coalesce(p_payload->>'owner_name', '')), ''),
    v_sess.phone,
    null,
    v_text,
    coalesce(nullif(btrim(p_payload->>'service_type'), ''), 'Customer Reported Issues'),
    nullif(btrim(coalesce(p_payload->>'sa_name', '')), ''),
    nullif(btrim(coalesce(p_payload->>'branch', '')), ''),
    nullif(btrim(coalesce(p_payload->>'model', '')), ''),
    'customer_portal_concern',
    now()::text
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'mode', 'customer_portal_concern');
end;
$$;

create or replace function public.customer_submit_feedback(p_session_token text, p_reg_number text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_id bigint;
  v_text text;
  v_rating smallint;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  v_text := nullif(btrim(coalesce(p_payload->>'text', p_payload->>'feedback_text', '')), '');
  if v_text is null then
    raise exception 'Feedback text is required.';
  end if;

  begin
    v_rating := nullif(p_payload->>'rating', '')::smallint;
  exception when others then
    v_rating := null;
  end;

  insert into public.post_feedback_bot_data (
    vehicle_registration_number,
    customer_name,
    mobile_number,
    rating,
    feedback_text,
    service_type,
    service_advisor_name,
    branch,
    model,
    mode,
    complaint_date_time
  ) values (
    v_reg,
    nullif(btrim(coalesce(p_payload->>'owner_name', '')), ''),
    v_sess.phone,
    v_rating,
    v_text,
    coalesce(nullif(btrim(p_payload->>'service_type'), ''), 'General Service'),
    nullif(btrim(coalesce(p_payload->>'sa_name', '')), ''),
    nullif(btrim(coalesce(p_payload->>'branch', '')), ''),
    nullif(btrim(coalesce(p_payload->>'model', '')), ''),
    'customer_portal_feedback',
    now()::text
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'mode', 'customer_portal_feedback');
end;
$$;

create or replace function public.customer_list_estimates(p_session_token text, p_reg_number text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_regs text[];
  v_rows jsonb := '[]'::jsonb;
  v_extra jsonb := '[]'::jsonb;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'estimate_id', 'reception-' || s.id::text,
      'source', 'reception',
      'reg_number', s.reg_number,
      'estimate_storage_path', s.estimate_storage_path,
      'estimate_drive_url', s.estimate_drive_url,
      'status', 'issued',
      'created_at', s.estimate_uploaded_at
    ) as item
    from public.service_reception_entries s
    where public.customer_norm_reg(s.reg_number) = any(v_regs)
      and (v_reg is null or public.customer_norm_reg(s.reg_number) = v_reg)
      and (
        nullif(btrim(coalesce(s.estimate_storage_path, '')), '') is not null
        or nullif(btrim(coalesce(s.estimate_drive_url, '')), '') is not null
      )

    union all

    select case
      when (b.feedback_text)::jsonb ? 'estimate_no'
        then (b.feedback_text)::jsonb
          || jsonb_build_object(
            'estimate_id', coalesce((b.feedback_text)::jsonb->>'estimate_no', 'bot-' || b.id::text),
            'source', 'customer_estimate_payload',
            'reg_number', b.vehicle_registration_number
          )
      else jsonb_build_object(
        'estimate_id', 'bot-' || b.id::text,
        'source', 'customer_estimate_payload',
        'reg_number', b.vehicle_registration_number,
        'status', 'issued'
      )
    end
    from public.post_feedback_bot_data b
    where b.mode = 'customer_estimate_payload'
      and b.feedback_text ~ '^\s*\{'
      and (
        public.customer_last10_digits(b.mobile_number) = v_sess.phone
        or public.customer_norm_reg(b.vehicle_registration_number) = any(v_regs)
      )
      and (v_reg is null or public.customer_norm_reg(b.vehicle_registration_number) = v_reg)
  ) est;

  if to_regclass('public.customer_estimates') is not null then
    execute
      $q$
      select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'estimate_id', c.estimate_no,
        'source', 'customer_estimates',
        'reg_number', c.vehicle_registration_number
      )), '[]'::jsonb)
      from public.customer_estimates c
      where public.customer_norm_reg(c.vehicle_registration_number) = any($1)
        and ($2::text is null or public.customer_norm_reg(c.vehicle_registration_number) = $2)
      $q$
    into v_extra
    using v_regs, v_reg;
    v_rows := coalesce(v_rows, '[]'::jsonb) || coalesce(v_extra, '[]'::jsonb);
  end if;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

create or replace function public.customer_set_estimate_decision(
  p_session_token text,
  p_estimate_id text,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_regs text[];
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_est_reg text;
  v_mode text;
  v_id bigint;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);

  if v_decision not in ('approve', 'approved', 'reject', 'rejected') then
    raise exception 'Invalid estimate decision.';
  end if;
  if v_decision in ('reject', 'rejected') and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Rejection reason is required.';
  end if;

  if to_regclass('public.customer_estimates') is not null then
    execute
      $q$
      select public.customer_norm_reg(c.vehicle_registration_number)
      from public.customer_estimates c
      where c.estimate_no = $1
         or c.id::text = $1
      limit 1
      $q$
    into v_est_reg
    using btrim(p_estimate_id);
  end if;

  if v_est_reg is null then
    select public.customer_norm_reg(b.vehicle_registration_number)
    into v_est_reg
    from public.post_feedback_bot_data b
    where b.mode = 'customer_estimate_payload'
      and (
        b.id::text = btrim(p_estimate_id)
        or (b.feedback_text)::jsonb->>'estimate_no' = btrim(p_estimate_id)
      )
    limit 1;
  end if;

  if v_est_reg is null then
    select public.customer_norm_reg(s.reg_number)
    into v_est_reg
    from public.service_reception_entries s
    where ('reception-' || s.id::text) = btrim(p_estimate_id)
    limit 1;
  end if;

  if v_est_reg is null or not (v_est_reg = any(v_regs)) then
    raise exception 'Vehicle not found for this session.';
  end if;

  if to_regclass('public.customer_estimates') is not null then
    execute
      $q$
      update public.customer_estimates
      set status = $2,
          rejection_reason = $3,
          approved_at = case when $2 = 'Approved' then now() else approved_at end,
          updated_at = now()
      where estimate_no = $1 or id::text = $1
      $q$
    using btrim(p_estimate_id),
          case when v_decision in ('approve', 'approved') then 'Approved' else 'Rejected' end,
          nullif(btrim(coalesce(p_reason, '')), '');
  end if;

  v_mode := case
    when v_decision in ('approve', 'approved') then 'customer_estimate_approval'
    else 'customer_estimate_rejection'
  end;

  insert into public.post_feedback_bot_data (
    vehicle_registration_number,
    mobile_number,
    feedback_text,
    service_type,
    mode,
    complaint_date_time
  ) values (
    v_est_reg,
    v_sess.phone,
    case
      when v_mode = 'customer_estimate_approval'
        then '[Estimate Approved] Customer approved Estimate #' || btrim(p_estimate_id) || ' via app.'
      else '[Estimate Rejected] Estimate #' || btrim(p_estimate_id) || ' rejected. Reason: ' || btrim(coalesce(p_reason, ''))
    end,
    'Estimate decision',
    v_mode,
    now()::text
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'estimate_id', btrim(p_estimate_id),
    'decision', v_decision,
    'reg_number', v_est_reg
  );
end;
$$;

create or replace function public.customer_get_gate_pass(p_session_token text, p_reg_number text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_regs text[];
  v_text text;
  v_payload jsonb;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  end if;

  select b.feedback_text
  into v_text
  from public.post_feedback_bot_data b
  where b.mode = 'customer_gatepass_payload'
    and (
      public.customer_last10_digits(b.mobile_number) = v_sess.phone
      or public.customer_norm_reg(b.vehicle_registration_number) = any(v_regs)
    )
    and (v_reg is null or public.customer_norm_reg(b.vehicle_registration_number) = v_reg)
  order by b.created_at desc
  limit 1;

  if v_text is not null then
    begin
      v_payload := v_text::jsonb;
    exception when others then
      v_payload := null;
    end;
    if v_payload is not null and nullif(btrim(coalesce(v_payload->>'gate_pass_no', '')), '') is not null then
      return v_payload;
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.customer_start_session(text, text) from public;
revoke all on function public.customer_end_session(text) from public;
revoke all on function public.customer_list_my_vehicles(text) from public;
revoke all on function public.customer_get_active_job(text, text) from public;
revoke all on function public.customer_get_service_history(text, text) from public;
revoke all on function public.customer_submit_complaint(text, text, jsonb) from public;
revoke all on function public.customer_submit_feedback(text, text, jsonb) from public;
revoke all on function public.customer_list_estimates(text, text) from public;
revoke all on function public.customer_set_estimate_decision(text, text, text, text) from public;
revoke all on function public.customer_get_gate_pass(text, text) from public;
revoke all on function public.customer_collect_vehicles(text) from public, anon, authenticated;
revoke all on function public.customer_require_session(text) from public, anon, authenticated;
revoke all on function public.customer_reject_staff_jwt() from public, anon, authenticated;
revoke all on function public.customer_hash_token(text) from public, anon, authenticated;
revoke all on function public.customer_assert_reg(text, text) from public, anon, authenticated;
revoke all on function public.customer_my_reg_keys(text) from public, anon, authenticated;
revoke all on function public.customer_last10_digits(text) from public, anon, authenticated;
revoke all on function public.customer_norm_reg(text) from public, anon, authenticated;

grant execute on function public.customer_start_session(text, text) to anon;
grant execute on function public.customer_end_session(text) to anon;
grant execute on function public.customer_list_my_vehicles(text) to anon;
grant execute on function public.customer_get_active_job(text, text) to anon;
grant execute on function public.customer_get_service_history(text, text) to anon;
grant execute on function public.customer_submit_complaint(text, text, jsonb) to anon;
grant execute on function public.customer_submit_feedback(text, text, jsonb) to anon;
grant execute on function public.customer_list_estimates(text, text) to anon;
grant execute on function public.customer_set_estimate_decision(text, text, text, text) to anon;
grant execute on function public.customer_get_gate_pass(text, text) to anon;

comment on function public.customer_start_session(text, text) is
  'MOBILE-011: username and password must be the same 10-digit mobile. Returns session_token + that phone''s vehicles.';

commit;
