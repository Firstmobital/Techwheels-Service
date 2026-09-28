begin;

select plan(5);

select has_column('public', 'post_service_feedback_messages', 'remarked_at', 'has remarked_at column');
select has_column('public', 'post_service_feedback_messages', 'rating_at', 'has rating_at column');

select has_function('public', 'psf_get_today_productivity', 'has psf_get_today_productivity RPC');

select function_returns('public', 'psf_get_today_productivity', '{}'::text[], 'jsonb', 'psf_get_today_productivity returns jsonb');

select ok(
  (
    select has_table_privilege('anon', 'public.post_service_feedback_messages', 'SELECT')
  ),
  'psf messages table continues to allow select'
);

select * from finish();

rollback;
