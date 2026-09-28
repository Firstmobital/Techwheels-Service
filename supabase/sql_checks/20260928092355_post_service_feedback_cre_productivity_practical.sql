begin;

select plan(5);

-- Rewrite tests in proper pgTap
create temp table test_psf_id (id bigint);

insert into public.post_service_feedback_messages
  (job_card_closed_data_id, mobile_number, status, sent_at, rating, closed_date)
values
  (1, '9999999999', 'responded', now() - interval '1 day', 5, current_date)
returning id;

insert into test_psf_id select max(id) from public.post_service_feedback_messages;

select public.psf_add_remark((select id from test_psf_id), 'test remark');

select is(
  (public.psf_get_today_productivity()->>'inProgress'),
  '1',
  'inProgress should be 1 after remark'
);

select is(
  (public.psf_get_today_productivity()->>'total'),
  '1',
  'total should be 1 after remark'
);

select public.psf_set_cre_rating((select id from test_psf_id), 2::smallint);

select is(
  (public.psf_get_today_productivity()->>'needsFollowup'),
  '1',
  'needsFollowup should be 1 after 2 star rating'
);

select is(
  (public.psf_get_today_productivity()->>'total'),
  '1',
  'total should still be 1 after rating change on same case'
);

select public.psf_mark_resolved((select id from test_psf_id), 'closing remark');

select is(
  (public.psf_get_today_productivity()->>'resolved'),
  '1',
  'resolved should be 1 after marking resolved'
);

select * from finish();

rollback;
