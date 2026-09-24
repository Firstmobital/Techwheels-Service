-- One current next-follow-up date per post-service feedback case.
-- Authoritative column lives on post_service_feedback_messages.
-- Remarks stay an append-only history and do not store a second active date.
-- Resolved cases keep the date; Today's Follow-ups excludes them.

begin;

alter table public.post_service_feedback_messages
  add column if not exists next_follow_up_date date;

comment on column public.post_service_feedback_messages.next_follow_up_date is
  'Current CRE next-follow-up calendar date for this feedback case. One value per case. Null means no follow-up is scheduled. Not cleared when the case is resolved.';

create index if not exists idx_psfm_next_follow_up_date
  on public.post_service_feedback_messages (next_follow_up_date)
  where next_follow_up_date is not null;

-- ─── Existing read models: append the authoritative date only ───────────────

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
  coalesce(em.employee_name, jc.sr_assigned_to) as service_advisor_name,
  jc.sr_type as service_type,
  m.review_link_sent,
  jc.branch_label as branch,
  m.next_follow_up_date
from public.post_service_feedback_messages m
left join public.job_card_closed_data jc on jc.id = m.job_card_closed_data_id
left join public.employee_master em      on em.employee_code = jc.employee_code
where m.status = 'responded'
  and m.rating is not null;

comment on view public.post_service_feedback_cre_queue is
  'All responded post-service feedback (any rating), joined to the resolved Service Advisor name, service type, and branch. Frontend splits into "needs follow-up" (<=3) vs "positive" (>=4) tabs.';

create or replace view public.post_service_feedback_cre_unrated as
select
  m.id,
  m.job_card_closed_data_id,
  m.customer_name,
  m.mobile_number,
  m.vehicle_registration_number,
  m.job_card_number,
  m.closed_date,
  m.sent_at,
  m.rating,
  m.feedback_text,
  m.responded_at,
  m.cre_status,
  m.resolved_at,
  m.resolved_by_name,
  coalesce(em.employee_name, jc.sr_assigned_to) as service_advisor_name,
  jc.sr_type as service_type,
  m.review_link_sent,
  jc.branch_label as branch,
  m.next_follow_up_date
from public.post_service_feedback_messages m
left join public.job_card_closed_data jc on jc.id = m.job_card_closed_data_id
left join public.employee_master em      on em.employee_code = jc.employee_code
where m.sent_at is not null
  and m.rating is null;

comment on view public.post_service_feedback_cre_unrated is
  'Successfully sent post-service feedback with no rating yet (sent_at is not null and rating is null). Same SA/service-type/branch joins as post_service_feedback_cre_queue. Failed/unsent rows are excluded.';

-- Neither existing view contains both actionable populations, so Today's
-- Follow-ups needs one read projection. It is not a second workflow.
-- Date membership uses the Asia/Kolkata calendar date, not a UTC day boundary.
-- Resolved cases are excluded here; next_follow_up_date is left on the row.
create or replace view public.post_service_feedback_cre_due_today as
select
  m.id,
  m.job_card_closed_data_id,
  m.customer_name,
  m.mobile_number,
  m.vehicle_registration_number,
  m.job_card_number,
  m.closed_date,
  m.sent_at,
  m.rating,
  m.feedback_text,
  m.responded_at,
  m.cre_status,
  m.resolved_at,
  m.resolved_by_name,
  coalesce(em.employee_name, jc.sr_assigned_to) as service_advisor_name,
  jc.sr_type as service_type,
  m.review_link_sent,
  jc.branch_label as branch,
  m.next_follow_up_date
from public.post_service_feedback_messages m
left join public.job_card_closed_data jc on jc.id = m.job_card_closed_data_id
left join public.employee_master em      on em.employee_code = jc.employee_code
where m.next_follow_up_date = (timezone('Asia/Kolkata', now()))::date
  and m.cre_status <> 'resolved'
  and (
    (m.status = 'responded' and m.rating is not null and m.rating <= 3)
    or (m.sent_at is not null and m.rating is null)
  );

comment on view public.post_service_feedback_cre_due_today is
  'Actionable CRE cases whose authoritative next_follow_up_date is today in Asia/Kolkata. Includes responded ratings <= 3 and sent-unrated messages. Excludes resolved cases and positive ratings. Service date is closed_date and is not used for membership.';

grant all on table public.post_service_feedback_cre_due_today to anon, authenticated, service_role;

-- ─── RPCs: same remark workflow, optional authoritative date update ─────────
-- Drop the 2-arg signatures so PostgREST sees one function. Defaults keep
-- existing callers from changing the date.

drop function if exists public.psf_add_remark(bigint, text);

create or replace function public.psf_add_remark(
  p_feedback_id bigint,
  p_remark text,
  p_next_follow_up_date date default null,
  p_set_next_follow_up_date boolean default false
)
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
      next_follow_up_date = case
        when p_set_next_follow_up_date then p_next_follow_up_date
        else next_follow_up_date
      end,
      updated_at = now()
  where id = p_feedback_id;

  if not found then
    raise exception 'Feedback row not found: %', p_feedback_id;
  end if;

  return jsonb_build_object('ok', true, 'actor_name', v_actor_name);
end;
$$;

comment on function public.psf_add_remark(bigint, text, date, boolean) is
  'Logs a CRE call remark and optionally replaces the case next_follow_up_date. When p_set_next_follow_up_date is false the existing date is left unchanged, including when another remark is added. Actor/timestamp are server-derived.';

drop function if exists public.psf_mark_resolved(bigint, text);

create or replace function public.psf_mark_resolved(
  p_feedback_id bigint,
  p_remark text,
  p_next_follow_up_date date default null,
  p_set_next_follow_up_date boolean default false
)
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

  -- Resolution does not clear next_follow_up_date. The date stays for history.
  -- Today's Follow-ups excludes cre_status = resolved.
  update public.post_service_feedback_messages
  set cre_status = 'resolved',
      resolved_at = v_now,
      resolved_by_id = auth.uid(),
      resolved_by_name = v_actor_name,
      next_follow_up_date = case
        when p_set_next_follow_up_date then p_next_follow_up_date
        else next_follow_up_date
      end,
      updated_at = v_now
  where id = p_feedback_id;

  if not found then
    raise exception 'Feedback row not found: %', p_feedback_id;
  end if;

  return jsonb_build_object('ok', true, 'resolved_at', v_now, 'resolved_by_name', v_actor_name);
end;
$$;

comment on function public.psf_mark_resolved(bigint, text, date, boolean) is
  'Marks a post_service_feedback_messages row resolved with a closing remark. Does not clear next_follow_up_date unless the caller explicitly sets a new value. resolved_at/resolved_by_* are server-derived.';

grant execute on function public.psf_add_remark(bigint, text, date, boolean) to anon, authenticated, service_role;
grant execute on function public.psf_mark_resolved(bigint, text, date, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
