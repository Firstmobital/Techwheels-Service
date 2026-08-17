-- Post-apply checks for 20260817130000_fix_generate_complaint_link_pgcrypto.sql

SELECT p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'generate_complaint_link';

SELECT pg_get_functiondef(p.oid) LIKE '%extensions.gen_random_bytes%' AS uses_extensions_pgcrypto
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'generate_complaint_link';

SELECT has_function_privilege(
  'authenticated',
  'public.generate_complaint_link(bigint)',
  'EXECUTE'
) AS rpc_execute;
