-- MOBILE-015: live DB audit (all should be true after full apply)
-- If anything is false, run 20260926180000_mobile_015_metadata_gap_fill.sql (or re-run 20260926170000).

SELECT public.is_floor_incharge_service_type('Mini Paid Service') AS mini_paid_is_floor;

SELECT NOT public.is_floor_incharge_service_type('Accident') AS accident_not_floor;

SELECT pg_get_functiondef(p.oid) LIKE '%Mini Paid Service%' AS is_floor_includes_mini_paid
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_floor_incharge_service_type';

SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'customer_get_mechanical_case'
) AS rpc_mechanical_case_exists;

SELECT pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_payment_lines%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%payment_notes%'
  AS mechanical_case_no_internal_notes
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'customer_get_mechanical_case';

SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'customer_resolve_visit_kind'
) AS rpc_resolve_visit_kind_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'customer_get_visit_context'
) AS rpc_visit_context_exists;

SELECT pg_get_functiondef(p.oid) LIKE '%visit_kind%'
  AND pg_get_functiondef(p.oid) LIKE '%customer_resolve_visit_kind%'
  AS active_job_returns_visit_kind
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'customer_get_active_job';

SELECT public.customer_resolve_visit_kind(
  jsonb_build_object('source', 'reception', 'service_type', 'Mini Paid Service')
) = 'mechanical' AS visit_kind_mini_paid_mechanical;

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'service_reception_entries'
    AND column_name = 'gate_pass_issued'
) AS column_gate_pass_issued;

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'service_reception_entries'
    AND column_name = 'gate_pass_number'
) AS column_gate_pass_number;

SELECT EXISTS (
  SELECT 1 FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'customer_get_mechanical_case'
    AND privilege_type = 'EXECUTE'
    AND grantee = 'anon'
) AS mechanical_case_grant_anon;

SELECT EXISTS (
  SELECT 1 FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'customer_get_mechanical_case'
    AND privilege_type = 'EXECUTE'
    AND grantee = 'authenticated'
) AS mechanical_case_grant_authenticated;
