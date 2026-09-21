-- CRE calling list for successfully sent PSF messages with no rating yet.
-- Does not widen post_service_feedback_cre_queue (still responded + rating not null).
-- Same joins as the existing CRE queue. No new table. No new RPCs.

begin;

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
  jc.branch_label as branch
from public.post_service_feedback_messages m
left join public.job_card_closed_data jc on jc.id = m.job_card_closed_data_id
left join public.employee_master em      on em.employee_code = jc.employee_code
where m.sent_at is not null
  and m.rating is null;

comment on view public.post_service_feedback_cre_unrated is
  'Successfully sent post-service feedback with no rating yet (sent_at is not null and rating is null). Same SA/service-type/branch joins as post_service_feedback_cre_queue. Failed/unsent rows are excluded.';

grant all on table public.post_service_feedback_cre_unrated to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
