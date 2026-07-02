-- Add branch (job_card_closed_data.branch_label) to the CRE feedback queue view.
-- vehicle_registration_number was already selected by the view; this only adds branch.
-- This migration is additive-only; it does not modify any existing table data.

begin;

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
  jc.branch_label as branch
from public.post_service_feedback_messages m
left join public.job_card_closed_data jc on jc.id = m.job_card_closed_data_id
left join public.employee_master em      on em.employee_code = jc.employee_code
where m.status = 'responded'
  and m.rating is not null;

comment on view public.post_service_feedback_cre_queue is
  'All responded post-service feedback (any rating), joined to the resolved Service Advisor name, service type, and branch. Frontend splits into "needs follow-up" (<=3) vs "positive" (>=4) tabs.';

commit;
