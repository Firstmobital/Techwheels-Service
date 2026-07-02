-- Add service_type (job_card_closed_data.sr_type) to the CRE feedback queue view.
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
  jc.sr_type as service_type
from public.post_service_feedback_messages m
left join public.job_card_closed_data jc on jc.id = m.job_card_closed_data_id
left join public.employee_master em      on em.employee_code = jc.employee_code
where m.status = 'responded'
  and m.rating is not null
  and m.rating <= 3;

comment on view public.post_service_feedback_cre_queue is
  'CRE follow-up queue: responded feedback rows with rating <= 3, joined to the resolved Service Advisor name and service type (job_card_closed_data.sr_type).';

commit;
