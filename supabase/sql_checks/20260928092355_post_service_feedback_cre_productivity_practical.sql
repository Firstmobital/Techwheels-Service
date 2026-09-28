begin;

select plan(5);

create temp table test_psf_id (id bigint);
create temp table prod_before (state jsonb);

insert into prod_before select public.psf_get_today_productivity();

insert into public.post_service_feedback_messages
  (job_card_closed_data_id, mobile_number, status, sent_at, rating, closed_date, scheduled_for_date)
values
  (1, '9999999999', 'responded', now() - interval '1 day', 5, current_date, current_date)
returning id;

insert into test_psf_id select max(id) from public.post_service_feedback_messages;

-- Add remark equivalent
update public.post_service_feedback_messages
set cre_status = 'in_progress', remarked_at = now()
where id = (select id from test_psf_id);

select is(
  ((public.psf_get_today_productivity()->>'inProgress')::int - ((select state from prod_before)->>'inProgress')::int),
  1,
  'inProgress should increase by 1 after remark'
);

select is(
  ((public.psf_get_today_productivity()->>'total')::int - ((select state from prod_before)->>'total')::int),
  1,
  'total should increase by 1 after remark'
);

-- Set rating equivalent
update public.post_service_feedback_messages
set cre_rating = 2, rating_at = now()
where id = (select id from test_psf_id);

select is(
  ((public.psf_get_today_productivity()->>'needsFollowup')::int - ((select state from prod_before)->>'needsFollowup')::int),
  1,
  'needsFollowup should increase by 1 after 2 star rating'
);

select is(
  ((public.psf_get_today_productivity()->>'total')::int - ((select state from prod_before)->>'total')::int),
  1,
  'total should still be +1 relative to start after rating change on same case'
);

-- Mark resolved equivalent
update public.post_service_feedback_messages
set cre_status = 'resolved', resolved_at = now()
where id = (select id from test_psf_id);

select is(
  ((public.psf_get_today_productivity()->>'resolved')::int - ((select state from prod_before)->>'resolved')::int),
  1,
  'resolved should increase by 1 after marking resolved'
);

select * from finish();

rollback;
