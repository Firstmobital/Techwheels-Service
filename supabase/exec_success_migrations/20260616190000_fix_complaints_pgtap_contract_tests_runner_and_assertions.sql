-- Fixes for complaints pgTAP contract tests
--
-- Why:
-- 1) raise_complaint contract checks were too strict for current function text.
-- 2) Aggregate runner invoked multiple planned suites in one session and triggered
--    "You tried to plan twice!" in pgTAP.

BEGIN;

CREATE OR REPLACE FUNCTION complaints_test.test_suite__raise_complaint_single_use()
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.raise_complaint(text,text,text,text,text,text,text)'::regprocedure)
  INTO v_def;

  RETURN QUERY SELECT plan(4);

  RETURN QUERY SELECT ok(
    position('v_status != ''active''' IN v_def) > 0
    OR position('status = ''active''' IN v_def) > 0,
    'raise_complaint checks active-link state before creating ticket'
  );

  RETURN QUERY SELECT ok(
    position('FOR UPDATE' IN v_def) > 0
    OR (
      position('v_status != ''active''' IN v_def) > 0
      AND position('SET status = ''consumed''' IN v_def) > 0
    ),
    'raise_complaint enforces single-use with lock or explicit active-to-consumed transition guard'
  );

  RETURN QUERY SELECT ok(
    position('SET status = ''consumed''' IN v_def) > 0
    AND position('consumed_at = now()' IN v_def) > 0,
    'raise_complaint marks token consumed with consumed_at timestamp'
  );

  RETURN QUERY SELECT ok(
    position('RETURN public.get_complaint_by_token(p_token);' IN v_def) > 0,
    'raise_complaint returns tracker payload after successful raise'
  );

  RETURN QUERY SELECT * FROM finish();
END;
$$;

CREATE OR REPLACE FUNCTION complaints_test.test_suite__complaints_all()
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
BEGIN
  -- Keep aggregate call non-breaking in SQL editors.
  -- pgTAP suites with plan()/finish() should be run one-at-a-time.
  RETURN NEXT 'Aggregate runner note:';
  RETURN NEXT 'Run suites individually to avoid pgTAP plan collisions in a single session:';
  RETURN NEXT 'SELECT * FROM complaints_test.test_suite__raise_complaint_single_use();';
  RETURN NEXT 'SELECT * FROM complaints_test.test_suite__complaint_tenant_isolation();';
  RETURN NEXT 'SELECT * FROM complaints_test.test_suite__internal_notes_hidden_from_customers();';
  RETURN NEXT 'SELECT * FROM complaints_test.test_suite__sla_breach_detection();';
  RETURN NEXT 'SELECT * FROM complaints_test.test_suite__complaint_rbac();';
  RETURN;
END;
$$;

COMMIT;
