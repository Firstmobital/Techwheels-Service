-- CRE-entered rating for Post Service Feedback cases.
-- public.post_service_feedback_messages.rating stays the customer WhatsApp
-- score (source truth). cre_rating is the manual override. effective_rating
-- is the single classification value: cre_rating when set, otherwise rating.
-- Bot routing still keys off rating/status/cre_status and is not changed.

begin;

alter table public.post_service_feedback_messages
  add column if not exists cre_rating smallint
    constraint psfm_cre_rating_check
      check (cre_rating is null or (cre_rating between 1 and 5));

comment on column public.post_service_feedback_messages.rating is
  'Customer-submitted WhatsApp rating (1-5), or null when the customer has not responded. Source feedback. CRE workflow must not overwrite this column.';

comment on column public.post_service_feedback_messages.cre_rating is
  'CRE-entered rating (1-5) for workflow classification. Null means no manual rating. Does not replace rating or feedback_text.';

alter table public.post_service_feedback_messages
  add column if not exists effective_rating smallint
    generated always as (coalesce(cre_rating, rating)) stored;

comment on column public.post_service_feedback_messages.effective_rating is
  'Authoritative rating for CRE tab classification. cre_rating when present, otherwise the customer rating. Null means no rating.';

create index if not exists idx_psfm_effective_rating
  on public.post_service_feedback_messages (effective_rating)
  where sent_at is not null;

-- ─── Read models classify on effective_rating ───────────────────────────────

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
  m.next_follow_up_date,
  m.cre_rating,
  m.effective_rating
from public.post_service_feedback_messages m
left join public.job_card_closed_data jc on jc.id = m.job_card_closed_data_id
left join public.employee_master em      on em.employee_code = jc.employee_code
where m.effective_rating is not null
  and (
    (m.status = 'responded' and m.rating is not null)
    or m.cre_rating is not null
  );

comment on view public.post_service_feedback_cre_queue is
  'Responded customer ratings plus CRE-rated cases. rating is the customer score. effective_rating classifies needs follow-up (<=3) vs positive (>=4).';

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
  m.next_follow_up_date,
  m.cre_rating,
  m.effective_rating
from public.post_service_feedback_messages m
left join public.job_card_closed_data jc on jc.id = m.job_card_closed_data_id
left join public.employee_master em      on em.employee_code = jc.employee_code
where m.sent_at is not null
  and m.effective_rating is null;

comment on view public.post_service_feedback_cre_unrated is
  'Successfully sent post-service feedback with no effective rating (sent_at is not null and coalesce(cre_rating, rating) is null). Failed/unsent rows are excluded.';

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
  m.next_follow_up_date,
  m.cre_rating,
  m.effective_rating
from public.post_service_feedback_messages m
left join public.job_card_closed_data jc on jc.id = m.job_card_closed_data_id
left join public.employee_master em      on em.employee_code = jc.employee_code
where m.next_follow_up_date = (timezone('Asia/Kolkata', now()))::date
  and m.cre_status <> 'resolved'
  and (
    (m.status = 'responded' and m.effective_rating is not null and m.effective_rating <= 3)
    or (m.sent_at is not null and m.effective_rating is null)
    or (m.sent_at is not null and m.cre_rating is not null and m.effective_rating <= 3)
  );

comment on view public.post_service_feedback_cre_due_today is
  'Actionable CRE cases whose next_follow_up_date is today in Asia/Kolkata. Includes effective ratings <= 3 and sent-unrated messages. Excludes resolved cases and effective ratings >= 4. Membership is not service date.';

-- ─── RPC: set CRE rating only ───────────────────────────────────────────────

create or replace function public.psf_set_cre_rating(
  p_feedback_id bigint,
  p_cre_rating smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rating smallint;
  v_effective smallint;
begin
  if not (public.is_admin() or public.has_module_modify('post_service_feedback_cre')) then
    raise exception 'Insufficient permissions';
  end if;

  if p_cre_rating is null or p_cre_rating < 1 or p_cre_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  update public.post_service_feedback_messages
  set cre_rating = p_cre_rating,
      updated_at = now()
  where id = p_feedback_id
  returning rating, effective_rating into v_rating, v_effective;

  if not found then
    raise exception 'Feedback row not found: %', p_feedback_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'cre_rating', p_cre_rating,
    'rating', v_rating,
    'effective_rating', v_effective
  );
end;
$$;

comment on function public.psf_set_cre_rating(bigint, smallint) is
  'Sets cre_rating for workflow classification. Does not change customer rating, feedback_text, follow-up date, remarks, or resolution.';

grant execute on function public.psf_set_cre_rating(bigint, smallint) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
