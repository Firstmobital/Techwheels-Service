-- Post Service Feedback CRE follow-up module: columns, remarks table, queue view,
-- resolution RPCs, RLS, and module registration.
-- This migration is additive-only; it does not modify any existing table data.

begin;

-- ─── 1. CRE follow-up columns on post_service_feedback_messages ────────────
alter table public.post_service_feedback_messages
  add column if not exists cre_status      text not null default 'open'
    constraint psfm_cre_status_check
      check (cre_status in ('open', 'in_progress', 'resolved')),
  add column if not exists resolved_at     timestamptz,
  add column if not exists resolved_by_id  uuid,
  add column if not exists resolved_by_name text;

comment on column public.post_service_feedback_messages.cre_status is
  'CRE follow-up status for low-rated feedback: open -> in_progress -> resolved.';
comment on column public.post_service_feedback_messages.resolved_by_id is
  'auth.uid() of the CRE user who resolved this case (set only via psf_mark_resolved, never client-supplied).';

create index if not exists idx_psfm_cre_status
  on public.post_service_feedback_messages (cre_status);

-- ─── 2. Remarks / call-log table ────────────────────────────────────────────
create table if not exists public.post_service_feedback_remarks (
  id               bigserial primary key,
  feedback_id      bigint  not null references public.post_service_feedback_messages(id) on delete cascade,
  remark           text    not null,
  created_by_id    uuid,
  created_by_name  text,
  is_resolution    boolean not null default false,
  created_at       timestamptz not null default now()
);

comment on table public.post_service_feedback_remarks is
  'Append-only call-log / remarks trail for CRE follow-up on post_service_feedback_messages. Written only via psf_add_remark / psf_mark_resolved RPCs.';

create index if not exists idx_psfr_feedback_id
  on public.post_service_feedback_remarks (feedback_id);

-- ─── 3. CRE queue view — low-rated, responded feedback + resolved SA name ──
create or replace view public.post_service_feedback_cre_queue as
select
  m.id,
  m.job_card_closed_data_id,
  m.customer_name,
  m.mobile_number,
  m.vehicle_registration_number,
  m.job_card_number,
  m.closed_date,
  m.rating,
  m.feedback_text,
  m.responded_at,
  m.cre_status,
  m.resolved_at,
  m.resolved_by_name,
  coalesce(em.employee_name, jc.sr_assigned_to) as service_advisor_name
from public.post_service_feedback_messages m
left join public.job_card_closed_data jc on jc.id = m.job_card_closed_data_id
left join public.employee_master em      on em.employee_code = jc.employee_code
where m.status = 'responded'
  and m.rating is not null
  and m.rating <= 3;

comment on view public.post_service_feedback_cre_queue is
  'CRE follow-up queue: responded feedback rows with rating <= 3, joined to the resolved Service Advisor name.';

-- ─── 4. RPCs: add remark / mark resolved (actor + timestamp server-stamped) ─
create or replace function public.psf_add_remark(p_feedback_id bigint, p_remark text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  if not (public.is_admin() or public.has_module_modify('post_service_feedback_cre')) then
    raise exception 'Insufficient permissions';
  end if;

  if p_remark is null or btrim(p_remark) = '' then
    raise exception 'Remark cannot be empty';
  end if;

  select coalesce(u.full_name, auth.jwt()->>'email')
  into v_actor_name
  from public.users u
  where u.id = auth.uid();

  if v_actor_name is null then
    v_actor_name := coalesce(auth.jwt()->>'email', 'Unknown');
  end if;

  insert into public.post_service_feedback_remarks
    (feedback_id, remark, created_by_id, created_by_name, is_resolution)
  values
    (p_feedback_id, btrim(p_remark), auth.uid(), v_actor_name, false);

  update public.post_service_feedback_messages
  set cre_status = case when cre_status = 'open' then 'in_progress' else cre_status end,
      updated_at = now()
  where id = p_feedback_id;

  if not found then
    raise exception 'Feedback row not found: %', p_feedback_id;
  end if;

  return jsonb_build_object('ok', true, 'actor_name', v_actor_name);
end;
$$;

comment on function public.psf_add_remark(bigint, text) is
  'Logs a CRE call remark against a post_service_feedback_messages row; flips open->in_progress. Actor/timestamp are server-derived, never client-supplied.';

create or replace function public.psf_mark_resolved(p_feedback_id bigint, p_remark text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
  v_now timestamptz := now();
begin
  if not (public.is_admin() or public.has_module_modify('post_service_feedback_cre')) then
    raise exception 'Insufficient permissions';
  end if;

  if p_remark is null or btrim(p_remark) = '' then
    raise exception 'A closing remark is required to mark this resolved';
  end if;

  select coalesce(u.full_name, auth.jwt()->>'email')
  into v_actor_name
  from public.users u
  where u.id = auth.uid();

  if v_actor_name is null then
    v_actor_name := coalesce(auth.jwt()->>'email', 'Unknown');
  end if;

  insert into public.post_service_feedback_remarks
    (feedback_id, remark, created_by_id, created_by_name, is_resolution)
  values
    (p_feedback_id, btrim(p_remark), auth.uid(), v_actor_name, true);

  update public.post_service_feedback_messages
  set cre_status       = 'resolved',
      resolved_at       = v_now,
      resolved_by_id    = auth.uid(),
      resolved_by_name  = v_actor_name,
      updated_at        = v_now
  where id = p_feedback_id;

  if not found then
    raise exception 'Feedback row not found: %', p_feedback_id;
  end if;

  return jsonb_build_object('ok', true, 'resolved_at', v_now, 'resolved_by_name', v_actor_name);
end;
$$;

comment on function public.psf_mark_resolved(bigint, text) is
  'Marks a post_service_feedback_messages row resolved with a closing remark. resolved_at/resolved_by_* are server-derived, never client-supplied.';

grant execute on function public.psf_add_remark(bigint, text) to authenticated;
grant execute on function public.psf_mark_resolved(bigint, text) to authenticated;

-- ─── 5. RLS: view-only for authenticated users with module access; all ─────
--          writes go through the SECURITY DEFINER RPCs above (or the
--          service-role edge functions, which bypass RLS entirely).
alter table public.post_service_feedback_messages enable row level security;
alter table public.post_service_feedback_remarks   enable row level security;

drop policy if exists view_post_service_feedback on public.post_service_feedback_messages;
create policy view_post_service_feedback
  on public.post_service_feedback_messages
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_module_view('auto_service_reminder')
    or public.has_module_view('post_service_feedback_cre')
  );

drop policy if exists view_post_service_feedback_remarks on public.post_service_feedback_remarks;
create policy view_post_service_feedback_remarks
  on public.post_service_feedback_remarks
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_module_view('post_service_feedback_cre')
  );

-- ─── 6. Register the module ──────────────────────────────────────────────
select setval(pg_get_serial_sequence('public.modules', 'id'), (select coalesce(max(id), 1) from public.modules));

insert into public.modules (name, label, description, icon, route, sort_order, is_active)
values ('post_service_feedback_cre', 'Post Service Feedback', 'CRE follow-up queue for low-rated post-service feedback', 'message-circle', '/post-service-feedback', 25, true)
on conflict (name) do nothing;

commit;
