-- Complaints module pgTAP contract tests
--
-- Purpose:
--   Add executable pgTAP tests for pending hardening items without depending on
--   mutable fixture data. These tests validate critical function contracts via
--   pg_get_functiondef() assertions.
--
-- Coverage:
--   1) Single-use raise safeguards
--   2) Tenant isolation guard rails in staff RPCs
--   3) Internal notes hidden from customer-facing RPC
--   4) SLA breach/escalation logic contract
--   5) RBAC permission gate presence in staff RPCs

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
CREATE SCHEMA IF NOT EXISTS complaints_test;

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
    position('status = ''active''' IN v_def) > 0,
    'raise_complaint checks active link status before creating ticket'
  );

  RETURN QUERY SELECT ok(
    position('FOR UPDATE' IN v_def) > 0,
    'raise_complaint locks access link row to enforce single-use under concurrency'
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

CREATE OR REPLACE FUNCTION complaints_test.test_suite__complaint_tenant_isolation()
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
DECLARE
  v_def text;
  v_fn regprocedure;
BEGIN
  RETURN QUERY SELECT plan(21);

  FOR v_fn IN
    SELECT unnest(ARRAY[
      'public.acknowledge(bigint)'::regprocedure,
      'public.start_progress(bigint)'::regprocedure,
      'public.resolve(bigint)'::regprocedure,
      'public.close(bigint)'::regprocedure,
      'public.set_priority(bigint,text)'::regprocedure,
      'public.reassign(bigint,uuid)'::regprocedure,
      'public.escalate(bigint,text)'::regprocedure
    ])
  LOOP
    SELECT pg_get_functiondef(v_fn) INTO v_def;

    RETURN QUERY SELECT ok(
      position('v_is_admin boolean := public.is_admin();' IN v_def) > 0,
      v_fn::text || ' loads admin context'
    );

    RETURN QUERY SELECT ok(
      position('AND dealer_code = v_dealer_code' IN v_def) > 0,
      v_fn::text || ' enforces dealer scope for non-admin path'
    );

    RETURN QUERY SELECT ok(
      position('IF NOT FOUND THEN' IN v_def) > 0,
      v_fn::text || ' raises when no row is updated (no false success)'
    );
  END LOOP;

  RETURN QUERY SELECT * FROM finish();
END;
$$;

CREATE OR REPLACE FUNCTION complaints_test.test_suite__internal_notes_hidden_from_customers()
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.get_complaint_by_token(text)'::regprocedure)
  INTO v_def;

  RETURN QUERY SELECT plan(3);

  RETURN QUERY SELECT ok(
    position('FROM public.complaint_messages' IN v_def) > 0,
    'get_complaint_by_token reads complaint_messages'
  );

  RETURN QUERY SELECT ok(
    position('AND is_internal = false' IN v_def) > 0,
    'get_complaint_by_token filters internal notes from customer response'
  );

  RETURN QUERY SELECT ok(
    position('''messages''' IN v_def) > 0,
    'get_complaint_by_token includes filtered messages in payload'
  );

  RETURN QUERY SELECT * FROM finish();
END;
$$;

CREATE OR REPLACE FUNCTION complaints_test.test_suite__sla_breach_detection()
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.check_complaint_sla_breaches()'::regprocedure)
  INTO v_def;

  RETURN QUERY SELECT plan(5);

  RETURN QUERY SELECT ok(
    position('SET response_breached = true' IN v_def) > 0,
    'SLA sweep marks response breaches'
  );

  RETURN QUERY SELECT ok(
    position('SET resolution_breached = true' IN v_def) > 0,
    'SLA sweep marks resolution breaches'
  );

  RETURN QUERY SELECT ok(
    position('is_escalated = true' IN v_def) > 0,
    'SLA sweep auto-escalates breached tickets'
  );

  RETURN QUERY SELECT ok(
    position('WHERE (response_breached = true OR resolution_breached = true)' IN v_def) > 0,
    'Auto-escalation condition is tied to breach flags'
  );

  RETURN QUERY SELECT ok(
    position('RETURNS TABLE(breached_count integer, escalated_count integer)' IN v_def) > 0,
    'SLA sweep exposes breach and escalation counters'
  );

  RETURN QUERY SELECT * FROM finish();
END;
$$;

CREATE OR REPLACE FUNCTION complaints_test.test_suite__complaint_rbac()
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
DECLARE
  v_def text;
  v_fn regprocedure;
BEGIN
  RETURN QUERY SELECT plan(14);

  FOR v_fn IN
    SELECT unnest(ARRAY[
      'public.acknowledge(bigint)'::regprocedure,
      'public.start_progress(bigint)'::regprocedure,
      'public.resolve(bigint)'::regprocedure,
      'public.close(bigint)'::regprocedure,
      'public.set_priority(bigint,text)'::regprocedure,
      'public.reassign(bigint,uuid)'::regprocedure,
      'public.escalate(bigint,text)'::regprocedure
    ])
  LOOP
    SELECT pg_get_functiondef(v_fn) INTO v_def;

    RETURN QUERY SELECT ok(
      position('has_module_modify(''complaints'')' IN v_def) > 0,
      v_fn::text || ' checks complaints modify permission'
    );

    RETURN QUERY SELECT ok(
      position('RAISE EXCEPTION ''Insufficient permissions''' IN v_def) > 0,
      v_fn::text || ' raises explicit permission error when unauthorized'
    );
  END LOOP;

  RETURN QUERY SELECT * FROM finish();
END;
$$;

-- Convenience aggregate runner for CI / manual SQL execution.
CREATE OR REPLACE FUNCTION complaints_test.test_suite__complaints_all()
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY SELECT * FROM complaints_test.test_suite__raise_complaint_single_use();
  RETURN QUERY SELECT * FROM complaints_test.test_suite__complaint_tenant_isolation();
  RETURN QUERY SELECT * FROM complaints_test.test_suite__internal_notes_hidden_from_customers();
  RETURN QUERY SELECT * FROM complaints_test.test_suite__sla_breach_detection();
  RETURN QUERY SELECT * FROM complaints_test.test_suite__complaint_rbac();
END;
$$;

COMMIT;
