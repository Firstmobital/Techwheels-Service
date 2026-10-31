-- Read-only checks for 20261031103000_customer_session_touch_mobile_017.sql

SELECT to_regprocedure('public.customer_touch_session(text)') IS NOT NULL
  AS customer_touch_session_should_exist;

SELECT has_function_privilege('anon', 'public.customer_touch_session(text)', 'execute')
  AS anon_can_touch_session_should_be_true;

SELECT has_function_privilege('authenticated', 'public.customer_touch_session(text)', 'execute')
  AS authenticated_can_touch_session_should_be_true;

-- Definition smoke: start_session comment mentions MOBILE-017 revoke (manual apply required for live test)
SELECT obj_description('public.customer_start_session(text,text)'::regprocedure, 'pg_proc')
  LIKE '%MOBILE-017%'
  AS start_session_comment_should_mention_mobile_017;
