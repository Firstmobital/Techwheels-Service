-- Smoke: function exists and is not executable by anon.
SELECT proname, prosecdef
  FROM pg_proc
 WHERE proname = 'bodyshop_bootstrap_visit_from_dms_gap';

SELECT has_function_privilege('anon', 'public.bodyshop_bootstrap_visit_from_dms_gap(text,text,text,text,text,text,text,text,date,text,text,text)', 'EXECUTE') AS anon_may_execute;